import { chromium } from "@playwright/test";
const base = "http://localhost:3456";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
p.on("console", m => { if (m.type() === "error") problems.push(m.text().slice(0, 400)); });
p.on("pageerror", e => problems.push("pageerror " + e.message.slice(0, 400)));
p.on("response", r => { if (r.status() >= 500) problems.push(`http ${r.status()} ${r.url()}`); });
const shot = async (n, full = false) => { await p.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 60000 }).catch(() => {}); await p.waitForTimeout(400); await p.screenshot({ path: `var/qa/d-admin-${n}.png`, caret: "initial", fullPage: full }); };
try {
  await p.goto(`${base}/login?next=/admin`, { waitUntil: "networkidle" });
  await p.locator("#field-email").fill("admin@veyora.local");
  await p.locator("#login-password").fill(process.env.PW);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL((u) => u.pathname === "/admin", { timeout: 120000 });
  await p.waitForLoadState("networkidle");
  await shot("dashboard", true);
  console.log("dashboard:", await p.getByRole("heading", { level: 1 }).innerText());
  await p.goto(`${base}/admin/orders`, { waitUntil: "networkidle" });
  await shot("orders");
  console.log("orders rows:", await p.locator("tbody tr").count());
  await p.getByRole("link", { name: /VY-/ }).first().click();
  await p.waitForURL(/\/admin\/orders\/[a-z0-9]+$/, { timeout: 60000 }); await p.waitForLoadState("networkidle");
  await shot("order", true);
  const inv = await p.request.get(p.url() + "/invoice?format=pdf");
  console.log("invoice pdf", inv.status(), inv.headers()["content-type"], (await inv.body()).length, "bytes");
  console.log("invoice html", (await p.request.get(p.url() + "/invoice")).status());
  // status update flow
  await p.getByRole("button", { name: "Update status" }).click();
  await p.locator("#next-status").selectOption({ index: 1 });
  await p.getByRole("dialog").getByRole("button", { name: "Update" }).click();
  await p.getByText("Order status updated.").waitFor({ timeout: 30000 });
  console.log("status updated");
  await p.goto(`${base}/admin/analytics?range=90d`, { waitUntil: "networkidle" });
  await shot("analytics", true);
} catch (e) { console.error("FAILED", e.message); await shot("error"); }
problems.forEach(x => console.log("⚠", x));
await b.close();
