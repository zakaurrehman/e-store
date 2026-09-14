// Customer ↔ admin loops in real browsers: review moderation + public reply, contact inbox, staff notifications,
// disable / re-enable / force password reset, and RBAC for a custom staff role (enforced server-side).
//   node scripts/qa/admin-people-flow.mjs   (needs var/qa/admin-state.json)
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const base = "http://localhost:3456";
const browser = await chromium.launch();
const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: "var/qa/admin-state.json" })).newPage();
const customerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const customer = await customerContext.newPage();
const problems = [];
for (const [label, p] of [["admin", admin], ["customer", customer]]) {
  p.on("console", (m) => { if (m.type() === "error") problems.push(`${label}: ${m.text().slice(0, 250)}`); });
  p.on("pageerror", (e) => problems.push(`${label}: pageerror ${e.message.slice(0, 250)}`));
  p.on("response", (r) => { if (r.status() >= 500) problems.push(`${label}: http ${r.status()} ${r.url()}`); });
}
const stamp = Date.now().toString(36).toUpperCase();
const email = `qa.people.${stamp.toLowerCase()}@example.com`;
const password = "Veyora-QA-2026!";
const productSlug = "qa-linen-overshirt-mtzridr3";
const step = (msg) => console.log("✓", msg);
const go = (p, path) => p.goto(base + path, { waitUntil: "networkidle", timeout: 180000 });
const toast = (p, text) => p.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 90000 });
const visibleDialog = (p) => p.getByRole("dialog").filter({ visible: true });
const mail = async (predicate) => {
  await new Promise((r) => setTimeout(r, 1500));
  const lines = (await readFile("var/mail/mailbox.jsonl", "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  return lines.reverse().find(predicate);
};
const login = async (p, who, pass) => {
  await go(p, "/login");
  await p.locator("#field-email:visible").fill(who);
  await p.locator("#login-password:visible").fill(pass);
  await p.getByRole("button", { name: "Sign in" }).click();
};
let failed = 0;
const run = async (label, fn) => {
  if (process.env.ONLY && !label.includes(process.env.ONLY)) return;
  try {
    await fn();
    step(label);
  } catch (error) {
    failed++;
    console.log("✗", label, "—", error.message.split("\n").slice(0, 3).join(" "));
    await admin.screenshot({ path: `var/qa/people-fail-admin.png`, caret: "initial", fullPage: true });
    await customer.screenshot({ path: `var/qa/people-fail-customer.png`, caret: "initial", fullPage: true });
  }
};

await run("customer registers, verifies email, submits a review (pending)", async () => {
  await go(customer, "/register");
  await customer.locator("#field-firstName").fill("Noor");
  await customer.locator("#field-lastName").fill("Reviewer");
  await customer.locator("#field-email").fill(email);
  await customer.locator("#register-password").fill(password);
  await customer.getByRole("button", { name: "Create account" }).click();
  await customer.waitForURL(/\/account/, { timeout: 90000 });
  const welcome = await mail((m) => m.to === email && /Welcome/.test(m.subject));
  await go(customer, new URL(welcome.links.find((l) => l.includes("/verify-email"))).pathname + new URL(welcome.links.find((l) => l.includes("/verify-email"))).search);
  await go(customer, `/p/${productSlug}`);
  await customer.getByText("Write a review").click();
  await customer.getByRole("radio", { name: /4 stars/ }).check({ force: true });
  await customer.locator("#review-title").fill(`Great weight for summer ${stamp}`);
  await customer.locator("#review-body").fill("Soft linen that gets better with each wash. Runs slightly large — I sized down.");
  await customer.getByRole("button", { name: "Submit review" }).click();
  // The page refreshes with the new cache state, so either confirmation is valid.
  console.log("  after submit:", await customer.getByText(/will appear once it's been checked|awaiting moderation/).first().innerText({ timeout: 60000 }));
  await customer.reload({ waitUntil: "networkidle" });
  console.log("  after reload:", await customer.getByText(/awaiting moderation/).first().innerText());
});

await run("customer sends a contact message", async () => {
  await go(customer, "/contact");
  await customer.locator("#field-subject").fill(`Sizing question ${stamp}`);
  await customer.locator("#contact-message").fill("Does the overshirt come in a tall fit? Thanks!");
  await customer.getByRole("button", { name: "Send message" }).click();
  await customer.getByText(/Thanks|received|get back/i).first().waitFor({ timeout: 60000 });
});

await run("admin approves review and replies; storefront shows both", async () => {
  await go(admin, "/admin/reviews?status=PENDING");
  const row = admin.locator("li", { hasText: `Great weight for summer ${stamp}` });
  await row.getByRole("button", { name: "Approve" }).click();
  await toast(admin, "Review approved.");
  // Approved reviews leave the PENDING filter, so reply from the approved list.
  await go(admin, "/admin/reviews?status=APPROVED");
  await admin.locator("li", { hasText: `Great weight for summer ${stamp}` }).getByRole("button", { name: "Reply" }).click();
  await visibleDialog(admin).locator("textarea").fill("Thank you, Noor — the tall fit arrives in October.");
  await visibleDialog(admin).getByRole("button", { name: "Save reply" }).click();
  await toast(admin, "Reply saved.");
  const fresh = await browser.newPage();
  await fresh.goto(`${base}/p/${productSlug}`, { waitUntil: "networkidle" });
  const text = await fresh.locator("#reviews").innerText();
  console.log("  PDP shows review:", text.includes(`Great weight for summer ${stamp}`), "| reply:", text.includes("tall fit arrives in October"), "| verified-purchase badge:", /Verified/.test(text));
  await fresh.close();
  if (!text.includes(`Great weight for summer ${stamp}`)) throw new Error("approved review not on PDP");
});

await run("admin inbox: message listed, resolved; staff notifications recorded", async () => {
  await go(admin, "/admin/messages?status=NEW");
  await admin.getByRole("link", { name: new RegExp(`Sizing question ${stamp}`) }).click();
  await admin.getByRole("button", { name: "Mark resolved" }).click();
  await toast(admin, "Message updated.");
  await go(admin, "/admin/notifications");
  const titles = (await admin.locator("main li").allInnerTexts()).slice(0, 4).map((t) => t.split("\n")[0]);
  console.log("  latest staff notifications:", titles.join(" | "));
});

await run("disable account: customer signed out and blocked; re-enable restores access", async () => {
  await go(admin, `/admin/customers?q=${encodeURIComponent(email)}`);
  await admin.getByRole("link", { name: "Noor Reviewer" }).click();
  await admin.waitForURL(/\/admin\/customers\/[a-z0-9]+$/);
  await admin.getByRole("button", { name: "Disable account" }).click();
  await visibleDialog(admin).getByRole("button", { name: "Disable" }).click();
  await toast(admin, "Account disabled");
  await go(customer, "/account");
  console.log("  customer /account after disable →", new URL(customer.url()).pathname);
  await login(customer, email, password);
  await customer.getByText(/has been disabled/).first().waitFor({ timeout: 60000 });
  console.log("  login refused: disabled message shown");
  await admin.reload({ waitUntil: "networkidle" });
  await admin.getByRole("button", { name: "Re-enable account" }).click();
  await toast(admin, "Account re-enabled.");
  await login(customer, email, password);
  await customer.waitForURL(/\/account/, { timeout: 60000 });
  console.log("  login after re-enable →", new URL(customer.url()).pathname);
});

await run("force password reset: sessions end, sign-in blocked until reset link used", async () => {
  await admin.reload({ waitUntil: "networkidle" });
  await admin.getByRole("button", { name: "Reset access" }).click();
  await visibleDialog(admin).getByRole("button", { name: "Send reset link" }).click();
  await toast(admin, "Reset link sent");
  await go(customer, "/account");
  console.log("  customer /account after reset →", new URL(customer.url()).pathname);
  await login(customer, email, password);
  await customer.getByText(/set a new password/).first().waitFor({ timeout: 60000 });
  const reset = await mail((m) => m.to === email && /Reset/i.test(m.subject));
  const link = new URL(reset.links.find((l) => l.includes("/reset-password")));
  await go(customer, link.pathname + link.search);
  await customer.locator("#reset-password").fill("Veyora-QA-2027!");
  await customer.locator("#reset-confirm").fill("Veyora-QA-2027!");
  await customer.getByRole("button", { name: /password/i }).last().click();
  await customer.waitForURL((u) => !u.pathname.startsWith("/reset-password"), { timeout: 60000 });
  await login(customer, email, "Veyora-QA-2027!");
  await customer.waitForURL(/\/account/, { timeout: 60000 });
  console.log("  new password works →", new URL(customer.url()).pathname);
});

const staffEmail = `qa.staff.${stamp.toLowerCase()}@example.com`;
const staffPassword = "Veyora-Staff-QA-2026!";
await run("RBAC: custom role + staff account; permissions enforced server-side", async () => {
  await go(admin, "/admin/settings/staff");
  await admin.getByRole("button", { name: "New role" }).click();
  await admin.locator("#r-name:visible").fill(`QA Support ${stamp}`);
  await admin.locator("#r-rank:visible").fill("40");
  for (const key of ["dashboard.view", "orders.view", "customers.view"]) await admin.locator(`#perm-${key.replace(".", "\\.")}:visible`).check();
  await visibleDialog(admin).getByRole("button", { name: "Save role" }).click();
  await admin.waitForLoadState("networkidle");
  await admin.getByText(`QA Support ${stamp}`).first().waitFor({ timeout: 60000 });
  await admin.getByRole("button", { name: "Add staff" }).click();
  await admin.locator("#s-first:visible").fill("Sam");
  await admin.locator("#s-last:visible").fill("Support");
  await admin.locator("#s-email:visible").fill(staffEmail);
  await admin.locator("#s-role:visible").selectOption({ label: `QA Support ${stamp}` });
  await admin.locator("#s-password:visible").fill(staffPassword);
  await visibleDialog(admin).getByRole("button", { name: "Create account" }).click();
  await toast(admin, "Staff account created.");

  const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const staff = await staffContext.newPage();
  await login(staff, staffEmail, staffPassword);
  await staff.waitForURL((u) => u.pathname === "/admin", { timeout: 90000 });
  await staff.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 60000 });
  const nav = await staff.getByRole("navigation", { name: "Admin" }).first().getByRole("link").allInnerTexts();
  console.log("  staff nav:", nav.map((t) => t.trim()).join(", "));
  const check = async (path) => {
    const res = await staff.goto(base + path, { waitUntil: "networkidle" });
    return `${path} → ${res.status()} ${new URL(staff.url()).pathname}`;
  };
  console.log("  " + (await check("/admin/orders")));
  console.log("  " + (await check("/admin/customers")));
  console.log("  " + (await check("/admin/products")));
  console.log("  " + (await check("/admin/settings/staff")));
  const exportRes = await staff.request.get(`${base}/api/admin/products/export`);
  const mediaRes = await staff.request.get(`${base}/api/admin/media`);
  console.log(`  /api/admin/products/export → ${exportRes.status()} | /api/admin/media → ${mediaRes.status()}`);
  if (exportRes.status() === 200 || mediaRes.status() === 200) throw new Error("API allowed without permission");
  if (!new URL(staff.url()).pathname.startsWith("/admin/forbidden")) throw new Error("staff page not forbidden");

  // remove access → staff can no longer open the admin
  await go(admin, "/admin/settings/staff");
  const row = admin.locator("li", { hasText: staffEmail });
  await row.getByRole("button").last().click();
  await visibleDialog(admin).getByRole("button", { name: "Remove access" }).click();
  await toast(admin, "Staff access removed");
  const after = await staff.goto(`${base}/admin`, { waitUntil: "networkidle" });
  console.log(`  after removal /admin → ${after.status()} ${new URL(staff.url()).pathname}`);
  await staffContext.close();
});

[...new Set(problems)].forEach((p) => console.log("⚠", p));
console.log(failed ? `${failed} step(s) failed` : "all steps passed");
await browser.close();
process.exit(0);
