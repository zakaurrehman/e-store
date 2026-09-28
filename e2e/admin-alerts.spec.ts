import { devices, expect, test, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { ADMIN_STATE, PLATFORM_URL, unique } from "./helpers";
import { clearRateLimits } from "./rate-limits";

// A phone, emulated in the suite's own browser: touch, a 393px screen and a mobile user agent.
const { defaultBrowserType: _browser, ...pixel } = devices["Pixel 5"];

// The full Chromium build: its headless mode keeps the notifications a service worker shows, which the default
// headless shell cannot. (It cannot subscribe to a real push service — that needs Google's — so the alert is
// handed to the worker the way the browser would hand it over, through the DevTools protocol.)
test.use({ channel: "chromium" });

/**
 * Zendropship staff on their phone. A customer message that arrives while the admin panel is open is
 * announced once and counted on the inbox button; tapping it opens the conversation, which reads it. An alert
 * that reaches the phone shows once per conversation, opens that conversation, and is cleared when the
 * conversation is read.
 */
test.describe.serial("the admin on a phone hears about customer messages", () => {
  const stamp = unique();
  const subject = `Phone alert ${stamp}`;
  let phoneContext: BrowserContext;
  let phone: Page;
  let conversationPath = "";

  test.beforeAll(async ({ browser }) => {
    await clearRateLimits();
    phoneContext = await browser.newContext({ ...pixel, storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    await phoneContext.grantPermissions(["notifications"], { origin: PLATFORM_URL });
    phone = await phoneContext.newPage();
  });

  test.afterAll(async () => {
    await phoneContext.close();
  });

  // On a phone the menu is folded away; the inbox button in the corner carries the count.
  const inboxButton = () => phone.getByRole("link", { name: /^Support inbox/ }).filter({ visible: true });
  const unread = async () => Number(/(\d+) unread/.exec((await inboxButton().getAttribute("aria-label")) ?? "")?.[1] ?? 0);
  // The panel checks when it comes back into view, as when the phone is picked up again.
  const lookAgain = () => phone.evaluate(() => window.dispatchEvent(new Event("focus")));

  test("a message written while the panel is open is announced once, counted, and opens the conversation, which reads it", async ({ browser }) => {
    await phone.goto("/admin");
    await expect(inboxButton()).toBeVisible();
    const before = await unread();

    // A visitor writes to Zendropship from the platform site.
    const visitor = await browser.newContext({ baseURL: PLATFORM_URL });
    const page = await visitor.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: /Customer Service/i }).click();
    await page.locator("#widget-name").fill("Priya Visitor");
    await page.locator("#widget-email").fill(`priya.${stamp}@example.com`);
    await page.locator("#widget-message").fill(`${subject}\nCan I pay for my first order by bank transfer?`);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(/we have your message/i)).toBeVisible();
    await visitor.close();

    // No reload: the panel announces it and counts it.
    await lookAgain();
    const banner = phone.getByRole("alert").filter({ hasText: "New message from Priya Visitor" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(subject);
    await expect.poll(unread).toBe(before + 1);
    // Announced once, however often the panel checks.
    await lookAgain();
    await phone.waitForTimeout(800);
    await expect(phone.getByRole("alert").filter({ hasText: "New message from" })).toHaveCount(1);

    // The alert opens the conversation; opening it reads it.
    await banner.getByRole("link", { name: /Open conversation/ }).tap();
    await phone.waitForURL(/\/admin\/messages\?id=/);
    conversationPath = new URL(phone.url()).pathname + new URL(phone.url()).search;
    await expect(phone.getByText("Can I pay for my first order by bank transfer?")).toBeVisible();
    await expect(banner).toHaveCount(0);
    await expect.poll(unread).toBe(before);

    // And in the notifications, it is no longer unread.
    await phone.goto("/admin/notifications");
    const item = phone.getByRole("link", { name: new RegExp(subject) });
    await expect(item).toContainText("New message from Priya Visitor");
    await expect(item).not.toContainText("Unread");
    // Nothing on the page is wider than the phone.
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("an alert that reaches the phone shows once per conversation, goes to that conversation, and is cleared when it is read", async () => {
    const cdp: CDPSession = await phoneContext.newCDPSession(phone);
    const registrations: Array<{ registrationId: string; scopeURL: string }> = [];
    cdp.on("ServiceWorker.workerRegistrationUpdated", (event) => registrations.push(...event.registrations));
    await cdp.send("ServiceWorker.enable");

    // The alert worker, as the panel registers it when alerts are turned on.
    await phone.goto("/admin/notifications");
    await phone.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/admin" });
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => registrations.find((row) => row.scopeURL.endsWith("/admin"))?.registrationId).toBeTruthy();
    const registrationId = registrations.find((row) => row.scopeURL.endsWith("/admin"))!.registrationId;

    const conversationId = new URLSearchParams(conversationPath.split("?")[1]).get("id")!;
    const alert = { title: "New reply from Priya Visitor · Zendropship", href: conversationPath, tag: `support-${conversationId}` };
    const deliver = (body: string) => cdp.send("ServiceWorker.deliverPushMessage", { origin: PLATFORM_URL, registrationId, data: JSON.stringify({ ...alert, body }) });
    const shown = () =>
      phone.evaluate(async (tag) => {
        const registration = await navigator.serviceWorker.getRegistration("/admin");
        return (await registration!.getNotifications({ tag })).map((note) => ({ title: note.title, body: note.body, href: (note.data as { href?: string }).href }));
      }, alert.tag);

    // Two messages in the same conversation: one alert on the phone, showing the latest.
    await deliver(`${subject} — first`);
    await expect.poll(async () => (await shown()).length).toBe(1);
    await deliver(`${subject} — second`);
    await expect.poll(async () => (await shown())[0]?.body).toBe(`${subject} — second`);
    expect(await shown()).toEqual([{ title: alert.title, body: `${subject} — second`, href: conversationPath }]);

    // Reading the conversation clears it from the phone.
    await phone.goto(conversationPath);
    await expect(phone.getByText("Can I pay for my first order by bank transfer?")).toBeVisible();
    await expect.poll(async () => (await shown()).length).toBe(0);
  });
});
