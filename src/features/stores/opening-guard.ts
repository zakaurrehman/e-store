import "server-only";
import { isDomainError } from "@/server/errors";
import { isRateLimitedByIp, rateLimitByIp, waitFor } from "@/server/security/rate-limit";

/**
 * The limits on opening a store. Invitation codes are what keep store creation closed, so these stop only
 * two kinds of abuse and never people setting up real stores, however many in a day:
 * - a flood of submissions from one network (20 an hour — far more than anyone opens by hand);
 * - guessing invitation codes (10 wrong codes in 15 minutes from one network).
 * Each network counts on its own, apart from every other network and from customer sign-ups. When the
 * client's address is unknown the limits are skipped rather than shared (see rateLimitByIp).
 */
export type OpeningRefusal = { message: string; field?: "referralCode" };

const guessingMessage = (resetAt: Date) => `Too many incorrect invitation codes were tried from your network. Check your code and try again in ${waitFor(resetAt)}.`;

/** Checked before a store is opened: null when it may go ahead. Counts the attempt towards the flood limit. */
export async function storeOpeningRefusal(ipAddress: string): Promise<OpeningRefusal | null> {
  const guessing = await isRateLimitedByIp("inviteGuess", ipAddress);
  if (guessing.limited) return { message: guessingMessage(guessing.resetAt), field: "referralCode" };
  const flood = await rateLimitByIp("openStore", ipAddress);
  if (!flood.success) return { message: `Too many stores have been opened from your network in the last hour. Please try again in ${waitFor(flood.resetAt)}.` };
  return null;
}

/** An opening refused for a wrong invitation code counts towards the guessing limit; a blank code does not. */
export async function noteRefusedInvitation(error: unknown, submittedCode: unknown, ipAddress: string) {
  if (!isDomainError(error) || error.code !== "REFERRAL_INVALID") return;
  if (!String(submittedCode ?? "").trim()) return;
  await rateLimitByIp("inviteGuess", ipAddress);
}

/** The live check as a code is typed: refused while guessing is blocked, and never more than 60 in ten minutes. */
export async function invitationCheckRefusal(ipAddress: string): Promise<string | null> {
  const guessing = await isRateLimitedByIp("inviteGuess", ipAddress);
  if (guessing.limited) return guessingMessage(guessing.resetAt);
  const checks = await rateLimitByIp("inviteCheck", ipAddress);
  if (!checks.success) return `Too many invitation checks from your network. Please try again in ${waitFor(checks.resetAt)}.`;
  return null;
}

/** A code that turned out not to work, from the live check. */
export async function noteWrongInvitationCheck(ipAddress: string) {
  await rateLimitByIp("inviteGuess", ipAddress);
}
