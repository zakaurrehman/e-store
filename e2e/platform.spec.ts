import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { ADMIN_STATE, orderNumberOn, pathOf, PLATFORM_URL, SHIPPING, storeUrlFor, STORE_URL, toast, unique, waitForMail } from "./helpers";

/**
 * The whole business, end to end (see the brief's section 24): staff invite an owner, the owner opens and
 * brands a store, stocks and prices it, customers buy, the money is split and recorded, an order that
 * cannot pay for itself waits for a deposit, staff confirm the deposit and fulfil the order step by step,
 * and customer service runs between the customer, the store and Zendropship.
 */
test.describe.serial("dropshipping platform", () => {
  const stamp = unique();
  const storeName = `E2E Studio ${stamp}`;
  const ownerEmail = `e2e.owner.${stamp}@example.com`;
  const customerEmail = `e2e.customer.${stamp}@example.com`;
  const password = "Correct-horse-battery-7";
  const FIRST_PRODUCT = "amber-wood-wick-candle";
  const SECOND_PRODUCT = "heavyweight-organic-tee";
  let owner: Page;
  let adminContext: BrowserContext;
  let admin: Page;
  let invitationCode = "";
  let slug = "";
  let storeUrl = "";
  let orderNumber = "";
  let fundedOrderNumber = "";
  let fundedOrderUrl = "";
  let storePrice = "";

  test.beforeAll(async ({ browser }) => {
    owner = await (await browser.newContext({ baseURL: PLATFORM_URL })).newPage();
    adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    admin = await adminContext.newPage();
  });

  test.afterAll(async () => {
    await adminContext.close();
  });

  test("1. staff create an invitation code", async () => {
    await admin.goto("/admin/referrals");
    await admin.getByLabel("Label").fill(`E2E ${stamp}`);
    await admin.getByRole("button", { name: "Generate" }).click();
    const message = toast(admin, /Invitation ZD-[0-9A-Z]{8} is ready/);
    await expect(message).toBeVisible();
    invitationCode = /ZD-[0-9A-Z]{8}/.exec(await message.innerText())![0];
    await admin.reload();
    await expect(admin.locator("tbody tr", { hasText: invitationCode })).toContainText("Available");
  });

  test("2–3. stores are invitation-only: no code and a wrong code are refused, the invited owner opens a store", async () => {
    await owner.goto(`/catalog/p/${FIRST_PRODUCT}`);
    await expect(owner.getByText("You earn").first()).toBeVisible();
    await owner.getByRole("link", { name: "Add to my store" }).first().click();
    await owner.waitForURL(/\/start\?add=/);
    await owner.getByLabel("Store name").fill(storeName);
    await expect(owner.getByText(/is available$/)).toBeVisible();
    slug = await owner.locator("#store-slug").inputValue();
    await owner.getByLabel("First name").fill("Erin");
    await owner.getByLabel("Last name").fill("Owner");
    await owner.getByLabel("Email address").fill(ownerEmail);
    await owner.locator("#start-password").fill(password);

    await owner.getByRole("button", { name: "Create my store" }).click();
    await expect(owner.getByText("Enter your invitation code.").first()).toBeVisible();

    // A wrong code is caught as it is typed (the server refuses it too — see tests/integration/referrals.test.ts).
    await owner.locator("#referral-code").fill("ZD-00000000");
    await expect(owner.getByText("That invitation code doesn't exist.").first()).toBeVisible();
    expect(owner.url()).toContain("/start");

    await owner.locator("#referral-code").fill(invitationCode.toLowerCase());
    await expect(owner.getByText("Invitation accepted.")).toBeVisible();
    await owner.getByRole("button", { name: "Create my store" }).click();
    await owner.waitForURL(/\/dashboard\?welcome=1/);
    await expect(owner.getByText(`${storeName} is live`)).toBeVisible();
    storeUrl = storeUrlFor(slug);

    // The code is used up and linked to the new store.
    await admin.goto(`/admin/referrals?q=${invitationCode}`);
    const row = admin.locator("tbody tr", { hasText: invitationCode });
    await expect(row).toContainText("Used");
    await expect(row).toContainText(storeName);
    await expect(row).toContainText(ownerEmail);
  });

  test("4. the owner uploads a logo, and it appears on their store — only theirs", async ({ browser }) => {
    const logo = await sharp({ create: { width: 480, height: 120, channels: 4, background: { r: 84, g: 70, b: 255, alpha: 1 } } }).png().toBuffer();
    await owner.goto("/dashboard/design");
    // Upload the way a person does: the chooser only opens once the button is live on the page.
    const [chooser] = await Promise.all([owner.waitForEvent("filechooser"), owner.getByRole("button", { name: "Upload" }).first().click()]);
    await chooser.setFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
    await expect(toast(owner, "Logo updated.")).toBeVisible();

    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    await page.goto("/");
    const mark = page.locator("header").getByRole("img", { name: storeName });
    await expect(mark).toBeVisible();
    // The image really loads (a broken URL would leave it with no pixels).
    await expect.poll(() => mark.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBeGreaterThan(0);
    // The demo store keeps its own identity.
    await page.goto(`${STORE_URL}/`);
    await expect(page.locator("header").getByRole("img", { name: storeName })).toHaveCount(0);
    await shopper.close();
  });

  test("5–6. the owner picks products and sets a markup; the store sells only them, at the owner's prices", async () => {
    await owner.goto(`/catalog/p/${SECOND_PRODUCT}`);
    await owner.getByRole("button", { name: "Add to my store" }).first().click();
    await expect(toast(owner, "Added to your store.")).toBeVisible();

    await owner.goto("/dashboard/pricing");
    await owner.getByText("My own markup").click();
    await owner.getByLabel("Markup (%)").fill("50");
    await expect(owner.getByText(/after Zendropship.s 10% commission/)).toBeVisible();
    await owner.getByRole("button", { name: "Save pricing" }).click();
    await expect(toast(owner, /Pricing saved/)).toBeVisible();

    await owner.goto("/dashboard/products");
    const row = owner.locator("tbody tr", { hasText: "Amber" });
    storePrice = (await row.locator("td").nth(2).innerText()).trim();
    expect(storePrice).toMatch(/^\$\d+\.\d9$/);

    const shopper = await owner.context().browser()!.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    await page.goto("/shop");
    await expect(page.getByText("2 products")).toBeVisible();
    // The storefront picks up a just-saved price on its next request, so give it one.
    await expect(async () => {
      await page.goto(`/p/${FIRST_PRODUCT}`);
      await expect(page.locator("main")).toContainText(storePrice, { timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await page.goto("/p/harness-leather-belt");
    await expect(notFound(page)).toBeVisible();
    await shopper.close();
  });

  test("7–10. a customer pays in the store; the confirmation survives a refresh; the money is split and recorded", async ({ browser }) => {
    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    const email = `e2e.buyer.${stamp}@example.com`;
    await page.goto(`/p/${FIRST_PRODUCT}`);
    await page.getByRole("button", { name: "Add to bag" }).first().click();
    const bag = page.getByRole("dialog");
    await expect(bag.getByText("Your bag (1)")).toBeVisible();
    await bag.getByRole("button", { name: /Increase quantity/i }).first().click();
    await expect(bag.getByText("Your bag (2)")).toBeVisible();
    await bag.getByRole("button", { name: /Increase quantity/i }).first().click();
    await expect(bag.getByText("Your bag (3)")).toBeVisible();
    await fillCheckout(page, email, /Test card/);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL(/\/checkout\/sandbox\//);
    await page.getByRole("button", { name: /^Pay \$/ }).click();
    await page.waitForURL(/\/checkout\/confirmation\//);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you for your order!");
    orderNumber = await orderNumberOn(page);
    await expect(page.locator("main").getByRole("img", { name: storeName }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you for your order!");

    const confirmation = await waitForMail((mail) => mail.to === email && /confirmed|Payment received/i.test(mail.subject));
    expect(confirmation.text).toContain(storeName);
    expect(confirmation.links.some((link) => link.startsWith(storeUrl))).toBe(true);
    const ownerAlert = await waitForMail((mail) => mail.to === ownerEmail && mail.subject.includes("New order"));
    expect(ownerAlert.links.some((link) => pathOf(link).startsWith("/dashboard/orders/"))).toBe(true);
    await shopper.close();

    // The owner sees the full breakdown; the numbers add up and commission is 10% of the goods.
    await owner.goto(`/dashboard/orders/${orderNumber}`);
    await expect(owner.getByText("Accepted").first()).toBeVisible();
    const goods = await amountBeside(owner, "Goods sold");
    const cost = await amountBeside(owner, "Fulfilment cost");
    const commission = await amountBeside(owner, "Zendropship commission (10%)");
    const earning = await amountBeside(owner, "You earn");
    expect(commission).toBe(Math.round(goods * 0.1));
    expect(earning).toBe(goods - cost - commission);
    await expect(owner.getByText("Customer paid").first()).toBeVisible();
  });

  test("withdrawals: held out of the balance, approved, then paid by staff", async () => {
    await owner.goto("/dashboard/balance");
    await expect(owner.getByText(`Sale · order ${orderNumber}`)).toBeVisible();
    await expect(owner.getByText(/Zendropship commission \(10%\) · order/).first()).toBeVisible();
    await expect(owner.getByText(`Fulfilment cost · order ${orderNumber}`)).toBeVisible();

    await owner.getByRole("button", { name: "Withdraw" }).first().click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Amount (USD)").fill("20");
    await dialog.getByText("PayPal", { exact: true }).click();
    await dialog.getByLabel("PayPal email address").fill(ownerEmail);
    await dialog.getByRole("button", { name: "Request withdrawal" }).click();
    await expect(toast(owner, /Withdrawal of \$20.00 requested/)).toBeVisible();

    await admin.goto("/admin/payouts");
    const row = admin.locator("tbody tr", { hasText: storeName }).first();
    await expect(row).toContainText("$20.00");
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(toast(admin, /Withdrawal approved/)).toBeVisible();
    await row.getByRole("button", { name: "Mark paid" }).click();
    await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Mark as paid" }).click();
    await expect(toast(admin, /marked as paid/)).toBeVisible();

    await owner.reload();
    await expect(owner.getByText("Paid").first()).toBeVisible();
  });

  test("11–19. an order that cannot pay for itself waits for funds; a confirmed deposit releases it, charged once", async ({ browser }) => {
    // The owner prices the candle below what it costs: the order will lose money, so the balance must cover it.
    await owner.goto("/dashboard/products");
    await owner.locator("tbody tr", { hasText: "Amber" }).getByRole("button", { name: /Edit$/ }).click();
    const priceDialog = owner.getByRole("dialog");
    await priceDialog.getByText("Fixed price", { exact: true }).click();
    await priceDialog.getByLabel("Selling price (USD)").fill("1.00");
    await priceDialog.getByRole("button", { name: "Save price" }).click();
    await expect(toast(owner, "Price saved.")).toBeVisible();

    // A guest customer buys it with cash on delivery — and lands on a real confirmation page, not a 404.
    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    await page.goto(`/p/${FIRST_PRODUCT}`);
    await page.getByRole("button", { name: "Add to bag" }).first().click();
    await expect(page.getByRole("dialog").getByText("Your bag (1)")).toBeVisible();
    await fillCheckout(page, `e2e.cod.${stamp}@example.com`, /Cash on delivery/);
    await page.getByRole("button", { name: "Place order" }).click();
    await page.waitForURL(/\/checkout\/confirmation\/.+\?token=/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you for your order!");
    fundedOrderNumber = await orderNumberOn(page);
    fundedOrderUrl = page.url();
    // The customer is never told the store is short of money.
    await expect(page.getByText("Awaiting funds")).toHaveCount(0);
    await shopper.close();

    // The owner is told a deposit is needed, and how much.
    await owner.goto(`/dashboard/orders/${fundedOrderNumber}`);
    await expect(owner.getByText("Deposit required to fulfil this order")).toBeVisible();
    const shortfallText = await owner.getByText(/your balance is \$[\d,.]+ short/).innerText();
    const shortfall = Number(/\$([\d,.]+) short/.exec(shortfallText)![1].replace(/,/g, ""));
    expect(shortfall).toBeGreaterThan(0);
    const deposit = Math.max(5, Math.ceil(shortfall * 100) / 100).toFixed(2);
    await waitForMail((mail) => mail.to === ownerEmail && mail.subject.includes("waiting for funds"));

    await owner.goto("/dashboard/balance");
    await owner.getByRole("button", { name: "Deposit" }).first().click();
    const depositDialog = owner.getByRole("dialog");
    await depositDialog.locator("#field-amount").fill(deposit);
    await depositDialog.locator("#field-reference").fill(`TOPUP-${stamp}`);
    await depositDialog.getByRole("button", { name: "Record deposit" }).click();
    await expect(toast(owner, new RegExp(`Deposit of \\$${deposit.replace(".", "\\.")} recorded`))).toBeVisible();

    // Declaring a deposit changes nothing: the order is still waiting.
    await owner.goto(`/dashboard/orders/${fundedOrderNumber}`);
    await expect(owner.getByText("Deposit required to fulfil this order")).toBeVisible();

    // Staff find the transfer in the deposit queue, with the owner beside it, and credit it.
    await admin.goto("/admin/deposits?status=PENDING");
    const depositRow = admin.locator("tbody tr", { hasText: `TOPUP-${stamp}` });
    await expect(depositRow).toContainText(ownerEmail);
    await depositRow.getByRole("button", { name: "Review" }).click();
    const review = admin.getByRole("dialog").filter({ visible: true });
    await review.getByRole("button", { name: /Approve & credit/ }).click();
    await expect(toast(admin, /order\(s\) waiting for funds have been dealt with/)).toBeVisible();

    await owner.goto(`/dashboard/orders/${fundedOrderNumber}`);
    await expect(owner.getByText("Deposit required to fulfil this order")).toHaveCount(0);
    // Exactly one charge: the candle's $23.10 wholesale cost.
    await expect(owner.getByText(/Accepted by fulfilment — \$23\.10 charged to the store balance/)).toHaveCount(1);
  });

  test("20–22. staff fulfil the order step by step from the queue; the owner and the customer follow it", async () => {
    // The queue: one click moves an order to its next stage, without opening it.
    await admin.goto(`/admin/orders?q=${fundedOrderNumber}`);
    const row = admin.locator("tbody tr", { hasText: fundedOrderNumber });
    await expect(row).toContainText("Next: Processing");
    await row.getByRole("button", { name: "Processing", exact: true }).click();
    await expect(toast(admin, "Order status updated.")).toBeVisible();
    await expect(admin.locator("tbody tr", { hasText: fundedOrderNumber })).toContainText("Next: Packed");
    await admin.locator("tbody tr", { hasText: fundedOrderNumber }).getByRole("button", { name: "Packed", exact: true }).click();
    await expect(toast(admin, "Order status updated.")).toBeVisible();

    // The rest from the order itself, where the steps that tell the customer ask for confirmation.
    await admin.getByRole("link", { name: fundedOrderNumber }).click();
    await admin.waitForURL(/\/admin\/orders\/[a-z0-9]+$/);
    for (const [button, confirm] of [
      ["Mark shipped", "Mark shipped"],
      ["Out for delivery", null],
      ["Mark delivered", "Mark delivered"],
    ] as Array<[string, string | null]>) {
      await admin.getByRole("button", { name: button }).first().click();
      if (confirm) await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: confirm }).click();
      await expect(toast(admin, /Order status updated|accepted/)).toBeVisible();
      await admin.reload();
    }

    // The order is finished: the tracker shows every stage with its time and who moved it, and nothing is left to do.
    await expect(admin.getByText("Fulfilment complete")).toBeVisible();
    const tracker = admin.locator("section").filter({ has: admin.getByRole("heading", { name: "Fulfilment", exact: true }) }).first();
    for (const stage of ["Order placed", "Payment confirmed", "Accepted", "Processing", "Packed", "Shipped", "Out for delivery", "Delivered"]) {
      await expect(tracker.getByText(stage).first()).toBeVisible();
    }
    await expect(tracker.getByText("Store Owner").first()).toBeVisible();
    await expect(admin.getByRole("button", { name: "Mark delivered" })).toHaveCount(0);
    await admin.goto(`/admin/orders?q=${fundedOrderNumber}`);
    await expect(admin.locator("tbody tr", { hasText: fundedOrderNumber })).toContainText("Complete");

    // 24. Staff see commission and the fulfilment charge on the order.
    await admin.getByRole("link", { name: fundedOrderNumber }).click();
    await expect(admin.getByText("Store & money")).toBeVisible();
    await expect(admin.getByText("Wallet movements")).toBeVisible();
    await expect(admin.getByText(/Zendropship commission/).first()).toBeVisible();

    // 21. The owner sees the whole timeline, after a refresh, with the times.
    await owner.goto(`/dashboard/orders/${fundedOrderNumber}`);
    await expect(owner.getByText("Delivered — this order is complete.")).toBeVisible();
    for (const line of ["Waiting for funds", "Accepted by fulfilment", "Status changed to Processing", "Status changed to Packed", "Status changed to Shipped", "Status changed to Out for delivery", "Status changed to Delivered"]) {
      await expect(owner.getByText(new RegExp(line)).first()).toBeVisible();
    }

    // 22. The customer's own tracking page shows it delivered.
    const customer = await owner.context().browser()!.newContext();
    const page = await customer.newPage();
    await page.goto(fundedOrderUrl);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you for your order!");
    await expect(page.getByText("Your order has arrived.")).toBeVisible();
    await customer.close();
  });

  test("23. the owner's ledger shows every movement: sales, costs, commission, the deposit and the withdrawal", async () => {
    await owner.goto("/dashboard/balance");
    for (const label of ["Sale", "Fulfilment cost", "Zendropship commission", "Deposit", "Withdrawal"]) {
      await expect(owner.getByRole("cell", { name: new RegExp(`^${label}`) }).first()).toBeVisible();
    }
    await owner.goto("/dashboard");
    await expect(owner.getByText("Where the money goes")).toBeVisible();
    await expect(owner.getByText("Zendropship commission").first()).toBeVisible();
  });

  test("25–29. customer service: a customer writes in, Zendropship staff reply, the customer reads it in their account", async ({ browser }) => {
    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    await page.goto("/register");
    await page.locator("#field-firstName").fill("Cara");
    await page.locator("#field-lastName").fill("Customer");
    await page.locator("#field-email").fill(customerEmail);
    await page.locator("#register-password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account/);

    await page.getByRole("link", { name: "Customer service" }).first().click();
    await page.waitForURL(/\/support$/);
    await expect(page.getByText("No messages yet")).toBeVisible();
    await page.getByRole("link", { name: "New message" }).click();
    await page.locator("#field-subject").fill(`Gift wrap ${stamp}`);
    await page.locator("#support-message").fill("Could you gift-wrap my next order? It is a birthday present.");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.waitForURL(/\/support\/[a-z0-9]+\?sent=1/);
    await expect(page.getByText("Message sent")).toBeVisible();
    const threadUrl = page.url().split("?")[0];

    // Zendropship staff see it in the support inbox, with the store beside it.
    await admin.goto(`/admin/messages?q=${encodeURIComponent(`Gift wrap ${stamp}`)}`);
    await admin.getByRole("link", { name: new RegExp(`Gift wrap ${stamp}`) }).click();
    await expect(admin.getByText("It is a birthday present.")).toBeVisible();
    await expect(admin.getByRole("link", { name: storeName, exact: true })).toBeVisible();
    await admin.getByLabel(/Reply to Cara/).fill("Of course — we'll gift-wrap it and add a card.");
    await admin.getByRole("button", { name: "Send", exact: true }).click();
    await expect(toast(admin, /Reply sent/)).toBeVisible();

    // The customer gets the reply by email, and in their account.
    const reply = await waitForMail((mail) => mail.to === customerEmail && mail.subject.startsWith(`Re: Gift wrap ${stamp}`));
    expect(reply.text).toContain("gift-wrap it");
    await page.goto("/support");
    await expect(page.getByText("New reply")).toBeVisible();
    await page.goto(threadUrl);
    await expect(page.getByText("we'll gift-wrap it and add a card")).toBeVisible();

    // The customer writes back; the conversation continues until it is resolved.
    await page.locator("#support-reply").fill("Thank you so much!");
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(page.getByText("Thank you so much!")).toBeVisible();
    await shopper.close();
  });

  test("the owner asks Zendropship about a deposit and the two of them go back and forth in one thread", async () => {
    // From the balance page, the question carries the deposit it is about.
    await owner.goto("/dashboard/balance");
    const deposits = owner.locator("section").filter({ has: owner.getByRole("heading", { name: "Deposits", exact: true }) }).first();
    await deposits.getByRole("link", { name: "Ask Zendropship about this" }).first().click();
    await owner.waitForURL(/\/dashboard\/support\/tickets\/new\?deposit=/);
    const subject = `Deposit question ${stamp}`;
    await owner.getByLabel("Subject").fill(subject);
    await owner.locator("#ticket-message").fill("The deposit I sent still shows as waiting — can you check it?");
    await owner.getByRole("button", { name: "Send to Zendropship" }).click();
    await owner.waitForURL(/\/dashboard\/support\/tickets\/[a-z0-9]+\?sent=1/);
    const threadUrl = owner.url().split("?")[0];
    await expect(owner.getByText("Message sent")).toBeVisible();
    await expect(owner.getByText("The deposit I sent still shows as waiting")).toBeVisible();
    await expect(owner.getByText("What this is about")).toBeVisible();

    // Staff answer from the support inbox, with the deposit in front of them.
    await admin.goto(`/admin/messages?q=${encodeURIComponent(subject)}`);
    await admin.getByRole("link", { name: new RegExp(subject) }).click();
    await expect(admin.getByText(/About a deposit of \$/)).toBeVisible();
    await admin.getByLabel(/Reply to Tess|Reply to Erin/).fill("Checked it — the transfer has arrived and your balance is credited.");
    await admin.getByRole("button", { name: "Send", exact: true }).click();
    await expect(toast(admin, /Reply sent/)).toBeVisible();

    // The owner is told there is something new, reads it, and writes back in the same thread.
    await owner.goto("/dashboard");
    await expect(owner.getByRole("link", { name: /Customer service/ }).locator("span").filter({ hasText: /^[1-9]/ })).toBeVisible();
    await owner.goto("/dashboard/support");
    await expect(owner.getByText(subject)).toBeVisible();
    await owner.getByRole("link", { name: new RegExp(subject) }).click();
    await owner.waitForURL(threadUrl);
    await expect(owner.getByText("the transfer has arrived")).toBeVisible();
    await owner.locator("#ticket-reply").fill("Thank you — all clear now.");
    await owner.getByRole("button", { name: "Send reply" }).click();
    await expect(toast(owner, /Message sent to Zendropship/)).toBeVisible();
    await owner.reload();
    await expect(owner.getByText("Thank you — all clear now.")).toBeVisible();

    // Staff see the owner's reply in the same conversation.
    await admin.reload();
    await expect(admin.getByText("Thank you — all clear now.")).toBeVisible();
  });

  test("the owner answers their own customers from the dashboard", async ({ browser }) => {
    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    const guestEmail = `e2e.support.${stamp}@example.com`;
    await page.goto("/contact");
    await page.locator("#field-name").fill("Sam Shopper");
    await page.locator("#field-email").fill(guestEmail);
    await page.locator("#field-subject").fill(`Where is my parcel ${stamp}`);
    await page.locator("#contact-message").fill("Hello, I ordered yesterday and would like to know when it ships. Thank you!");
    await page.getByRole("button", { name: /Send/ }).click();
    await expect(page.getByText(/we.ve received your message/i).first()).toBeVisible();
    await shopper.close();

    await owner.goto("/dashboard/support");
    await owner.getByRole("link", { name: new RegExp(`Where is my parcel ${stamp}`) }).click();
    await expect(owner.getByText("I ordered yesterday")).toBeVisible();
    await owner.getByLabel(/Reply to Sam/).fill("Hi Sam — your parcel leaves our warehouse today and you'll get tracking by email.");
    await owner.getByRole("button", { name: "Send reply" }).click();
    await expect(toast(owner, /Reply sent/)).toBeVisible();
    const reply = await waitForMail((mail) => mail.to === guestEmail && mail.subject.startsWith("Re: Where is my parcel"));
    expect(reply.text).toContain(storeName);
  });

  test("30. isolation: another store's bag, a stranger's conversation and the owner area stay private", async ({ browser }) => {
    const shopper = await browser.newContext({ baseURL: STORE_URL });
    const page = await shopper.newPage();
    await page.goto(`/p/${FIRST_PRODUCT}`);
    await page.getByRole("button", { name: "Add to bag" }).first().click();
    await expect(page.getByRole("dialog").getByText("Your bag")).toBeVisible();
    await page.goto(`${storeUrl}/cart`);
    await expect(page.getByText(/Your bag is empty/i).first()).toBeVisible();

    // A visitor cannot read the owner dashboard or the admin.
    await page.goto(`${PLATFORM_URL}/dashboard/orders/${fundedOrderNumber}`);
    await expect(page).toHaveURL(/\/login/);
    await page.goto(`${PLATFORM_URL}/admin/referrals`);
    await expect(page).toHaveURL(/\/login/);
    await shopper.close();
  });

  test("admin: the new store is listed with its owner, balance and invitation, and can be suspended and reopened", async ({ browser }) => {
    await admin.goto(`/admin/stores?q=${encodeURIComponent(storeName)}`);
    await expect(admin.locator("tbody tr", { hasText: storeName })).toContainText(invitationCode);
    await suspendAndReopen(browser, storeName, storeUrl);
  });

  test("admin: the store's own page gathers the owner, the money, the orders and the history", async () => {
    await admin.goto(`/admin/stores?q=${encodeURIComponent(storeName)}`);
    await admin.getByRole("link", { name: storeName, exact: true }).click();
    await admin.waitForURL(/\/admin\/stores\/[a-z0-9]+/);

    // The owner, reachable without hunting through another screen.
    await expect(admin.getByText(ownerEmail).first()).toBeVisible();
    // The money, with the ledger entry the deposit created.
    await expect(admin.getByRole("heading", { name: "Wallet ledger" })).toBeVisible();
    await expect(admin.getByText("Deposit received").first()).toBeVisible();
    await expect(admin.getByText(`TOPUP-${stamp}`).first()).toBeVisible();
    // The orders it has taken, and what the owner has done.
    await expect(admin.getByRole("link", { name: fundedOrderNumber })).toBeVisible();
    await expect(admin.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(admin.getByText(invitationCode).first()).toBeVisible();
  });

  test("admin: helping an owner back in is a reset link, never a password", async () => {
    await admin.goto(`/admin/stores?q=${encodeURIComponent(storeName)}`);
    await admin.getByRole("link", { name: storeName, exact: true }).click();
    await admin.waitForURL(/\/admin\/stores\/[a-z0-9]+/);

    // Nothing on the page is, or could stand in for, the owner's password.
    await expect(admin.getByText(/stored only as a hash/)).toBeVisible();
    await expect(admin.getByText(password)).toHaveCount(0);
    await expect(admin.locator('input[type="password"]')).toHaveCount(0);

    await admin.getByRole("button", { name: "Send password reset" }).click();
    await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Send reset link" }).click();
    await expect(toast(admin, new RegExp(`Reset link sent to ${ownerEmail}`))).toBeVisible();

    // The owner gets a link to set their own password, and the old one no longer works.
    const mail = await waitForMail((message) => message.to === ownerEmail && /password/i.test(message.subject));
    expect(mail.links.some((link) => link.includes("/reset-password"))).toBe(true);
    await owner.goto("/login");
    await owner.locator("#field-email").fill(ownerEmail);
    await owner.locator("#login-password").fill(password);
    await owner.getByRole("button", { name: "Sign in" }).click();
    await expect(owner.getByText(/reset|password/i).first()).toBeVisible();
    await expect(owner).not.toHaveURL(/\/dashboard/);
  });
});

/** Streamed pages keep a 200 status (with a noindex tag), so the not-found page is recognised by its heading. */
const notFound = (page: Page) => page.getByRole("heading", { name: /can.t find that page/ });

/** Checkout with the chosen payment method, stopping just before the final button. */
async function fillCheckout(page: Page, email: string, payment: RegExp) {
  await page.goto("/checkout");
  await page.locator("#field-email").fill(email);
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  for (const [field, value] of Object.entries(SHIPPING)) await page.locator(`#ship-${field}`).fill(value);
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await expect(page.getByRole("radio", { name: /Standard/ }).first()).toBeAttached();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("radio", { name: payment }).check({ force: true });
  await page.getByRole("button", { name: "Review order" }).click();
}

/** The dollar amount printed beside a label in the order's money breakdown, in cents (sign dropped). */
async function amountBeside(page: Page, label: string) {
  const row = page.locator("dl > div", { has: page.locator("dt", { hasText: new RegExp(`^${label.replace(/[()]/g, "\\$&")}$`) }) }).first();
  const text = (await row.locator("dd").innerText()).trim();
  return Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);
}

async function suspendAndReopen(browser: Browser, storeName: string, storeUrl: string) {
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
  const admin = await adminContext.newPage();
  await admin.goto(`/admin/stores?q=${encodeURIComponent(storeName)}`);
  const row = admin.locator("tbody tr", { hasText: storeName });
  await expect(row).toContainText("Open");
  await row.getByRole("button", { name: "Suspend" }).click();
  await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Suspend store" }).click();
  await expect(toast(admin, /is suspended/)).toBeVisible();

  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  // Suspension propagates through the storefront cache the same way reopening does.
  await expect(async () => {
    await page.goto(`${storeUrl}/`);
    await expect(notFound(page)).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 60000 });

  await admin.reload();
  await admin.locator("tbody tr", { hasText: storeName }).getByRole("button", { name: "Reopen" }).click();
  await expect(toast(admin, /is open again/)).toBeVisible();
  // The storefront comes back with its own branding once the reopened store has propagated.
  await expect(async () => {
    await page.goto(`${storeUrl}/`);
    await expect(page.locator("header").getByRole("img", { name: storeName })).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 60000 });
  await visitor.close();
  await adminContext.close();
}
