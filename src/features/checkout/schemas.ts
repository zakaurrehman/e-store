import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";
import { isCountryCode } from "@/lib/countries";

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
    .regex(/^[+()\d\s.-]*$/, "Enter a valid phone number.")
    .optional()
    .transform((value) => value || null),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const quoteSchema = z.object({
  country: z.string().length(2).toUpperCase(),
  region: z.string().max(60).optional(),
  shippingMethodId: z.string().max(40).optional(),
});

export const placeOrderSchema = z.object({
  idempotencyKey: z.string().min(16).max(80),
  email: emailSchema,
  phone: z.string().trim().max(32).optional().transform((value) => value || null),
  shippingAddressId: z.string().max(40).optional(),
  shippingAddress: addressSchema.optional(),
  billingSameAsShipping: z.boolean().default(true),
  billingAddress: addressSchema.optional(),
  shippingMethodId: z.string().min(1, "Choose a delivery method.").max(40),
  paymentProvider: z.string().min(1, "Choose a payment method.").max(20),
  customerNote: z.string().trim().max(500).optional().transform((value) => value || null),
  saveAddress: z.boolean().default(false),
  marketingOptIn: z.boolean().default(false),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
