import { z } from "zod";
import { isValidPhone, normalisePhone, PHONE_ERROR } from "@/lib/phone";
import { PASSWORD_MAX_LENGTH } from "@/server/auth/password";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "Email address is too long.")
  .pipe(z.email("Enter a valid email address."))
  .transform((value) => value.toLowerCase());

const nameSchema = (label: string) =>
  z.string().trim().min(1, `Enter your ${label}.`).max(60, `${label[0].toUpperCase()}${label.slice(1)} is too long.`);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH),
  next: z.string().optional(),
});

export const registerSchema = z.object({
  firstName: nameSchema("first name"),
  lastName: nameSchema("last name"),
  email: emailSchema,
  password: z.string().max(PASSWORD_MAX_LENGTH),
  marketingOptIn: z
    .union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()])
    .transform((value) => value === "on" || value === "true"),
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: z.string().max(PASSWORD_MAX_LENGTH),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: z.string().max(PASSWORD_MAX_LENGTH),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  firstName: nameSchema("first name"),
  lastName: nameSchema("last name"),
  // Checked against the real numbering plan and stored in international form; see src/lib/phone.ts.
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((value) => value || null)
    .refine((value) => value === null || isValidPhone(value), PHONE_ERROR)
    .transform((value) => (value ? (normalisePhone(value)?.e164 ?? value) : null)),
  marketingOptIn: z
    .union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()])
    .transform((value) => value === "on" || value === "true"),
});

/** Only same-site relative paths are accepted as post-login destinations (prevents open redirects). */
export function safeRedirectPath(next: string | null | undefined, fallback = "/account") {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/register")) return fallback;
  return next;
}
