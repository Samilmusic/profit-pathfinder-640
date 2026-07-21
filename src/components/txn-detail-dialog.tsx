import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SETTLEMENT_STATUSES, HOLDER_TYPES, statusLabel } from "@/lib/settlement";
import { DocumentsPanel, type DocumentsPanelHandle, type RefType } from "@/components/documents-panel";
import { SettlementStatusBadge } from "@/components/settlement-status-badge";
import { fmt } from "@/lib/exchange";
import { copyText } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Upload, Camera, ShieldCheck, Hash, MessageCircle, UserCheck, Printer,
  Link2, CheckCircle2, Circle, Clock, ChevronDown, ChevronRight, FileText,
  Wallet, Package, PenSquare, ArrowRight, Zap,
} from "lucide-react";

type Table = "buy_transactions" | "sell_transactions" | "expenses" | "transfers";

const REF_FOR_TABLE: Record<Table, RefType> = {
  buy_transactions: "buy",
  sell_transactions: "sell",
  expenses: "expense",
  transfers: "transfer",
};

const ROUTE_FOR_TABLE: Record<Table, string> = {
  buy_transactions: "/buy",
  sell_transactions: "/sell",
  expenses: "/expenses",
  transfers: "/transfers",
};

/* ─────────────────────────────── helpers ─────────────────────────────── */

function dealSummary(table: Table, row: any) {
  if (!row) return null;
  if (table === "buy_transactions") {
    return {
      title: `Buy · ${row.bought_currency}`,
      moneyIn: { label: "Received", amount: row.bought_amount, ccy: row.bought_currency },
      moneyOut: { label: "Paid", amount: row.paid_amount, ccy: row.paid_currency },
      rate: row.buy_rate,
      profit: null as number | null,
    };
  }
  if (table === "sell_transactions") {
    return {
      title: `Sell · ${row.sold_currency}`,
      moneyIn: { label: "Received", amount: row.received_amount, ccy: row.received_currency },
      moneyOut: { label: "Sold", amount: row.sold_amount, ccy: row.sold_currency },
      rate: row.sell_rate,
      profit: Number(row.gross_profit ?? NaN),
    };
  }
  if (table === "expenses") {
    return {
      title: `Expense · ${row.kind ?? ""}`,
      moneyIn: null,
      moneyOut: { label: "Amount", amount: row.amount, ccy: row.currency },
      rate: null, profit: null,
    };
  }
  return {
    title: `Transfer · ${row.currency ?? ""}`,
    moneyIn: null,
    moneyOut: { label: "Amount", amount: row.amount, ccy: row.currency },
    rate: null, profit: null,
  };
}

type Verification = {
  method: "manual" | "reference" | "customer" | "approval";
  at: string;
  by: string;
  detail: string;
};

/** We persist verifications inside completion_note as newline-tagged JSON so
 *  no schema changes are needed and audit trails stay intact. */
const V_TAG = "@@VERIFY";
function parseVerifications(note: string | null | undefined): { plain: string; entries: Verification[] } {
  const src = note ?? "";
  const lines = src.split("\n");
  const entries: Verification[] = [];
  const plain: string[] = [];
  for (const l of lines) {
    if (l.startsWith(V_TAG + " ")) {
      try { entries.push(JSON.parse(l.slice(V_TAG.length + 1))); continue; } catch { /* fall through */ }
    }
    plain.push(l);
  }
  return { plain: plain.join("\n").trim(), entries };
}
function serializeNote(plain: string, entries: Verification[]) {
  const parts = [plain.trim()].filter(Boolean);
  for (const e of entries) parts.push(`${V_TAG} ${JSON.stringify(e)}`);
  return parts.join("\n");
}

function methodLabel(m: Verification["method"]) {
  return m === "manual" ? "Manual verification"
    : m === "reference" ? "Bank reference"
    : m === "customer" ? "Customer confirmation"
    : "Internal approval";
}

/* ─────────────────────────────── main ─────────────────────────────── */

