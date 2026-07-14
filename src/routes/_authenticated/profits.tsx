import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/exchange";
import { TrendingUp, Coins, Clock, CheckCircle2 } from "lucide-react";

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

  const expectedByCcy = sumBy(rows, "expected_profit", "expected_profit_currency");
  const realizedByCcy = sumBy(rows, "realized_profit", "realized_profit_currency");
  const receivedByCcy = sumBy(rows, "received_profit", "expected_profit_currency");
  const pendingByCcy = sumBy(rows, "pending_profit", "expected_profit_currency");

  const byMode: Record<string, Cycle[]> = {};
  for (const r of rows) {
    const m = r.trade_mode ?? "legacy";
    (byMode[m] ??= []).push(r);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Profits" description="All profit signals across every deal — expected, realized, received, and pending." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CcyGrid title="Expected profit" icon={<TrendingUp className="h-4 w-4" />} rows={expectedByCcy} />
        <CcyGrid title="Realized profit" icon={<CheckCircle2 className="h-4 w-4" />} rows={realizedByCcy} />
        <CcyGrid title="Received (in hand)" icon={<Coins className="h-4 w-4" />} rows={receivedByCcy} />
        <CcyGrid title="Pending collection" icon={<Clock className="h-4 w-4" />} rows={pendingByCcy} />
      </div>

      {Object.keys(byMode).sort().map((m) => (
        <Card key={m}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{modeLabel(m)} deals</span>
              <Badge variant="outline">{byMode[m].length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Deal</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Pair</th>
                    <th className="text-right p-2">Expected</th>
                    <th className="text-right p-2">Realized</th>
                    <th className="text-right p-2">Received</th>
                    <th className="text-right p-2">Pending</th>
                    <th className="text-right p-2">Milad</th>
                    <th className="text-right p-2">Ali</th>
                    <th className="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {byMode[m].map((r) => {
                    const ecy = r.expected_profit_currency ?? "";
                    const rcy = r.realized_profit_currency ?? ecy;
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/20">
                        <td className="p-2 font-mono text-xs">
                          <Link to="/trades/$id" params={{ id: r.id }} className="text-primary hover:underline">
                            {r.deal_code ?? r.code ?? r.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="p-2">{r.entry_date ?? "—"}</td>
                        <td className="p-2">{r.base_currency ?? "?"} → {r.quote_currency ?? "?"}</td>
                        <td className="p-2 text-right font-mono">{r.expected_profit ? fmt(r.expected_profit, ecy) : "—"}</td>
                        <td className="p-2 text-right font-mono">{r.realized_profit ? fmt(r.realized_profit, rcy) : "—"}</td>
                        <td className="p-2 text-right font-mono">{r.received_profit ? fmt(r.received_profit, ecy) : "—"}</td>
                        <td className="p-2 text-right font-mono">{r.pending_profit ? fmt(r.pending_profit, ecy) : "—"}</td>
                        <td className="p-2 text-right font-mono">{r.milad_profit ? fmt(r.milad_profit, ecy) : "—"}</td>
                        <td className="p-2 text-right font-mono">{r.ali_profit ? fmt(r.ali_profit, ecy) : "—"}</td>
                        <td className="p-2"><Badge variant={statusTone(r.status)}>{r.status ?? "—"}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!q.isLoading && rows.length === 0 && <div className="text-sm text-muted-foreground">No deals yet.</div>}
    </div>
  );
}