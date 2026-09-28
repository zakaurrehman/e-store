/*
 * Zendropship admin alerts (Web Push). Registered by the admin panel for /admin only, once a staff member
 * turns alerts on for their device (src/components/admin/push-alerts.tsx). It does two things:
 *
 * 1. Shows the alert a push brings — a new customer message, say — even when the admin panel is closed.
 *    Alerts about the same conversation share a tag, so the phone shows the latest one instead of a pile.
 *    Any admin page that is open is told as well, so its unread badges update at once.
 * 2. Opens the alert's page when it is tapped: in the admin panel if one is open, otherwise in a new window.
 *
 * It caches nothing and handles no requests: the admin panel always talks to the server directly.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const href = typeof data.href === "string" && data.href.startsWith("/admin") ? data.href : "/admin/notifications";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || "Zendropship", {
        body: data.body || "",
        tag: data.tag || undefined,
        // A newer message in the same conversation replaces the alert, and still makes the phone ring.
        renotify: Boolean(data.tag),
        icon: "/zendropship-admin-192.png",
        badge: "/zendropship-admin-badge-96.png",
        data: { href },
      });
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "staff-alert", tag: data.tag || null, href });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.href || "/admin", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const admin = windows.find((client) => new URL(client.url).pathname.startsWith("/admin"));
      if (!admin) return self.clients.openWindow(target.href);
      await admin.focus();
      try {
        await admin.navigate(target.href);
      } catch {
        // A page this worker does not control yet can't be navigated from here; it moves itself.
        admin.postMessage({ type: "staff-alert-open", href: target.pathname + target.search });
      }
    })(),
  );
});

// The admin page asks for alerts it has already shown on screen to be cleared (a conversation just opened).
self.addEventListener("message", (event) => {
  if (event.data?.type !== "clear-alerts" || typeof event.data.tag !== "string") return;
  event.waitUntil(
    self.registration.getNotifications({ tag: event.data.tag }).then((alerts) => {
      for (const alert of alerts) alert.close();
    }),
  );
});