export function TxnDetailDialog({
  open, onOpenChange, table, row, showHolders,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  table: Table;
  row: any | null;
  showHolders?: boolean;
}) {
  const qc = useQueryClient();
  const docsRef = useRef<DocumentsPanelHandle>(null);

  const [status, setStatus] = useState<string>("draft");
  const [plainNote, setPlainNote] = useState("");
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [moneyHolder, setMoneyHolder] = useState<string>("");
  const [currencyHolder, setCurrencyHolder] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  useEffect(() => {
    if (!row) return;
    setStatus(row.settlement_status ?? "draft");
    const parsed = parseVerifications(row.completion_note);
    setPlainNote(parsed.plain);
    setVerifications(parsed.entries);
    setMoneyHolder(row.money_holder_type ?? "");
    setCurrencyHolder(row.currency_holder_type ?? "");
    setDueDate(row.due_date ?? "");
  }, [row]);

  const refType = row ? REF_FOR_TABLE[table] : null;

  const docsQ = useQuery({
    queryKey: ["documents", refType, row?.id],
    enabled: !!row?.id && !!refType,
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*")
        .eq("ref_type", refType!).eq("ref_id", row.id).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const custQ = useQuery({
    queryKey: ["customer-lite", row?.customer_id],
    enabled: !!row?.customer_id,
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id,name,phone").eq("id", row.customer_id).maybeSingle();
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (extra?: Partial<{ status: string; verifications: Verification[] }>) => {
      if (!row) return;
      const nextStatus = extra?.status ?? status;
      const nextVerifs = extra?.verifications ?? verifications;
      const patch: any = {
        settlement_status: nextStatus,
        completion_note: serializeNote(plainNote, nextVerifs) || null,
      };
      if (showHolders) {
        patch.money_holder_type = moneyHolder || null;
        patch.currency_holder_type = currencyHolder || null;
        patch.due_date = dueDate || null;
      }
      const { error } = await supabase.from(table).update(patch).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!row) return null;
  const summary = dealSummary(table, row)!;
  const docs = docsQ.data ?? [];
  const cust = custQ.data;

  const addVerification = async (v: Omit<Verification, "at" | "by">) => {
    const { data: u } = await supabase.auth.getUser();
    const entry: Verification = { ...v, at: new Date().toISOString(), by: u.user?.email ?? "operator" };
    const next = [...verifications, entry];
    setVerifications(next);
    await save.mutateAsync({ verifications: next });
  };

  const quickStatus = async (next: string) => {
    setStatus(next);
    await save.mutateAsync({ status: next });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92dvh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Complete this trade</DialogTitle>
        </DialogHeader>

        <StickySummary
          title={summary.title}
          dealCode={row.deal_code ?? row.id?.slice(0, 8)}
          customerName={cust?.name}
          status={status}
          moneyIn={summary.moneyIn}
          moneyOut={summary.moneyOut}
          rate={summary.rate}
          profit={summary.profit}
        />

        <div className="p-4 sm:p-5 space-y-4">
          <NextActionCard
            status={status}
            docsCount={docs.length}
            verificationsCount={verifications.length}
            onUpload={() => docsRef.current?.openFilePicker("payment_receipt")}
          />

          <QuickActionsBar
            onUpload={() => docsRef.current?.openFilePicker("payment_receipt")}
            onCamera={() => docsRef.current?.openCamera("payment_receipt")}
            onMarkPayment={() => quickStatus("payment_received")}
            onMarkDelivery={() => quickStatus("currency_delivered")}
            onCopyLink={() => {
              const url = `${window.location.origin}${ROUTE_FOR_TABLE[table]}#${row.id}`;
              copyText(url, "Deal link copied");
            }}
            onWhatsApp={() => {
              const msg = `Deal ${row.deal_code ?? ""}\nStatus: ${statusLabel(status)}\n${summary.title}`;
              const phone = (cust?.phone ?? "").replace(/[^\d]/g, "");
              window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
            }}
            onPrint={() => window.print()}
          />

          <Section
            icon={<Clock className="h-4 w-4" />}
            title="Timeline"
            subtitle={`${verifications.length} verification${verifications.length === 1 ? "" : "s"} · ${docs.length} document${docs.length === 1 ? "" : "s"}`}
            defaultOpen
          >
            <EnhancedTimeline row={row} status={status} docs={docs} verifications={verifications} />
          </Section>

          <Section
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Verification & Settlement"
            subtitle="Choose how this trade is confirmed"
            defaultOpen
          >
            <VerificationMethods
              docsRef={docsRef}
              onAdd={addVerification}
            />
          </Section>

          <Section
            icon={<FileText className="h-4 w-4" />}
            title={`Documents (${docs.length})`}
            subtitle="Receipts, invoices, IDs, transfer proofs"
          >
            <DocumentsPanel ref={docsRef} refType={refType!} refId={row.id} compact />
          </Section>

          <Section
            icon={<PenSquare className="h-4 w-4" />}
            title="Notes"
            subtitle="Free-form confirmation note"
          >
            <Textarea
              rows={3}
              value={plainNote}
              onChange={(e) => setPlainNote(e.target.value)}
              placeholder="e.g. Cash handed to customer, both sides confirmed on WhatsApp."
            />
          </Section>

          <Section
            icon={<Zap className="h-4 w-4" />}
            title="Advanced"
            subtitle="Status, custody, due date"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <FieldRow label="Settlement status">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SETTLEMENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>
              {showHolders && (
                <>
                  <FieldRow label="Due date">
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </FieldRow>
                  <FieldRow label="Cash currently with">
                    <Select value={moneyHolder || "__none"} onValueChange={(v) => setMoneyHolder(v === "__none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— none —</SelectItem>
                        {HOLDER_TYPES.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FieldRow>
                  <FieldRow label="Currency currently with">
                    <Select value={currencyHolder || "__none"} onValueChange={(v) => setCurrencyHolder(v === "__none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— none —</SelectItem>
                        {HOLDER_TYPES.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FieldRow>
                </>
              )}
            </div>
          </Section>

          <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 border-t bg-background/95 backdrop-blur flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            Completion is blocked by the system unless the required documents and a confirmation note are attached.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── sticky summary ─────────────────────────── */

function StickySummary({
  title, dealCode, customerName, status, moneyIn, moneyOut, rate, profit,
}: {
  title: string; dealCode?: string; customerName?: string; status: string;
  moneyIn: { label: string; amount: any; ccy: string } | null;
  moneyOut: { label: string; amount: any; ccy: string } | null;
  rate: any; profit: number | null;
}) {
  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 sm:px-5 py-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Deal Completion Center</div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-lg font-semibold truncate">{title}</div>
            {dealCode && <Badge variant="secondary" className="font-mono text-[10px] shrink-0">{dealCode}</Badge>}
          </div>
          {customerName && <div className="text-xs text-muted-foreground truncate">Customer · {customerName}</div>}
        </div>
        <SettlementStatusBadge value={status} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {moneyIn && <StatCell label={moneyIn.label} value={moneyIn.amount != null ? `${fmt(moneyIn.amount, moneyIn.ccy)} ${moneyIn.ccy}` : "—"} />}
        {moneyOut && <StatCell label={moneyOut.label} value={moneyOut.amount != null ? `${fmt(moneyOut.amount, moneyOut.ccy)} ${moneyOut.ccy}` : "—"} />}
        {rate != null && <StatCell label="Rate" value={fmt(rate)} />}
        {profit != null && !Number.isNaN(profit) && (
          <StatCell label="Profit" value={fmt(profit)} tone={profit > 0 ? "success" : profit < 0 ? "danger" : "muted"} />
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "muted" }) {
  return (
    <div className={cn(
      "rounded-md border px-2.5 py-1.5 bg-secondary/40",
      tone === "success" && "border-emerald-200 bg-emerald-50/60",
      tone === "danger" && "border-rose-200 bg-rose-50/60",
    )}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(
        "text-sm font-mono tabular-nums truncate",
        tone === "success" && "text-emerald-700",
        tone === "danger" && "text-rose-700",
      )}>{value}</div>
    </div>
  );
}

/* ─────────────────────────── next action ─────────────────────────── */

function nextStep(status: string, docsCount: number, verifCount: number) {
  if (status === "completed") return { title: "Trade complete", detail: "No further action required.", remaining: 0, tone: "success" as const };
  if (status === "cancelled") return { title: "Trade cancelled", detail: "This trade will not settle.", remaining: 0, tone: "muted" as const };
  if (status === "draft" || status === "awaiting_payment") {
    return { title: "Waiting for payment", detail: docsCount === 0 && verifCount === 0 ? "Upload a receipt or verify manually." : "Mark payment received when funds arrive.", remaining: 3, tone: "warning" as const };
  }
  if (status === "payment_received" || status === "awaiting_delivery") {
    return { title: "Deliver currency", detail: "Hand over currency, then mark delivered.", remaining: 2, tone: "warning" as const };
  }
  if (status === "currency_delivered" || status === "awaiting_receipt") {
    return { title: "Confirm final receipt", detail: "Upload the final proof or record customer confirmation.", remaining: 1, tone: "warning" as const };
  }
  return { title: "Review", detail: "Choose a verification method to advance the trade.", remaining: 3, tone: "info" as const };
}

function NextActionCard({ status, docsCount, verificationsCount, onUpload }: {
  status: string; docsCount: number; verificationsCount: number; onUpload: () => void;
}) {
  const step = nextStep(status, docsCount, verificationsCount);
  return (
    <Card className={cn(
      "p-4 border-l-4",
      step.tone === "success" && "border-l-emerald-500",
      step.tone === "warning" && "border-l-amber-500",
      step.tone === "info" && "border-l-sky-500",
      step.tone === "muted" && "border-l-muted-foreground/40",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full",
          step.tone === "success" ? "bg-emerald-100 text-emerald-700"
            : step.tone === "warning" ? "bg-amber-100 text-amber-800"
              : step.tone === "info" ? "bg-sky-100 text-sky-800"
                : "bg-muted text-muted-foreground",
        )}>
          <ArrowRight className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Recommended next step</div>
          <div className="text-base font-semibold">{step.title}</div>
          <div className="text-sm text-muted-foreground">{step.detail}</div>
        </div>
        {step.remaining > 0 && (
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold tabular-nums leading-none">{step.remaining}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">steps left</div>
          </div>
        )}
      </div>
      {step.tone === "warning" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={onUpload}><Upload className="h-4 w-4 mr-1.5" /> Upload receipt</Button>
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────── quick actions ─────────────────────────── */

function QuickActionsBar(props: {
  onUpload: () => void; onCamera: () => void;
  onMarkPayment: () => void; onMarkDelivery: () => void;
  onCopyLink: () => void; onWhatsApp: () => void; onPrint: () => void;
}) {
  const items: { icon: any; label: string; onClick: () => void }[] = [
    { icon: Upload, label: "Upload receipt", onClick: props.onUpload },
    { icon: Camera, label: "Take photo", onClick: props.onCamera },
    { icon: Wallet, label: "Payment received", onClick: props.onMarkPayment },
    { icon: Package, label: "Currency delivered", onClick: props.onMarkDelivery },
    { icon: MessageCircle, label: "WhatsApp", onClick: props.onWhatsApp },
    { icon: Link2, label: "Copy link", onClick: props.onCopyLink },
    { icon: Printer, label: "Print", onClick: props.onPrint },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map(({ icon: Icon, label, onClick }) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          onClick={onClick}
          className="h-auto justify-start gap-2 py-2.5"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate text-xs">{label}</span>
        </Button>
      ))}
    </div>
  );
}

/* ─────────────────────── verification method cards ─────────────────────── */

function VerificationMethods({
  docsRef, onAdd,
}: {
  docsRef: React.RefObject<DocumentsPanelHandle>;
  onAdd: (v: Omit<Verification, "at" | "by">) => Promise<void>;
}) {
  const [active, setActive] = useState<Verification["method"] | "upload" | "camera" | null>(null);
  const cards = [
    { id: "upload", icon: Upload, title: "Upload receipt", desc: "Bank receipt or screenshot" },
    { id: "camera", icon: Camera, title: "Take photo", desc: "Use device camera" },
    { id: "manual", icon: ShieldCheck, title: "Verify manually", desc: "For cash or in-person" },
    { id: "reference", icon: Hash, title: "By reference #", desc: "Bank transfer reference" },
    { id: "customer", icon: UserCheck, title: "Customer confirmed", desc: "Recorded on call / message" },
    { id: "approval", icon: ShieldCheck, title: "Internal approval", desc: "Manager sign-off" },
  ] as const;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {cards.map((c) => {
          const Icon = c.icon;
          const isActive = active === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                if (c.id === "upload") { docsRef.current?.openFilePicker("payment_receipt"); return; }
                if (c.id === "camera") { docsRef.current?.openCamera("payment_receipt"); return; }
                setActive(isActive ? null : c.id);
              }}
              className={cn(
                "text-left rounded-lg border p-3 transition-colors bg-card hover:bg-accent/50",
                isActive && "border-primary ring-1 ring-primary/40 bg-accent/40",
              )}
            >
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{c.desc}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {active === "manual" && (
        <VerifyForm
          key="manual"
          fields={[
            { name: "reason", label: "Reason", required: true, placeholder: "e.g. Cash handed over in person" },
            { name: "verified_by", label: "Verified by", required: true, placeholder: "Name" },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          onSubmit={async (values) => {
            await onAdd({
              method: "manual",
              detail: `Reason: ${values.reason} · Verified by: ${values.verified_by}${values.notes ? " · " + values.notes : ""}`,
            });
            setActive(null);
          }}
          onCancel={() => setActive(null)}
        />
      )}
      {active === "reference" && (
        <VerifyForm
          key="reference"
          fields={[
            { name: "bank", label: "Bank", required: true },
            { name: "reference", label: "Reference number", required: true, mono: true },
            { name: "date", label: "Date", type: "date" },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          onSubmit={async (values) => {
            await onAdd({
              method: "reference",
              detail: `${values.bank} · Ref ${values.reference}${values.date ? " · " + values.date : ""}${values.notes ? " · " + values.notes : ""}`,
            });
            setActive(null);
          }}
          onCancel={() => setActive(null)}
        />
      )}
      {active === "customer" && (
        <VerifyForm
          key="customer"
          fields={[
            { name: "confirmed", label: "Customer confirmed receiving / sending funds", type: "checkbox", required: true },
            { name: "channel", label: "Channel", placeholder: "WhatsApp / phone / in person" },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          onSubmit={async (values) => {
            await onAdd({
              method: "customer",
              detail: `Confirmed via ${values.channel || "customer"}${values.notes ? " · " + values.notes : ""}`,
            });
            setActive(null);
          }}
          onCancel={() => setActive(null)}
        />
      )}
      {active === "approval" && (
        <VerifyForm
          key="approval"
          fields={[
            { name: "approved_by", label: "Approved by", required: true, placeholder: "Manager name" },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          onSubmit={async (values) => {
            await onAdd({
              method: "approval",
              detail: `Approved by ${values.approved_by}${values.notes ? " · " + values.notes : ""}`,
            });
            setActive(null);
          }}
          onCancel={() => setActive(null)}
        />
      )}
    </div>
  );
}

type FormField = {
  name: string; label: string; type?: "text" | "textarea" | "date" | "checkbox";
  required?: boolean; placeholder?: string; mono?: boolean;
};

function VerifyForm({
  fields, onSubmit, onCancel,
}: {
  fields: FormField[];
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => fields.every((f) => !f.required || (f.type === "checkbox" ? values[f.name] === "true" : (values[f.name] ?? "").trim().length > 0)), [fields, values]);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        try { await onSubmit(values); } finally { setSubmitting(false); }
      }}
      className="rounded-lg border p-3 space-y-3 bg-secondary/30"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.name} className={cn("space-y-1.5", f.type === "textarea" && "sm:col-span-2")}>
            <Label className="text-xs">{f.label}{f.required && <span className="text-rose-500"> *</span>}</Label>
            {f.type === "textarea" ? (
              <Textarea rows={2} value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} placeholder={f.placeholder} />
            ) : f.type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values[f.name] === "true"}
                  onCheckedChange={(c) => setValues((v) => ({ ...v, [f.name]: c ? "true" : "false" }))}
                />
                <span>{f.placeholder ?? "Yes, confirmed"}</span>
              </label>
            ) : (
              <Input
                type={f.type ?? "text"}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.placeholder}
                className={cn(f.mono && "font-mono")}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!canSubmit || submitting}>{submitting ? "Recording…" : "Record verification"}</Button>
      </div>
    </form>
  );
}

/* ─────────────────────────── enhanced timeline ─────────────────────────── */

function EnhancedTimeline({
  row, status, docs, verifications,
}: {
  row: any; status: string; docs: any[]; verifications: Verification[];
}) {
  const paymentDoc = docs.find((d) => ["payment_receipt", "bank_transfer_screenshot", "cash_delivery_receipt", "whatsapp_confirmation"].includes(d.doc_type));
  const deliveryDoc = docs.find((d) => ["currency_handover_proof", "cash_delivery_receipt", "bank_transfer_screenshot"].includes(d.doc_type));
  const paymentVerified = !!paymentDoc || verifications.some((v) => v.method !== "approval") || ["payment_received", "awaiting_delivery", "currency_delivered", "awaiting_receipt", "completed"].includes(status);
  const deliveryDone = !!deliveryDoc || ["currency_delivered", "awaiting_receipt", "completed"].includes(status);
  const proofDone = docs.length > 0 || verifications.length > 0;

  const events: { icon: any; label: string; at: string | null; done: boolean; note?: string }[] = [
    { icon: PenSquare, label: "Trade created", at: row.created_at ?? null, done: true },
    { icon: Wallet, label: "Payment received", at: paymentDoc?.created_at ?? null, done: paymentVerified, note: paymentDoc ? paymentDoc.file_name : undefined },
    { icon: ShieldCheck, label: "Verification recorded", at: verifications[verifications.length - 1]?.at ?? null, done: verifications.length > 0, note: verifications.length > 0 ? `${verifications.length} entr${verifications.length === 1 ? "y" : "ies"}` : undefined },
    { icon: Package, label: "Currency delivered", at: deliveryDoc?.created_at ?? null, done: deliveryDone },
    { icon: FileText, label: `Delivery proof (${docs.length})`, at: docs[docs.length - 1]?.created_at ?? null, done: proofDone },
    { icon: CheckCircle2, label: "Closed", at: status === "completed" ? row.updated_at ?? null : null, done: status === "completed" },
  ];

  return (
    <ol className="relative pl-6 space-y-3">
      <span className="absolute left-[10px] top-1.5 bottom-1.5 w-px bg-border" aria-hidden />
      {events.map((e, i) => {
        const Icon = e.done ? e.icon : Circle;
        return (
          <li key={i} className="relative">
            <span className={cn(
              "absolute -left-6 top-0.5 grid h-5 w-5 place-items-center rounded-full border bg-background",
              e.done ? "border-emerald-500 text-emerald-600" : "border-border text-muted-foreground",
            )}>
              <Icon className="h-3 w-3" />
            </span>
            <div className={cn("text-sm", e.done ? "text-foreground" : "text-muted-foreground")}>{e.label}</div>
            {(e.at || e.note) && (
              <div className="text-[11px] text-muted-foreground">
                {e.at && new Date(e.at).toLocaleString()}
                {e.at && e.note ? " · " : ""}
                {e.note}
              </div>
            )}
          </li>
        );
      })}
      {verifications.length > 0 && (
        <li className="relative pt-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Verification log</div>
          <ul className="space-y-1">
            {verifications.map((v, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{methodLabel(v.method)}</span>
                {" · "}{new Date(v.at).toLocaleString()}{" · "}{v.by}
                <div className="text-muted-foreground">{v.detail}</div>
              </li>
            ))}
          </ul>
        </li>
      )}
    </ol>
  );
}

/* ─────────────────────────── collapsible section ─────────────────────────── */

function Section({
  icon, title, subtitle, defaultOpen = false, children,
}: {
  icon: ReactNode; title: ReactNode; subtitle?: ReactNode;
  defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-primary shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 border-t pt-3">{children}</div>}
    </Card>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}