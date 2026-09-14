import { NextResponse, type NextRequest } from "next/server";
import { getPopularSearches, getSuggestions } from "@/features/search/suggest";
import { extractRequestMeta } from "@/server/request";
import { rateLimit } from "@/server/security/rate-limit";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.slice(0, 100) ?? "";
  const meta = extractRequestMeta(request.headers);
  const limit = await rateLimit("search", meta.ipAddress);
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  if (query.trim().length < 2) {
    return NextResponse.json({ popular: await getPopularSearches() }, { headers: { "Cache-Control": "public, max-age=300" } });
  }
  const suggestions = await getSuggestions(query);
  return NextResponse.json(suggestions, { headers: { "Cache-Control": "public, max-age=60" } });
}
