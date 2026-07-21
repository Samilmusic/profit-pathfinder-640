import { z } from "zod";

export const TRANSFER_METHODS = ["bank_transfer", "cash_delivery", "wallet_transfer", "other"] as const;
export const COMMISSION_METHODS = ["fixed", "percentage", "included", "free"] as const;
export const PAYMENT_DESTINATIONS = [
  "into_account",
  "cash_to_us",
  "to_third_party",
  "settles_linked_buy",
  "pending",
] as const;

const uuid = z.string().uuid();
const optStr = z.string().trim().min(1).nullable().optional().or(z.literal("").transform(() => null));
const posNum = z.number().finite().positive();
const nonNegNum = z.number().finite().nonnegative();
const optPosNum = z.number().finite().positive().nullable().optional();

export const remittanceV2CreateSchema = z
  .object({
    entry_date: z.string().min(1, "Date required"),
    customer_id: uuid,
    customer_phone: optStr,
    customer_reference: optStr,
    transfer_currency: z.string().min(1),
    transferred_amount: posNum,
    transfer_method: z.enum(TRANSFER_METHODS),
    beneficiary_name: z.string().trim().min(1, "Beneficiary name required"),
    beneficiary_country: optStr,
    customer_payment_currency: z.string().min(1),
    customer_payment_amount: nonNegNum.nullable().optional(),
    reference_rate: optPosNum,
    payment_destination: z.enum(PAYMENT_DESTINATIONS),
    third_party_customer_id: uuid.nullable().optional(),
    third_party_name: optStr,
    settlement_amount: nonNegNum.nullable().optional(),
    settlement_currency: z.string().min(1).nullable().optional(),
    commission_method: z.enum(COMMISSION_METHODS),
    commission_fixed_amount: nonNegNum.nullable().optional(),
    commission_fixed_currency: z.string().min(1).nullable().optional(),
    commission_percentage: nonNegNum.nullable().optional(),
    notes: optStr,
  })
  .superRefine((v, ctx) => {
    if (v.payment_destination === "to_third_party" && !v.third_party_customer_id && !v.third_party_name) {
      ctx.addIssue({
        code: "custom",
        path: ["third_party_name"],
        message: "Choose a third-party customer or enter a name",
      });
    }
    if (v.commission_method === "fixed") {
      if (v.commission_fixed_amount == null || v.commission_fixed_amount <= 0) {
        ctx.addIssue({ code: "custom", path: ["commission_fixed_amount"], message: "Fixed amount required" });
      }
      if (!v.commission_fixed_currency) {
        ctx.addIssue({ code: "custom", path: ["commission_fixed_currency"], message: "Currency required" });
      }
    }
    if (v.commission_method === "percentage") {
      if (v.commission_percentage == null || v.commission_percentage <= 0) {
        ctx.addIssue({ code: "custom", path: ["commission_percentage"], message: "Percentage required" });
      }
    }
  });

export type RemittanceV2CreateInput = z.infer<typeof remittanceV2CreateSchema>;