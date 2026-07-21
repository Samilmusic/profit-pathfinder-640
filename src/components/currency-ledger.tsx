import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDown, ArrowUp, Search, X, FileText, Package, ArrowRightLeft, CreditCard, Receipt, Landmark, RefreshCw } from "lucide-react";
// Detail links open as anchors to avoid strict typed-route issues

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const fmtAmt = (n: number) => nfInt.format(Math.abs(n));

type Row = {
  id: string;
  account_id: string | null;
  currency: string;
  amount: number;
  ref_type: string;
  ref_id: string | null;
  description: string | null;
  entry_date: string;
  created_at: string;
};

type Preset = "today" | "yesterday" | "7d" | "30d" | "all";

const ACTION_META: Record<string, { label: string; icon: any; codePrefix: string; table: string | null; codeCol: string | null }> = {
  buy:              { label: "Buy",       icon: Package,        codePrefix: "BUY",   table: "buy_transactions",   codeCol: "doc_no" },
  sell:             { label: "Sell",      icon: Package,        codePrefix: "SELL",  table: "sell_transactions",  codeCol: "doc_no" },
  brought_in:       { label: "Brought In",icon: Landmark,       codePrefix: "BI",    table: "brought_in_money",   codeCol: "doc_no" },
  expense:          { label: "Expense",   icon: Receipt,        codePrefix: "EXP",   table: "expenses",           codeCol: "doc_no" },
  transfer:         { label: "Transfer",  icon: ArrowRightLeft, codePrefix: "TRF",   table: "transfers",          codeCol: null },
  deposit:          { label: "Deposit",   icon: CreditCard,     codePrefix: "DEP",   table: "customer_deposits",  codeCol: null },
  sell_payment:     { label: "Payment",   icon: CreditCard,     codePrefix: "PAY",   table: "sell_payments",      codeCol: null },
  payment_order:    { label: "Payment Order", icon: CreditCard, codePrefix: "PO",    table: "payment_orders",     codeCol: null },
  service_charge:   { label: "Service Charge", icon: Receipt,   codePrefix: "SVC",   table: "service_charges",    codeCol: null },
  opening_balance:  { label: "Opening",   icon: Landmark,       codePrefix: "OPEN",  table: null,                 codeCol: null },
  adjustment:       { label: "Adjustment",icon: RefreshCw,      codePrefix: "ADJ",   table: null,                 codeCol: null },
};

function metaFor(refType: string) {
  return ACTION_META[refType] ?? { label: refType, icon: FileText, codePrefix: refType.toUpperCase(), table: null, codeCol: null };
}

function shortId(id: string | null | undefined) {
  if (!id) return "";
  return id.slice(0, 8).toUpperCase();
}

function rangeFor(preset: Preset): { from?: string; to?: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
  if (preset === "today")     return { from: iso(startOfDay(now)), to: iso(endOfDay(now)) };
  if (preset === "yesterday") { const y = new Date(now); y.setDate(y.getDate()-1); return { from: iso(startOfDay(y)), to: iso(endOfDay(y)) }; }
  if (preset === "7d")        { const s = new Date(now); s.setDate(s.getDate()-6); return { from: iso(startOfDay(s)), to: iso(endOfDay(now)) }; }
  if (preset === "30d")       { const s = new Date(now); s.setDate(s.getDate()-29); return { from: iso(startOfDay(s)), to: iso(endOfDay(now)) }; }
  return {};
}

