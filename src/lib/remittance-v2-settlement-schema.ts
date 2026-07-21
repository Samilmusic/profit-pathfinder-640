import { z } from "zod";

/**
 * Phase 4E — Zod schemas for the three settlement RPC payloads.
 * Monetary values remain `z.number()` end-to-end; the RPCs accept `numeric`
 * directly. No `is_final` field: finality is derived on the server from
 * cumulative delivered vs. required delivery amount.
 */

const uuid = z.string().uuid();
const posNum = z.number().finite().positive();

export const markFundsReceivedSchema = z.object({
  remittance_id: uuid,
  account_id: uuid,
  amount: posNum,
  note: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});
export type MarkFundsReceivedInput = z.infer<typeof markFundsReceivedSchema>;

export const recordThirdPartySettlementSchema = z.object({
  remittance_id: uuid,
  third_party_customer_id: uuid,
  amount: posNum,
  note: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});
export type RecordThirdPartySettlementInput = z.infer<typeof recordThirdPartySettlementSchema>;

export const recordSupplierDeliverySchema = z.object({
  remittance_id: uuid,
  buy_id: uuid,
  delivered_amount: posNum,
  received_into_account_id: uuid,
  delivered_at: z.string().min(1),
  note: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});
export type RecordSupplierDeliveryInput = z.infer<typeof recordSupplierDeliverySchema>;