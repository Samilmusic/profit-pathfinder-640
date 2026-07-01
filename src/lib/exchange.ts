import { supabase } from "@/integrations/supabase/client";

export const CURRENCIES = ["AED", "IRR", "USD", "GBP", "EUR", "USDT"] as const;
export type Currency = string;

export const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash / Cash Box" },
  { value: "toman_bank", label: "Toman Bank" },
  { value: "aed_bank", label: "AED Bank" },
  { value: "foreign_currency", label: "Foreign Currency" },
  { value: "wallet", label: "Wallet / Crypto" },
] as const;

export const OWNERS = ["milad", "ali", "shared", "other"] as const;

// Rounding rules: IRR/Toman = whole numbers, everything else up to 4 decimals.
export function decimalsFor(currency?: string | null) {
  if (!currency) return 4;
  return currency === "IRR" ? 0 : 4;
}

export function roundAmount(n: number, currency?: string | null): number {
  if (!Number.isFinite(n)) return 0;
  const d = decimalsFor(currency);
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

export function fmt(n: number | string | null | undefined, currency?: string) {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(num)) return "—";
  const d = decimalsFor(currency);
  const s = num.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: currency === "IRR" ? 0 : 0 });
  return currency ? `${s} ${currency}` : s;
}

// Profit / P&L values: always show 2 decimals, regardless of currency.
export function fmtProfit(n: number | string | null | undefined, currency?: string) {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(num)) return "—";
  const s = num.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return currency ? `${s} ${currency}` : s;
}

export async function currentUserRole(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id);
  const roles = data?.map((r) => r.role) ?? [];
  if (roles.includes("admin")) return "admin";
  if (roles.includes("milad")) return "milad";
  if (roles.includes("ali")) return "ali";
  return roles[0] ?? "viewer";
}

export function canWrite(role: string | null) {
  return role === "admin" || role === "milad" || role === "ali";
}