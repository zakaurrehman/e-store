import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";
import { isCountryCode } from "@/lib/countries";
import { normalisePhone, PHONE_ERROR } from "@/lib/phone";

const text = (label: string, max: number) => z.string().trim().min(1, `Enter ${label}.`).max(max, `${label[0].toUpperCase()}${label.slice(1)} is too long.`);

export const addressSchema = z.object({
  firstName: text("a first name", 60),
  lastName: text("a last name", 60),
  company: z.string().trim().max(80).optional().transform((value) => value || null),
  line1: text("a street address", 120),
  line2: z.string().trim().max(120).optional().transform((value) => value || null),
  city: text("a city", 80),
  region: z.string().trim().max(60).optional().transform((value) => value || null),
  postalCode: text("a postal code", 20),
  country: z.string().trim().toUpperCase().refine(isCountryCode, "Choose a country."),
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((value) => value || null),
});

type AddressPhone = { phone: string | null; country: string };
type IssueSink = { addIssue: (issue: { code: "custom"; path: Array<string | number>; message: string }) => void };

/**
 * A phone number is checked against the numbering plan of the address's own country, so "12345", "(((("
 * or a number with too few digits is refused rather than kept as decoration.
 * Applied wherever an address is accepted (checkout and the account address book) with .superRefine.
 */
export function checkAddressPhone(value: AddressPhone, ctx: IssueSink) {
  if (value.phone && !normalisePhone(value.phone, value.country)) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: PHONE_ERROR });
  }
}

/** Stores the number in international form, so every screen and email shows the same thing. */
export function normaliseAddressPhone<T extends AddressPhone>(value: T): T {
  return { ...value, phone: value.phone ? (normalisePhone(value.phone, value.country)?.e164 ?? value.phone) : null };
}

/** An address with its phone number checked and normalised — what orders are placed with. */
export const validatedAddressSchema = addressSchema.superRefine(checkAddressPhone).transform(normaliseAddressPhone);

export type AddressInput = z.infer<typeof validatedAddressSchema>;

export const quoteSchema = z.object({
  country: z.string().length(2).toUpperCase(),
  region: z.string().max(60).optional(),
  shippingMethodId: z.string().max(40).optional(),
});

export const placeOrderSchema = z
  .object({
    idempotencyKey: z.string().min(16).max(80),
    email: emailSchema,
    phone: z.string().trim().max(32).optional().transform((value) => value || null),
    shippingAddressId: z.string().max(40).optional(),
    shippingAddress: validatedAddressSchema.optional(),
    billingSameAsShipping: z.boolean().default(true),
    billingAddress: validatedAddressSchema.optional(),
    shippingMethodId: z.string().min(1, "Choose a delivery method.").max(40),
    paymentProvider: z.string().min(1, "Choose a payment method.").max(20),
    customerNote: z.string().trim().max(500).optional().transform((value) => value || null),
    saveAddress: z.boolean().default(false),
    marketingOptIn: z.boolean().default(false),
  })
  // The contact number is read with the delivery country in mind, and kept in international form.
  .superRefine((value, ctx) => {
    if (value.phone && !normalisePhone(value.phone, value.shippingAddress?.country)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: PHONE_ERROR });
    }
  })
  .transform((value) => ({ ...value, phone: value.phone ? (normalisePhone(value.phone, value.shippingAddress?.country)?.e164 ?? value.phone) : null }));

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
