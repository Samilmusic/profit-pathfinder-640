import { supabase } from "@/integrations/supabase/client";

const device = () => {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent || "";
  const w = typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "";
  return `${ua.slice(0, 120)} · ${w}`.trim();
};

export async function setEditContext(reason: string) {
  const { error } = await supabase.rpc("set_edit_context", { _reason: reason, _device: device() });
  if (error) throw error;
}

/** Runs `fn` after registering the mandatory edit reason with the DB so the audit trigger captures it. */
export async function withEditReason<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  if (!reason || !reason.trim()) throw new Error("Reason for edit is required");
  await setEditContext(reason.trim());
  return fn();
}

export async function cancelRecord(table: string, id: string, reason: string) {
  if (!reason || !reason.trim()) throw new Error("Reason for cancel is required");
  const { error } = await supabase.rpc("cancel_record", {
    _table: table,
    _id: id,
    _reason: reason.trim(),
    _device: device(),
  });
  if (error) throw error;
}

export const EDIT_REASONS = [
  "Wrong amount",
  "Wrong rate",
  "Wrong account",
  "Wrong customer",
  "Wrong currency",
  "Typing mistake",
  "Duplicate transaction",
  "Other",
];