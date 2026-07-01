import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

async function writeClipboard(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // Fallback for older Safari / non-secure contexts
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string, label = "Copied") {
  if (!text) return;
  const ok = await writeClipboard(String(text));
  if (ok) toast.success(label);
  else toast.error("Copy failed");
}

export function CopyButton({
  value,
  label = "Copied",
  className,
  size = "icon",
  title = "Copy",
}: {
  value?: string | number | null;
  label?: string;
  className?: string;
  size?: "icon" | "sm";
  title?: string;
}) {
  const [done, setDone] = useState(false);
  if (value === null || value === undefined || value === "") return null;
  const handle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await copyText(String(value), label);
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };
  if (size === "sm") {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={handle} className={cn("h-7 px-2 text-xs gap-1", className)} title={title}>
        {done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        Copy
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handle}
      className={cn("h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground", className)}
      title={title}
      aria-label={title}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

/** Row: label + monospace value + copy icon. Value hidden when empty. */
export function CopyRow({
  label, value, mono = true,
}: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("text-sm truncate", mono && "font-mono tabular-nums")}>{String(value)}</div>
      </div>
      <CopyButton value={String(value)} label={`${label} copied`} title={`Copy ${label}`} />
    </div>
  );
}

/** Build a multi-line "Bank / Account holder / IBAN / …" block for a customer bank account. */
export function formatBankAccountDetails(a: any): string {
  const lines = [
    a.nickname ? `Nickname: ${a.nickname}` : null,
    a.bank_name ? `Bank: ${a.bank_name}` : null,
    a.holder_name ? `Account Holder: ${a.holder_name}` : null,
    a.currency ? `Currency: ${a.currency}` : null,
    a.iban ? `IBAN: ${a.iban}` : null,
    a.account_number ? `Account Number: ${a.account_number}` : null,
    a.card_number ? `Card Number: ${a.card_number}` : null,
    a.swift_bic ? `SWIFT/BIC: ${a.swift_bic}` : null,
    a.sort_code ? `Sort Code: ${a.sort_code}` : null,
    a.country ? `Country: ${a.country}` : null,
    a.phone ? `Phone: ${a.phone}` : null,
    a.notes ? `Notes: ${a.notes}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export function CopyFullDetailsButton({ account, className }: { account: any; className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("h-7 px-2 text-xs gap-1", className)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyText(formatBankAccountDetails(account), "Full account details copied"); }}
    >
      <Copy className="h-3.5 w-3.5" /> Copy full details
    </Button>
  );
}
