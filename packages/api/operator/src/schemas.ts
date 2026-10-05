import { z } from "zod";

import { isIsoDate, MAX_CENTS } from "@moonship/shared";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine(isIsoDate, "Not a real date");

export const idSchema = z.string().uuid();

export const centsSchema = z.number().int().min(-MAX_CENTS).max(MAX_CENTS);

export const nonNegativeCentsSchema = centsSchema.min(0);

export const addressSchema = z.object({
  street1: z.string().trim().min(1),
  street2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  country: z.string().trim().min(1),
});

export const leaseInputSchema = z.object({
  startDate: isoDate,
  endDate: isoDate,
  moveOutDate: isoDate.nullable().optional(),
  rentSteps: z
    .array(
      z.object({
        id: idSchema.optional(),
        startsOn: isoDate,
        amountCents: nonNegativeCentsSchema,
      }),
    )
    .min(1),
  estimates: z
    .array(
      z.object({
        poolId: idSchema,
        steps: z
          .array(
            z.object({
              startsOn: isoDate,
              amountCents: nonNegativeCentsSchema,
            }),
          )
          .min(1),
      }),
    )
    .default([]),
  lateFee: z
    .object({
      amountCents: centsSchema.positive(),
      day: z.number().int().min(1).max(28),
    })
    .nullable()
    .optional(),
  insuranceExpiresOn: isoDate.nullable().optional(),
});

export type LeaseInput = z.infer<typeof leaseInputSchema>;
