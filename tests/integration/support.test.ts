import { describe, expect, it } from "vitest";
import { addItem, createGuestCart } from "@/features/cart/service";
import { placeOrder } from "@/features/orders/service";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { addProductsToStore } from "@/features/stores/service";
import { getCustomerConversation, getStoreMessage, getSupportConversation, listCustomerConversations, listStoreMessages, listSupportConversations } from "@/features/support/queries";
import { addReply, assignConversation, markConversationRead, openConversation, setConversationStatus } from "@/features/support/service";
import { ContactStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { dispatchNotification } from "@/server/notifications";
import { createProduct, invitation, orderContext, orderInput } from "./helpers";

let sequence = 0;

async function storeWithOwner() {
  sequence += 1;
  return openStoreForNewOwner({ storeName: `Support Store ${sequence}`, firstName: "Sam", lastName: "Owner", email: `support.owner.${sequence}.${Date.now()}@example.com`, password: "Correct-horse-battery-7", referralCode: await invitation() });
}

async function customer(label: string) {
  const role = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
  return db.user.create({ data: { email: `${label}.${Date.now()}@example.com`, firstName: label, lastName: "Customer", roleId: role.id } });
}

async function staff() {
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  return db.user.upsert({ where: { email: "support.staff@example.com" }, create: { email: "support.staff@example.com", firstName: "Stella", lastName: "Staff", roleId: role.id }, update: {} });
}

describe("support conversations", () => {
  it("a customer's message reaches the store owner and Zendropship staff, and the reply comes back to the customer", async () => {
    const { user: owner, store } = await storeWithOwner();
    const other = await storeWithOwner();
    const alice = await customer("alice");

    const conversation = await openConversation({ storeId: store.id, userId: alice.id, name: "Alice Customer", email: alice.email, subject: "Where is my parcel?", message: "It has been a week and nothing has arrived." });
    expect(conversation.status).toBe(ContactStatus.NEW);
    expect(conversation.unreadForStaff).toBe(true);

    // The owner sees it; another store does not.
    expect((await listStoreMessages(store.id)).messages.map((message) => message.id)).toContain(conversation.id);
    expect((await listStoreMessages(store.id)).unread).toBe(1);
    expect((await listStoreMessages(other.store.id)).messages).toHaveLength(0);
    expect(await getStoreMessage(other.store.id, conversation.id)).toBeNull();

    // Zendropship staff see every conversation.
    const inbox = await listSupportConversations({ scope: "stores" });
    expect(inbox.conversations.map((item) => item.id)).toContain(conversation.id);

    // The owner reads it and replies.
    await markConversationRead(conversation.id, "staff");
    const { reply, conversation: answered } = await addReply(conversation.id, "It left our warehouse yesterday — tracking to follow.", { kind: "agent", userId: owner.id });
    expect(answered.status).toBe(ContactStatus.IN_PROGRESS);
    expect(answered.unreadForCustomer).toBe(true);
    expect(answered.unreadForStaff).toBe(false);

    // The customer is emailed the reply, in the store's name.
    const deliveries = await dispatchNotification({ type: "contact.replied", messageId: conversation.id, replyId: reply.id });
    const email = await db.notificationDelivery.findFirstOrThrow({ where: { id: { in: deliveries } } });
    expect(email.recipient).toBe(alice.email);
    expect((email.payload as { html: string }).html).toContain(store.name.toUpperCase());

    // …and sees it in their own inbox.
    const mine = await listCustomerConversations(alice.id, store.id);
    expect(mine.map((item) => item.id)).toEqual([conversation.id]);
    expect(mine[0].unreadForCustomer).toBe(true);
    const thread = await getCustomerConversation(alice.id, store.id, conversation.id);
    expect(thread?.replies.map((item) => item.body)).toEqual(["It left our warehouse yesterday — tracking to follow."]);
  });

  it("keeps internal notes away from the customer and the owner, and lets the conversation go on until it is resolved", async () => {
    const { store } = await storeWithOwner();
    const bob = await customer("bob");
    const agent = await staff();
    const conversation = await openConversation({ storeId: store.id, userId: bob.id, name: "Bob Customer", email: bob.email, subject: "Damaged item", message: "The glass arrived broken, can I get a replacement?" });

    await assignConversation(conversation.id, agent.id);
    await addReply(conversation.id, "Courier claim opened — check the photos first.", { kind: "agent", userId: agent.id, internal: true });
    const noted = await db.contactMessage.findUniqueOrThrow({ where: { id: conversation.id } });
    // A note changes nothing the customer can see.
    expect(noted.status).toBe(ContactStatus.NEW);
    expect(noted.unreadForCustomer).toBe(false);
    expect(noted.assignedToId).toBe(agent.id);

    await addReply(conversation.id, "Sorry about that — a replacement is on its way.", { kind: "agent", userId: agent.id });
    expect((await getCustomerConversation(bob.id, store.id, conversation.id))?.replies.map((reply) => reply.body)).toEqual(["Sorry about that — a replacement is on its way."]);
    expect((await getStoreMessage(store.id, conversation.id))?.replies.every((reply) => !reply.isInternal)).toBe(true);
    expect((await getSupportConversation(conversation.id))?.replies.some((reply) => reply.isInternal)).toBe(true);

    // The customer writes back: it is new again for the store.
    const { conversation: reopened } = await addReply(conversation.id, "Thank you! Can it come before Friday?", { kind: "customer", userId: bob.id });
    expect(reopened.status).toBe(ContactStatus.NEW);
    expect(reopened.unreadForStaff).toBe(true);

    await addReply(conversation.id, "Yes — it ships today.", { kind: "agent", userId: agent.id }, { resolve: true });
    expect((await db.contactMessage.findUniqueOrThrow({ where: { id: conversation.id } })).status).toBe(ContactStatus.RESOLVED);
    await setConversationStatus(conversation.id, ContactStatus.NEW);
    expect((await db.contactMessage.findUniqueOrThrow({ where: { id: conversation.id } })).status).toBe(ContactStatus.NEW);
  });

  it("never shows one customer another customer's conversation, and only links orders that are really theirs", async () => {
    const { user: owner, store } = await storeWithOwner();
    const carol = await customer("carol");
    const dave = await customer("dave");

    // Carol places an order in the store.
    const { product, variant } = await createProduct({ priceCents: 3000, stock: 5 });
    await addProductsToStore(store.id, [product.id], { userId: owner.id, asOwner: true });
    const { cart } = await createGuestCart(store.id);
    await addItem(cart.id, variant.id, 1);
    const placed = await placeOrder(await orderInput({ email: carol.email, paymentProvider: "cod" }), orderContext(cart.id));

    const carols = await openConversation({ storeId: store.id, userId: carol.id, name: "Carol", email: carol.email, subject: "About my order", message: "Can I change the delivery address?", orderNumber: placed.result.orderNumber });
    expect(carols.orderId).toBe(placed.result.orderId);

    // Dave quotes Carol's order number: the conversation is kept, but the order is not attached to it.
    const daves = await openConversation({ storeId: store.id, userId: dave.id, name: "Dave", email: dave.email, subject: "Fishing", message: "Tell me about this order please.", orderNumber: placed.result.orderNumber });
    expect(daves.orderId).toBeNull();

    expect(await getCustomerConversation(dave.id, store.id, carols.id)).toBeNull();
    expect((await listCustomerConversations(dave.id, store.id)).map((item) => item.id)).toEqual([daves.id]);
  });

  it("routes a customer's reply to the store owner, and a message on the platform site to Zendropship staff", async () => {
    const { user: owner, store } = await storeWithOwner();
    const erin = await customer("erin");
    const conversation = await openConversation({ storeId: store.id, userId: erin.id, name: "Erin", email: erin.email, subject: "Sizes", message: "Does the jacket run small or large?" });
    const { reply } = await addReply(conversation.id, "Also, do you ship to Canada?", { kind: "customer", userId: erin.id });
    const ownerMail = await db.notificationDelivery.findMany({ where: { id: { in: await dispatchNotification({ type: "support.customer-replied", messageId: conversation.id, replyId: reply.id }) } } });
    expect(ownerMail.map((mail) => mail.recipient)).toEqual([owner.email]);

    await staff();
    const platform = await openConversation({ storeId: null, userId: owner.id, name: "Sam Owner", email: owner.email, subject: "Deposit not credited", message: "I sent USDT two hours ago, reference 0xabc." });
    const staffInbox = await listSupportConversations({ scope: "platform" });
    expect(staffInbox.conversations.map((item) => item.id)).toContain(platform.id);
    expect((await listStoreMessages(store.id)).messages.map((item) => item.id)).not.toContain(platform.id);
  });
});
