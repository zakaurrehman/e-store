import { describe, expect, it } from "vitest";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { setStoreStatus } from "@/features/stores/service";
import { countUnreadOwnerTickets, getOwnerTicket, listOwnerTickets, listSupportConversations } from "@/features/support/queries";
import { addReply, markConversationRead, openConversation, setConversationStatus } from "@/features/support/service";
import { recordDeposit, requestPayout } from "@/features/wallet/service";
import { ContactStatus, StoreStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { dispatchNotification } from "@/server/notifications";
import { invitation } from "./helpers";

let sequence = 0;

async function owner() {
  sequence += 1;
  return openStoreForNewOwner({
    storeName: `Ticket Store ${sequence}`,
    firstName: "Tess",
    lastName: "Owner",
    email: `ticket.owner.${sequence}.${Date.now()}@example.com`,
    password: "Correct-horse-battery-7",
    referralCode: await invitation(),
  });
}

async function staff() {
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  return db.user.upsert({ where: { email: "ticket.staff@example.com" }, create: { email: "ticket.staff@example.com", firstName: "Sasha", lastName: "Staff", roleId: role.id }, update: {} });
}

const ask = (user: { id: string; email: string }, subject: string, message: string, extra: { depositId?: string; payoutId?: string } = {}) =>
  openConversation({ storeId: null, userId: user.id, name: "Tess Owner", email: user.email, subject, message, ...extra });

describe("an owner's conversation with Zendropship", () => {
  it("carries the whole thread both ways, with unread marks on each side", async () => {
    const { user } = await owner();
    const agent = await staff();
    const ticket = await ask(user, "Deposit not credited", "I sent USDT two hours ago, reference 0xabc.");

    // Staff see it in their inbox, unread; the owner sees it with no unread reply yet.
    expect((await listSupportConversations({ scope: "platform" })).conversations.map((row) => row.id)).toContain(ticket.id);
    expect(await countUnreadOwnerTickets(user.id)).toBe(0);
    await markConversationRead(ticket.id, "staff");

    // Staff reply: the owner has something new to read.
    const { reply } = await addReply(ticket.id, "Found it — crediting now.", { kind: "agent", userId: agent.id });
    expect(await countUnreadOwnerTickets(user.id)).toBe(1);
    const unread = await getOwnerTicket(user.id, ticket.id);
    expect(unread?.unreadForCustomer).toBe(true);
    expect(unread?.status).toBe(ContactStatus.IN_PROGRESS);
    expect(unread?.replies.map((row) => row.body)).toEqual(["Found it — crediting now."]);

    // The owner is emailed as well as told in the dashboard.
    const deliveries = await dispatchNotification({ type: "contact.replied", messageId: ticket.id, replyId: reply.id });
    expect((await db.notificationDelivery.findFirstOrThrow({ where: { id: { in: deliveries } } })).recipient).toBe(user.email);

    // Opening the thread clears the mark; writing back puts it on the staff side.
    await markConversationRead(ticket.id, "customer");
    expect(await countUnreadOwnerTickets(user.id)).toBe(0);
    await addReply(ticket.id, "Thank you — I can see it now.", { kind: "customer", userId: user.id });
    const afterOwnerReply = await db.contactMessage.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(afterOwnerReply.unreadForStaff).toBe(true);
    expect(afterOwnerReply.status).toBe(ContactStatus.NEW);

    // Both turns are kept, in order, with their times.
    const thread = await getOwnerTicket(user.id, ticket.id);
    expect(thread?.replies.map((row) => row.body)).toEqual(["Found it — crediting now.", "Thank you — I can see it now."]);
    expect(thread?.replies.map((row) => row.isFromCustomer)).toEqual([false, true]);
    expect(thread!.replies[0].createdAt.getTime()).toBeLessThanOrEqual(thread!.replies[1].createdAt.getTime());
  });

  it("keeps internal notes away from the owner, and survives being resolved and reopened", async () => {
    const { user } = await owner();
    const agent = await staff();
    const ticket = await ask(user, "Parcel never arrived", "Order VY-1234-5678 was marked delivered but the customer has nothing.");

    await addReply(ticket.id, "Courier claim opened — do not tell the owner the claim reference.", { kind: "agent", userId: agent.id, internal: true });
    await addReply(ticket.id, "We have opened a claim with the courier.", { kind: "agent", userId: agent.id }, { resolve: true });

    const thread = await getOwnerTicket(user.id, ticket.id);
    expect(thread?.replies.map((row) => row.body)).toEqual(["We have opened a claim with the courier."]);
    expect(thread?.status).toBe(ContactStatus.RESOLVED);

    // Writing again reopens it for staff.
    await addReply(ticket.id, "Any news?", { kind: "customer", userId: user.id });
    expect((await db.contactMessage.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe(ContactStatus.NEW);
    await setConversationStatus(ticket.id, ContactStatus.RESOLVED);
    expect((await getOwnerTicket(user.id, ticket.id))?.status).toBe(ContactStatus.RESOLVED);
  });

  it("shows the deposit or withdrawal a question is about", async () => {
    const { user, store } = await owner();
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 4000, method: "CRYPTO", network: "USDT (TRC20)", reference: "0xabc123", createdById: user.id });
    const ticket = await ask(user, "Deposit still pending", "Sent this a while ago.", { depositId: deposit.id });

    const thread = await getOwnerTicket(user.id, ticket.id);
    expect(thread?.deposit).toMatchObject({ id: deposit.id, amountCents: 4000, reference: "0xabc123" });
    expect((await listOwnerTickets(user.id))[0].deposit?.amountCents).toBe(4000);

    // A withdrawal works the same way.
    await db.walletEntry.create({ data: { storeId: store.id, type: "ADJUSTMENT", amountCents: 5000, description: "Test float" } });
    const payout = await requestPayout({ storeId: store.id, amountCents: 3000, method: "PAYPAL", destination: "owner@example.com", requestedById: user.id });
    const second = await ask(user, "Where is my withdrawal?", "It has been three days.", { payoutId: payout.id });
    expect((await getOwnerTicket(user.id, second.id))?.payout).toMatchObject({ id: payout.id, amountCents: 3000 });
  });

  it("is private to the owner who wrote it, and stays reachable when their store is suspended", async () => {
    const mine = await owner();
    const theirs = await owner();
    const agent = await staff();
    const ticket = await ask(mine.user, "Question about pricing", "How do I change the markup on one product?");

    expect(await getOwnerTicket(theirs.user.id, ticket.id)).toBeNull();
    expect((await listOwnerTickets(theirs.user.id)).map((row) => row.id)).not.toContain(ticket.id);

    // A store's customer conversation is not one of these, even for its own owner.
    const inStore = await openConversation({ storeId: mine.store.id, userId: null, name: "Shopper", email: "shopper@example.com", subject: "Sizing", message: "Does it run small?" });
    expect(await getOwnerTicket(mine.user.id, inStore.id)).toBeNull();

    // Suspension is exactly when an owner needs support: the thread still works.
    await setStoreStatus(mine.store.id, StoreStatus.SUSPENDED, agent.id);
    expect((await getOwnerTicket(mine.user.id, ticket.id))?.id).toBe(ticket.id);
    await addReply(ticket.id, "Why is my store suspended?", { kind: "customer", userId: mine.user.id });
    expect((await getOwnerTicket(mine.user.id, ticket.id))?.replies).toHaveLength(1);
  });
});