export function CurrencyLedger({ ccy, marketRate = 0, avgCost = 0 }: { ccy: string; marketRate?: number; avgCost?: number }) {
  const [preset, setPreset] = useState<Preset>("30d");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);

  // Fetch full ledger for currency (for accurate running balance we need everything up to now)
  const ledgerQ = useQuery({
    queryKey: ["currency_ledger", ccy],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id,account_id,currency,amount,ref_type,ref_id,description,entry_date,created_at")
        .eq("currency", ccy)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 15_000,
  });

  const rows = ledgerQ.data ?? [];

  // Running balance ascending
  const rowsWithBal = useMemo(() => {
    let running = 0;
    return rows.map((r) => {
      running += Number(r.amount || 0);
      return { ...r, balanceAfter: running };
    });
  }, [rows]);

  // Accounts map
  const accountIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.account_id) s.add(r.account_id);
    return Array.from(s);
  }, [rows]);

  const accountsQ = useQuery({
    queryKey: ["currency_ledger_accounts", accountIds.sort().join(",")],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id,name,account_type,holder_person_name,holder_name,bank_name")
        .in("id", accountIds);
      if (error) throw error;
      const m = new Map<string, any>();
      for (const a of data ?? []) m.set(a.id, a);
      return m;
    },
  });

  // Batch fetch codes per table
  const refsByTable = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rows) {
      const meta = metaFor(r.ref_type);
      if (!meta.table || !meta.codeCol || !r.ref_id) continue;
      if (!m.has(meta.table)) m.set(meta.table, []);
      m.get(meta.table)!.push(r.ref_id);
    }
    return m;
  }, [rows]);

  const codesQ = useQuery({
    queryKey: ["currency_ledger_codes", ccy, Array.from(refsByTable.entries()).map(([t, ids]) => `${t}:${ids.length}`).join("|")],
    enabled: refsByTable.size > 0,
    queryFn: async () => {
      const codeMap = new Map<string, string>(); // ref_id -> code
      for (const [table, ids] of refsByTable.entries()) {
        const meta = Object.values(ACTION_META).find((m) => m.table === table);
        if (!meta?.codeCol) continue;
        const uniq = Array.from(new Set(ids));
        const { data, error } = await supabase
          .from(table as any)
          .select(`id,${meta.codeCol}`)
          .in("id", uniq);
        if (error) continue;
        for (const r of (data as any[]) ?? []) {
          if (r[meta.codeCol]) codeMap.set(r.id, r[meta.codeCol]);
        }
      }
      return codeMap;
    },
  });

  const accountLabel = (id: string | null | undefined) => {
    if (!id) return "—";
    const a = accountsQ.data?.get(id);
    if (!a) return "…";
    if (a.account_type === "person_holding") return `Cash with ${a.holder_person_name || a.holder_name || "person"}`;
    return a.name;
  };

  const codeFor = (r: Row) => {
    const meta = metaFor(r.ref_type);
    const code = r.ref_id ? codesQ.data?.get(r.ref_id) : undefined;
    if (code) return code;
    if (r.ref_id) return `${meta.codePrefix}-${shortId(r.ref_id)}`;
    return meta.codePrefix;
  };

  // Apply filters (on descending display)
  const range = rangeFor(preset);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rowsWithBal
      .filter((r) => {
        if (range.from && r.created_at < range.from) return false;
        if (range.to && r.created_at > range.to) return false;
        if (typeFilter !== "all" && r.ref_type !== typeFilter) return false;
        if (q) {
          const hay = `${r.description ?? ""} ${codeFor(r)} ${accountLabel(r.account_id)}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .reverse();
  }, [rowsWithBal, range.from, range.to, typeFilter, query, accountsQ.data, codesQ.data]);

  // Today summary (using entry_date or created_at day)
  const summary = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const t = todayStart.toISOString();
    let inSum = 0, outSum = 0;
    for (const r of rows) {
      if (r.created_at >= t) {
        if (r.amount > 0) inSum += r.amount;
        else outSum += -r.amount;
      }
    }
    const current = rowsWithBal.length ? rowsWithBal[rowsWithBal.length - 1].balanceAfter : 0;
    return { current, inSum, outSum, net: inSum - outSum };
  }, [rows, rowsWithBal]);

  const floating = avgCost > 0 && marketRate > 0
    ? { amount: (marketRate - avgCost) * summary.current, positive: marketRate >= avgCost }
    : null;

  const totalMkt = marketRate > 0 ? summary.current * marketRate : 0;

  const typeOptions: Array<{ v: string; label: string }> = [
    { v: "all", label: "All" },
    { v: "brought_in", label: "Brought In" },
    { v: "buy", label: "Buy" },
    { v: "sell", label: "Sell" },
    { v: "deposit", label: "Deposits" },
    { v: "expense", label: "Expenses" },
    { v: "transfer", label: "Transfers" },
    { v: "sell_payment", label: "Payments" },
    { v: "adjustment", label: "Adjustments" },
  ];

  return (
    <div className="bg-muted/10">
      {/* Summary strip */}
      <div className="px-4 md:px-6 py-4 border-b bg-background/40">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 md:gap-4">
          <Tile label="Current Balance" value={`${fmtAmt(summary.current)} ${ccy}`} strong />
          <Tile label="Today In"  value={`+${fmtAmt(summary.inSum)}`}  tone="ok" />
          <Tile label="Today Out" value={`-${fmtAmt(summary.outSum)}`} tone="danger" />
          <Tile label="Net Today" value={`${summary.net >= 0 ? "+" : "-"}${fmtAmt(summary.net)}`} tone={summary.net >= 0 ? "ok" : "danger"} />
          <Tile label="Avg Cost"  value={avgCost > 0 ? nfInt.format(avgCost) : "—"} />
          <Tile label="Market"    value={marketRate > 0 ? nfInt.format(marketRate) : "—"} />
          <Tile
            label="Floating P/L"
            value={floating ? `${floating.positive ? "+" : ""}${fmtAmt(floating.amount)}` : "—"}
            tone={floating ? (floating.positive ? "ok" : "danger") : undefined}
          />
        </div>
        {totalMkt > 0 && (
          <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
            Market value ≈ {nfInt.format(totalMkt)} {ccy === "AED" ? "IRR" : "IRR"}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="px-4 md:px-6 py-3 border-b bg-background/20 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {(["today","yesterday","7d","30d","all"] as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={(e) => { e.stopPropagation(); setPreset(p); }}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${preset === p ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
            >
              {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : p === "7d" ? "7D" : p === "30d" ? "30D" : "All"}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-border mx-1" />
        <select
          value={typeFilter}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-[11px] px-2 py-1 rounded-md border bg-background"
        >
          {typeOptions.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <div className="relative flex-1 min-w-[140px]">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, note, account…"
            className="w-full text-[11px] pl-7 pr-6 py-1 rounded-md border bg-background"
          />
          {query && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setQuery(""); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {filtered.length} of {rowsWithBal.length}
        </div>
      </div>

      {/* Rows */}
      <div className="max-h-[520px] overflow-y-auto">
        {ledgerQ.isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Loading ledger…</div>}
        {!ledgerQ.isLoading && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No entries match your filters.</div>
        )}
        <ul className="divide-y">
          {filtered.map((r) => {
            const meta = metaFor(r.ref_type);
            const Icon = meta.icon;
            const isIn = r.amount > 0;
            const isAdj = r.ref_type === "adjustment" || r.ref_type === "opening_balance";
            const amountColor = isAdj ? "text-muted-foreground" : isIn ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
            const dotColor    = isAdj ? "bg-muted-foreground"   : isIn ? "bg-emerald-500"                       : "bg-destructive";
            const code = codeFor(r);
            const acct = accountLabel(r.account_id);
            const time = new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const day  = new Date(r.created_at).toLocaleDateString([], { day: "2-digit", month: "short" });
            const isOpen = openRow === r.id;
            const detailHref = detailLinkFor(r);

            return (
              <li key={r.id} className="group">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpenRow(isOpen ? null : r.id); }}
                  className="w-full text-left px-4 md:px-6 py-3 hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 shrink-0 flex flex-col items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[11px] tabular-nums text-muted-foreground">{day} · {time}</span>
                        <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{code}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{meta.label}</span>
                      </div>
                      <div className="mt-0.5 text-sm truncate">
                        {r.description || meta.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{acct}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-mono tabular-nums font-semibold ${amountColor}`}>
                        {isAdj ? "" : isIn ? "+" : "-"}{fmtAmt(r.amount)} {ccy}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-muted-foreground mt-0.5">
                        Bal {fmtAmt(r.balanceAfter)}
                      </div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 md:px-6 pb-4 pt-1 bg-muted/30 border-t">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                      <DetailField label="Code" value={code} mono />
                      <DetailField label="Type" value={meta.label} />
                      <DetailField label="Account" value={acct} />
                      <DetailField label="Amount" value={`${isIn ? "+" : "-"}${fmtAmt(r.amount)} ${ccy}`} tone={isIn ? "ok" : "danger"} mono />
                      <DetailField label="Balance After" value={`${fmtAmt(r.balanceAfter)} ${ccy}`} mono />
                      <DetailField label="Date" value={new Date(r.created_at).toLocaleString()} />
                      <DetailField label="Entry Date" value={r.entry_date} />
                      <DetailField label="Ledger ID" value={shortId(r.id)} mono />
                    </div>
                    {r.description && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        <span className="uppercase tracking-wider text-[10px] font-semibold">Note</span>
                        <div className="mt-1 whitespace-pre-wrap">{r.description}</div>
                      </div>
                    )}
                    {detailHref && (
                      <div className="mt-3">
                        <a
                          href={detailHref}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
                        >
                          Open full transaction →
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function detailLinkFor(r: Row): string | null {
  if (!r.ref_id) return null;
  switch (r.ref_type) {
    case "sell":          return `/sells/${r.ref_id}`;
    case "sell_payment":  return null;
    case "buy":           return `/buy`;
    case "brought_in":    return `/brought-in`;
    case "expense":       return `/expenses`;
    case "transfer":      return `/transfers`;
    case "deposit":       return `/deposits`;
    default: return null;
  }
}

function Tile({ label, value, tone, strong }: { label: string; value: string; tone?: "ok" | "danger"; strong?: boolean }) {
  const toneCls = tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : tone === "danger" ? "text-destructive" : "";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">{label}</div>
      <div className={`mt-1 tabular-nums font-mono ${strong ? "text-base font-semibold" : "text-sm"} ${toneCls}`}>{value}</div>
    </div>
  );
}

function DetailField({ label, value, tone, mono }: { label: string; value: string; tone?: "ok" | "danger"; mono?: boolean }) {
  const toneCls = tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : tone === "danger" ? "text-destructive" : "";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`mt-0.5 ${mono ? "font-mono tabular-nums" : ""} ${toneCls}`}>{value}</div>
    </div>
  );
}