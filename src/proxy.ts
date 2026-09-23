import { NextResponse, type NextRequest } from "next/server";
import { resolveSiteUrl } from "./lib/site-url";
import { classifyHost, DEMO_STORE_SLUG, storeBaseDomain, storeUrl } from "./lib/tenancy";

/**
 * Two jobs, both before any page renders:
 *
 * 1. Tenancy. Requests to <slug>.zendropship.io are rewritten to /s/<slug>/… so the storefront routes receive the
 *    store as a route parameter (which keeps them cacheable per store). The platform site answers on the base domain.
 * 2. Optimistic sign-in gate. Visitors without a session cookie get a real 307 to /login for signed-in areas.
 *    The cookie is NOT trusted here — every page, server action and route handler validates the session on the server.
 *
 * Cookie names are inlined because proxy must not depend on application modules.
 */
const SESSION_COOKIES = ["__Host-zendropship_session", "zendropship_session"];
/** Served by the platform site only; on a store host they redirect there. */
const PLATFORM_ONLY_PREFIXES = ["/admin", "/dashboard", "/catalog", "/start", "/s"];
/** Served identically on every host. */
const SHARED_PREFIXES = ["/api/", "/media/", "/_next/", "/icon.svg", "/robots.txt", "/sitemap.xml"];
/** Storefront paths that have a platform equivalent (old links and search results keep working). */
const PLATFORM_EQUIVALENTS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^\/p\/([^/]+)\/?$/, (match) => `/catalog/p/${match[1]}`],
  [/^\/c\/([^/]+)\/?$/, (match) => `/catalog/c/${match[1]}`],
  [/^\/(shop|search|brands|collections)(\/.*)?$/, () => "/catalog"],
  [/^\/account(\/.*)?$/, () => "/dashboard"],
  // Customer service lives in each store; on the platform site the equivalent is writing to Zendropship.
  [/^\/(support|faq)(\/.*)?$/, () => "/contact"],
];
/** Storefront-only paths with no platform equivalent: they belong to the demo store. */
const STOREFRONT_ONLY = /^\/(cart|checkout|wishlist|orders|track-order)(\/|$)/;

function signedIn(request: NextRequest) {
  return SESSION_COOKIES.some((name) => request.cookies.has(name));
}

function loginRedirect(request: NextRequest) {
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

/**
 * The host the visitor asked for. Next.js re-fetches the target of a server-action redirect from the server's own
 * origin and passes the original host along in x-forwarded-host (Vercel sets it on every request too), so that
 * header wins over Host.
 */
function requestHost(request: NextRequest) {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host");
}

/**
 * Redirects to another host. Next.js turns a Location on its own origin into a relative path; when the visitor is on
 * a different host than the server's origin (every store host on the development server), that relative path would
 * send them back to the same store URL forever — so those cases answer with a Refresh instead.
 */
function redirectAcrossHosts(request: NextRequest, destination: string, status: 307 | 308 = 307) {
  const target = new URL(destination);
  const visitorHost = requestHost(request);
  if (target.host === request.nextUrl.host && visitorHost && visitorHost !== target.host) {
    return new NextResponse(`<!doctype html><meta http-equiv="refresh" content="0;url=${target.href}"><a href="${target.href}">Continue</a>`, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", refresh: `0;url=${target.href}`, "cache-control": "no-store" },
    });
  }
  return NextResponse.redirect(target, status);
}

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = classifyHost(requestHost(request), storeBaseDomain());

  if (host.kind === "store") {
    if (SHARED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();
    // Platform areas are not served on store hosts; send the visitor to the platform site.
    if (matchesPrefix(pathname, PLATFORM_ONLY_PREFIXES)) return redirectAcrossHosts(request, `${resolveSiteUrl()}${pathname}${search}`);
    if (pathname.startsWith("/account") && !signedIn(request)) return loginRedirect(request);
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = `/s/${host.slug}${pathname === "/" ? "" : pathname}`;
    rewritten.search = search;
    return NextResponse.rewrite(rewritten);
  }

  if (host.kind === "unknown") {
    // A subdomain that cannot be a store (reserved or malformed): show the platform site instead.
    if (!SHARED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return redirectAcrossHosts(request, `${resolveSiteUrl()}${pathname}${search}`);
    return NextResponse.next();
  }

  // Platform host. Storefront paths are only reachable through their subdomain.
  if (pathname.startsWith("/s/")) {
    const [, , slug, ...rest] = pathname.split("/");
    if (slug) return redirectAcrossHosts(request, `${storeUrl(slug)}/${rest.join("/")}${search}`);
  }
  for (const [pattern, target] of PLATFORM_EQUIVALENTS) {
    const match = pathname.match(pattern);
    if (match) return NextResponse.redirect(`${resolveSiteUrl()}${target(match)}`, 308);
  }
  if (STOREFRONT_ONLY.test(pathname)) return redirectAcrossHosts(request, `${storeUrl(DEMO_STORE_SLUG)}${pathname}${search}`);
  if ((pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) && !signedIn(request)) {
    return loginRedirect(request);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except static assets: the store rewrite has to see ordinary page requests.
  matcher: ["/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico).*)"],
};
