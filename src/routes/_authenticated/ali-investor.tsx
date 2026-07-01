import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { fmt, fmtProfit } from "@/lib/exchange";
import {
  LineChart, Line as RLine, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/ali-investor")({
  component: AliInvestor,
});

function AliInvestor() {
  const capQ = useQuery({
    queryKey: ["ali_capital"],
    queryFn: async () => {
      const { data } = await supabase.from("v_ali_capital_summary").select("*").maybeSingle();
      return data;
    },
  });
  const trendQ = useQuery({
    queryKey: ["profit_trend"],
    queryFn: async () => (await supabase.from("v_daily_profit_series").select("*")).data ?? [],
  });
  const monthQ = useQuery({
    queryKey: ["month_profit"],
    queryFn: async () => {
      const { data } = await supabase.from("v_month_profit").select("*").maybeSingle();
      return data;
    },
  });
  const broughtQ = useQuery({
    queryKey: ["brought_ali"],
    queryFn: async () => (await supabase.from("brought_in_money").select("*").eq("brought_by", "ali").is("deleted_at", null).order("entry_date", { ascending: false })).data ?? [],
  });

  const c = capQ.data as any;
  const initial = Number(c?.total_brought_in ?? 0);
  const profit = Number(c?.total_profit_share ?? 0);
  const paidExpenses = Number(c?.total_paid_expenses ?? 0);
  const holding = Number(c?.currently_holding ?? 0);
  const netCapital = initial + profit - paidExpenses;
  const roi = initial > 0 ? (profit / initial) * 100 : 0;

  const trend = (trendQ.data ?? []) as any[];
  const monthGross = Number((monthQ.data as any)?.gross_profit ?? 0);
  const monthAli = Number((monthQ.data as any)?.ali_profit ?? 0);
  const monthMilad = Number((monthQ.data as any)?.milad_profit ?? 0);

  return (
    <>
      <PageHeader title="Ali — Investor View" description="Ali's capital, profit share, and ROI over time." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Initial capital" value={fmtProfit(initial)} />
        <Kpi label="Profit share (all-time)" value={fmtProfit(profit)} tone="success" />
        <Kpi label="Current net capital" value={fmtProfit(netCapital)} accent />
        <Kpi label="ROI" value={roi.toFixed(2) + "%"} tone={roi >= 0 ? "success" : "error"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Currently holding cash" value={fmtProfit(holding)} />
        <Kpi label="Personal expenses (paid)" value={fmtProfit(paidExpenses)} />
        <Kpi label="This month — profit share" value={fmtProfit(monthAli)} tone="success" />
        <Kpi label="This month — gross" value={fmtProfit(monthGross)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="backdrop-blur bg-card/80" style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader><CardTitle className="text-base">Profit trend (30 days)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <XAxis dataKey="day" tickFormatter={(v) => String(v).slice(5)} fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <RLine type="monotone" dataKey="gross_profit" stroke="var(--primary)" strokeWidth={2} dot={false} />
                <RLine type="monotone" dataKey="ali_profit" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="backdrop-blur bg-card/80" style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader><CardTitle className="text-base">Month profit split</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}
                  data={[
                    { name: "Milad", value: Math.max(0, monthMilad) },
                    { name: "Ali", value: Math.max(0, monthAli) },
                  ]}
                >
                  <Cell fill="var(--primary)" />
                  <Cell fill="var(--accent)" />
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="backdrop-blur bg-card/80" style={{ boxShadow: "var(--shadow-soft)" }}>
        <CardHeader><CardTitle className="text-base">Recent capital brought in by Ali</CardTitle></CardHeader>
        <CardContent>
          {broughtQ.data && broughtQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records yet.</p>
          ) : (
            <div className="divide-y">
              {(broughtQ.data ?? []).slice(0, 10).map((r: any) => (
                <div key={r.id} className="flex justify-between py-2 text-sm">
                  <span className="text-muted-foreground">{r.entry_date} · {r.source_name || "—"}</span>
                  <span className="font-mono">{fmt(r.amount, r.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, tone, accent }: { label: string; value: string; tone?: "success" | "error"; accent?: boolean }) {
  const color =
    tone === "success" ? "text-emerald-600" :
    tone === "error" ? "text-destructive" :
    accent ? "text-accent-foreground" : "";
  return (
    <Card className="backdrop-blur bg-card/80" style={{ boxShadow: "var(--shadow-soft)" }}>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={"text-2xl font-semibold tracking-tight mt-1 " + color}>{value}</div>
      </CardContent>
    </Card>
  );
}