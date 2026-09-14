import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate for signed-in areas: visitors without a session cookie get a real 307 to /login
 * instead of a streamed page that redirects client-side. The cookie is NOT trusted here — every page,
 * server action and route handler still validates the session and permissions on the server.
 * Cookie names are inlined because proxy must not depend on application modules.
 */
const SESSION_COOKIES = ["__Host-veyora_session", "veyora_session"];

export function proxy(request: NextRequest) {
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) return NextResponse.next();
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*"],
};
