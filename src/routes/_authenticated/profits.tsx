import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/exchange";
import { TrendingUp, Coins, Clock, CheckCircle2, Wallet } from "lucide-react";
import { useLatestMarketRates, pickDisplayRate } from "@/lib/market-rates";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/profits")({ component: ProfitsPage });

type Cycle = {
  id: string;
  deal_code: string | null;
  code: string | null;
  title: string | null;
  entry_date: string | null;
  status: string | null;
  trade_mode: string | null;
  base_currency: string | null;
  quote_currency: string | null;
  expected_profit: number | null;
  expected_profit_currency: string | null;
  realized_profit: number | null;
  realized_profit_currency: string | null;
  received_profit: number | null;
  pending_profit: number | null;
  net_profit: number | null;
  milad_profit: number | null;
  ali_profit: number | null;
  profit_status: string | null;
};

function useCycles() {
  return useQuery({
    queryKey: ["profits_cycles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_cycles" as any)
        .select(
          "id,deal_code,code,title,entry_date,status,trade_mode,base_currency,quote_currency,expected_profit,expected_profit_currency,realized_profit,realized_profit_currency,received_profit,pending_profit,net_profit,milad_profit,ali_profit,profit_status",
        )
        .order("entry_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Cycle[];
    },
  });
}

function sumBy(rows: Cycle[], key: keyof Cycle, ccyKey: keyof Cycle): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = Number(r[key] ?? 0);
    if (!v) continue;
    const ccy = String(r[ccyKey] ?? r.expected_profit_currency ?? r.realized_profit_currency ?? r.quote_currency ?? "") || "—";
    out[ccy] = (out[ccy] ?? 0) + v;
  }
  return out;
}

function modeLabel(m: string | null) {
  switch (m) {
    case "buy_only": return "Buy";
    case "sell_from_inventory": return "Sell";
    case "matched_direct": return "Matched";
    case "legacy": return "Legacy";
    default: return m ?? "—";
  }
}

function statusTone(s: string | null): "default" | "secondary" | "outline" {
  if (s === "completed" || s === "closed") return "default";
  if (s === "in_progress") return "secondary";
  return "outline";
}

