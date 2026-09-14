import { connection, NextResponse, type NextRequest } from "next/server";
import { runJobs } from "@/server/jobs";
import { env } from "@/server/env";
import { safeEqual } from "@/server/security/crypto";

/**
 * Background jobs endpoint. Protected by CRON_SECRET (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`).
 * Schedule every 5 minutes: see vercel.json / DEPLOYMENT.md. Locally: `npm run jobs:run`.
 */
export async function GET(request: NextRequest) {
  // Request-time only: never prerendered at build, so secrets and jobs are touched solely by real calls.
  await connection();
  const secret = env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ") || !safeEqual(header.slice(7), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runJobs();
  return NextResponse.json(result);
}
