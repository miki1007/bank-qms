import { z } from "zod";

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

const customerPassword = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.");

export const customerRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: customerPassword,
});

export const customerLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const ticketCreateSchema = z.object({
  serviceTypeId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const ticketLookupSchema = z.object({
  branchCode: z.string().trim().min(2).max(20),
  publicNumber: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .transform((value) => value.toUpperCase()),
  lookupCode: z.string().regex(/^\d{6}$/),
});

export const transferSchema = z.object({
  destinationServiceTypeId: z.string().uuid(),
  note: z.string().trim().max(255).optional(),
});

export const settingsSchema = z.object({
  noShowTimeoutSeconds: z.number().int().min(30).max(600),
  kioskIdleTimeoutSeconds: z.number().int().min(15).max(300),
  displayHistoryCount: z.number().int().min(1).max(20),
  slaWaitMinutes: z.number().int().min(1).max(240),
});
