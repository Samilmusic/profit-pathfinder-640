import { z } from "zod";

/**
 * Phase 4F — Zod schemas for the allocation lifecycle RPCs.
 * Numeric values remain `z.number()` end-to-end; the RPCs accept `numeric`.
 */

const uuid = z.string().uuid();
const posNum = z.number().finite().positive();
const nonEmptyReason = z.string().trim().min(1).max(500);
const optionalNote = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const allocateBuySchema = z.object({
  remittance_id: uuid,
  buy_id: uuid,
  amount: posNum,
  notes: optionalNote,
});
export type AllocateBuyInput = z.infer<typeof allocateBuySchema>;

export const reverseAllocationSchema = z.object({
  allocation_id: uuid,
  reason: nonEmptyReason,
});
export type ReverseAllocationInput = z.infer<typeof reverseAllocationSchema>;

export const prepareCloseSchema = z.object({
  remittance_id: uuid,
  note: optionalNote,
});
export type PrepareCloseInput = z.infer<typeof prepareCloseSchema>;

export const finalizeCloseSchema = z.object({
  remittance_id: uuid,
  note: optionalNote,
});
export type FinalizeCloseInput = z.infer<typeof finalizeCloseSchema>;

export const cancelRemittanceSchema = z.object({
  remittance_id: uuid,
  reason: nonEmptyReason,
});
export type CancelRemittanceInput = z.infer<typeof cancelRemittanceSchema>;