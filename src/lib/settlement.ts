export const SETTLEMENT_STATUSES = [
  { value: "draft", label: "Draft", tone: "muted" },
  { value: "awaiting_payment", label: "Waiting for payment", tone: "warning" },
  { value: "payment_received", label: "Payment received", tone: "info" },
  { value: "awaiting_delivery", label: "Waiting for currency delivery", tone: "warning" },
  { value: "currency_delivered", label: "Currency delivered", tone: "info" },
  { value: "awaiting_receipt", label: "Waiting for receipt", tone: "warning" },
  { value: "completed", label: "Completed", tone: "success" },
  { value: "cancelled", label: "Cancelled", tone: "muted" },
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number]["value"];

export const DOC_TYPES = [
  { value: "payment_receipt", label: "Payment receipt" },
  { value: "bank_transfer_screenshot", label: "Bank transfer screenshot" },
  { value: "cash_delivery_receipt", label: "Cash delivery receipt" },
  { value: "currency_handover_proof", label: "Currency handover proof" },
  { value: "whatsapp_confirmation", label: "WhatsApp confirmation screenshot" },
  { value: "invoice", label: "Invoice" },
  { value: "expense_receipt", label: "Expense receipt" },
  { value: "id_passport", label: "ID / Passport" },
  { value: "deposit_receipt", label: "Deposit receipt" },
  { value: "payment_order_proof", label: "Payment order proof" },
  { value: "other", label: "Other document" },
] as const;

export type DocType = (typeof DOC_TYPES)[number]["value"];

export const HOLDER_TYPES = [
  { value: "milad", label: "Milad" },
  { value: "ali", label: "Ali" },
  { value: "customer", label: "Customer" },
  { value: "other", label: "Other person" },
] as const;

export function statusLabel(s: string | null | undefined) {
  return SETTLEMENT_STATUSES.find((x) => x.value === s)?.label ?? s ?? "Draft";
}

export function docTypeLabel(t: string | null | undefined) {
  return DOC_TYPES.find((x) => x.value === t)?.label ?? t ?? "Document";
}

export function holderLabel(h: string | null | undefined) {
  return HOLDER_TYPES.find((x) => x.value === h)?.label ?? h ?? "";
}