function CcyGrid({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: Record<string, number> }) {
  const entries = Object.entries(rows).filter(([, v]) => Math.abs(v) > 0.0001);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {entries.length === 0 && <div className="text-xs text-muted-foreground">—</div>}
        {entries.map(([ccy, v]) => (
          <div key={ccy} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{ccy}</span>
            <span className={`font-mono font-semibold ${v >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(v, ccy)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProfitsPage() {
  const q = useCycles();
  const rows = q.data ?? [];
  const marketRatesQ = useLatestMarketRates();
  const [filter, setFilter] = useState<"all" | "buy_only" | "sell_from_inventory" | "matched_direct" | "legacy">("all");

  // Currency conversion helpers (via IRR pivot, market mid).
  const rateFor = (ccy: string): number => {
    if (!ccy || ccy === "IRR") return 1;
    const row = pickDisplayRate(marketRatesQ.data, ccy).row;
    return row?.mid_rate ?? row?.sell_rate ?? row?.buy_rate ?? 0;
  };
  const toAED = (amount: number, from: string): number => {
    if (!amount) return 0;
    if (!from || from === "AED") return amount;
    const asIrr = from === "IRR" ? amount : amount * rateFor(from);
    const aedR = rateFor("AED");
    return aedR > 0 ? asIrr / aedR : 0;
  };

  const filtered = filter === "all" ? rows : rows.filter((r) => (r.trade_mode ?? "legacy") === filter);

  const totals = useMemo(() => {
    let exp = 0, real = 0, recv = 0, pend = 0, milad = 0, ali = 0;
    for (const r of filtered) {
      const ecy = r.expected_profit_currency ?? r.realized_profit_currency ?? r.quote_currency ?? "";
      const rcy = r.realized_profit_currency ?? ecy;
      exp += toAED(Number(r.expected_profit ?? 0), ecy);
      real += toAED(Number(r.realized_profit ?? 0), rcy);
      recv += toAED(Number(r.received_profit ?? 0), rcy);
      pend += toAED(Number(r.pending_profit ?? 0), rcy);
      milad += toAED(Number(r.milad_profit ?? 0), rcy);
      ali += toAED(Number(r.ali_profit ?? 0), rcy);
    }
    return { exp, real, recv, pend, milad, ali };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, marketRatesQ.data]);

  const expectedByCcy = sumBy(filtered, "expected_profit", "expected_profit_currency");
  const realizedByCcy = sumBy(filtered, "realized_profit", "realized_profit_currency");
  const receivedByCcy = sumBy(filtered, "received_profit", "realized_profit_currency");
  const pendingByCcy = sumBy(filtered, "pending_profit", "realized_profit_currency");

  const modeCounts: Record<string, number> = { all: rows.length };
  for (const r of rows) {
    const k = r.trade_mode ?? "legacy";
    modeCounts[k] = (modeCounts[k] ?? 0) + 1;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Profits"
        description="All profits across every deal — converted to AED at current market rates."
      />

      {/* Hero totals in AED */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroCard
          title="Realized profit"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          aed={totals.real}
          byCcy={realizedByCcy}
          tone="emerald"
        />
        <HeroCard
          title="Received in hand"
          icon={<Coins className="h-4 w-4 text-emerald-600" />}
          aed={totals.recv}
          byCcy={receivedByCcy}
          tone="emerald"
        />
        <HeroCard
          title="Pending collection"
          icon={<Clock className="h-4 w-4 text-amber-600" />}
          aed={totals.pend}
          byCcy={pendingByCcy}
          tone="amber"
        />
        <HeroCard
          title="Expected (open deals)"
          icon={<TrendingUp className="h-4 w-4 text-sky-600" />}
          aed={totals.exp}
          byCcy={expectedByCcy}
          tone="sky"
        />
      </div>

      {/* Partner split */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Partner split (realized, AED-equivalent)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Milad</div>
            <div className="font-mono text-xl font-semibold text-emerald-600">{fmt(totals.milad, "AED")} AED</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Ali</div>
            <div className="font-mono text-xl font-semibold text-emerald-600">{fmt(totals.ali, "AED")} AED</div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "matched_direct", "sell_from_inventory", "buy_only", "legacy"] as const).map((k) => (
          <Button
            key={k}
            variant={filter === k ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(k)}
            className="h-8"
          >
            {k === "all" ? "All" : modeLabel(k)}
            <Badge variant="secondary" className="ml-2">{modeCounts[k] ?? 0}</Badge>
          </Button>
        ))}
      </div>

      {/* Deals table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Deals ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Deal</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Mode</th>
                  <th className="text-left p-2">Pair</th>
                  <th className="text-right p-2">Profit (native)</th>
                  <th className="text-right p-2">≈ AED</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No deals in this view.</td></tr>
                )}
                {filtered.map((r) => {
                  const rcy = r.realized_profit_currency ?? r.expected_profit_currency ?? "";
                  const native = Number(r.realized_profit ?? r.expected_profit ?? 0);
                  const aed = toAED(native, rcy);
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="p-2 font-mono text-xs">
                        <Link to="/trades/$id" params={{ id: r.id }} className="text-primary hover:underline">
                          {r.deal_code ?? r.code ?? r.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="p-2 whitespace-nowrap">{r.entry_date ?? "—"}</td>
                      <td className="p-2"><Badge variant="outline">{modeLabel(r.trade_mode)}</Badge></td>
                      <td className="p-2 whitespace-nowrap">{r.base_currency ?? "?"} → {r.quote_currency ?? "?"}</td>
                      <td className={`p-2 text-right font-mono ${native > 0 ? "text-emerald-600" : native < 0 ? "text-destructive" : ""}`}>
                        {native ? `${fmt(native, rcy)} ${rcy}` : "—"}
                      </td>
                      <td className={`p-2 text-right font-mono font-semibold ${aed > 0 ? "text-emerald-600" : aed < 0 ? "text-destructive" : ""}`}>
                        {aed ? `${fmt(aed, "AED")} AED` : "—"}
                      </td>
                      <td className="p-2"><Badge variant={statusTone(r.status)}>{r.status ?? "—"}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
    </div>
  );
}

function HeroCard({ title, icon, aed, byCcy, tone }: {
  title: string;
  icon: React.ReactNode;
  aed: number;
  byCcy: Record<string, number>;
  tone: "emerald" | "amber" | "sky";
}) {
  const entries = Object.entries(byCcy).filter(([, v]) => Math.abs(v) > 0.0001);
  const toneClass =
    tone === "emerald" ? "text-emerald-600" :
    tone === "amber" ? "text-amber-600" :
    "text-sky-600";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs flex items-center gap-2 font-medium text-muted-foreground uppercase tracking-wide">
          {icon}{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className={`font-mono text-2xl font-bold ${toneClass}`}>
          {fmt(aed, "AED")} <span className="text-sm font-normal text-muted-foreground">AED</span>
        </div>
        {entries.length > 0 && (
          <div className="border-t pt-2 space-y-0.5">
            {entries.map(([ccy, v]) => (
              <div key={ccy} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{ccy}</span>
                <span className="font-mono">{fmt(v, ccy)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}