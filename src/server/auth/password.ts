import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations, 1 degree of parallelism).
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "iloveyou123",
  "letmein123",
  "welcome123",
  "admin12345",
  "passw0rd123",
  "qwerty12345",
  "abc1234567",
]);

export async function hashPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When no hash exists (unknown user) a dummy verification still runs so
 * response timing does not reveal whether an account exists.
 */
export async function verifyPassword(passwordHash: string | null | undefined, password: string) {
  if (!passwordHash) {
    dummyHash ??= hash("zendropship-timing-equaliser", ARGON2_OPTIONS);
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Returns a human-readable problem with the password, or null when acceptable. */
export function passwordProblem(password: string, context: { email?: string; name?: string } = {}) {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "This password is too common. Choose something harder to guess.";
  if (/^(.)\1+$/.test(password)) return "Avoid repeating a single character.";
  const localPart = context.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) return "Don't include your email address.";
  if (!/[a-zA-Z]/.test(password) || !/[^a-zA-Z]/.test(password)) {
    return "Mix letters with numbers or symbols.";
  }
  return null;
}
