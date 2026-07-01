import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt, fmtProfit } from "@/lib/exchange";
import {
  LineChart, Line as RLine, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/ali-investor")({
  component: AliInvestor,
});

function AliInvestor() {
  const broughtQ = useQuery({
    queryKey: ["brought_ali"],
    queryFn: async () =>
      (await supabase
        .from("brought_in_money")
        .select("*")
        .eq("brought_by", "ali")
        .is("deleted_at", null)
        .order("entry_date", { ascending: false })).data ?? [],
  });

  const aliBroughtIds = (broughtQ.data ?? []).map((b: any) => b.id);

  const lotsQ = useQuery({
    queryKey: ["ali_inventory_lots", aliBroughtIds.join(",")],
    enabled: broughtQ.isSuccess,
    queryFn: async () => {
      if (aliBroughtIds.length === 0) return [];
      const { data } = await supabase
        .from("inventory_lots_view")
        .select("*")
        .eq("source_ref_type", "brought_in")
        .in("source_ref_id", aliBroughtIds)
        .order("entry_date", { ascending: false });
      return data ?? [];
    },
  });

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

  const allLots = (lotsQ.data ?? []) as any[];
  const activeLots = allLots.filter((l) => Number(l.remaining_amount) > 0 && l.status !== "depleted");
  const depletedLots = allLots.filter((l) => Number(l.remaining_amount) <= 0 || l.status === "depleted");
  const partialLots = allLots.filter((l) => l.status === "partial");

  const byCurrency = new Map<string, { currency: string; available: number; costCcy: string; costSum: number; lots: number }>();
  for (const l of activeLots) {
    const key = l.currency;
    const cur = byCurrency.get(key) ?? { currency: key, available: 0, costCcy: l.cost_basis_currency, costSum: 0, lots: 0 };
    const rem = Number(l.remaining_amount);
    cur.available += rem;
    cur.costSum += rem * Number(l.cost_basis_rate);
    cur.lots += 1;
    byCurrency.set(key, cur);
  }
  const inventoryByCcy = Array.from(byCurrency.values()).map((r) => ({
    ...r,
    avgCost: r.available > 0 ? r.costSum / r.available : 0,
  }));

  const byLocation = new Map<string, { location: string; currency: string; available: number; lots: number }>();
  for (const l of activeLots) {
    const key = (l.account_name || "—") + "|" + l.currency;
    const cur = byLocation.get(key) ?? { location: l.account_name || "—", currency: l.currency, available: 0, lots: 0 };
    cur.available += Number(l.remaining_amount);
    cur.lots += 1;
    byLocation.set(key, cur);
  }
  const inventoryByLocation = Array.from(byLocation.values());

  const c = capQ.data as any;
  const profit = Number(c?.total_profit_share ?? 0);
  const paidExpenses = Number(c?.total_paid_expenses ?? 0);

  const trend = (trendQ.data ?? []) as any[];
  const monthGross = Number((monthQ.data as any)?.gross_profit ?? 0);
  const monthAli = Number((monthQ.data as any)?.ali_profit ?? 0);
  const monthMilad = Number((monthQ.data as any)?.milad_profit ?? 0);

  return (
    <>
      <PageHeader
        title="Ali — Investor View"
        description="Capital is calculated live from active inventory lots — never from brought-in totals. Converted amounts count only once."
      />

      <Card className="backdrop-blur bg-card/80 mb-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <CardHeader>
          <CardTitle className="text-base">Current Active Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          {inventoryByCcy.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active inventory attributable to Ali.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {inventoryByCcy.map((r) => (
                <div key={r.currency} className="rounded-lg border p-4 bg-background/60">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.currency}</div>
                  <div className="text-2xl font-semibold tracking-tight font-mono mt-1">
                    {fmt(r.available, r.currency)}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground flex justify-between">
                    <span>Avg cost: <span className="font-mono">{fmt(r.avgCost)} {r.costCcy}/{r.currency}</span></span>
                    <span>Lots: {r.lots}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Active lots" value={String(activeLots.length)} />
        <Kpi label="Partially used lots" value={String(partialLots.length)} />
        <Kpi label="Fully used lots" value={String(depletedLots.length)} />
        <Kpi label="Profit share (all-time)" value={fmtProfit(profit)} tone="success" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Personal expenses (paid)" value={fmtProfit(paidExpenses)} />
        <Kpi label="This month — profit share" value={fmtProfit(monthAli)} tone="success" />
        <Kpi label="This month — gross" value={fmtProfit(monthGross)} />
        <Kpi label="Brought-in records" value={String((broughtQ.data ?? []).length)} />
      </div>

      <Tabs defaultValue="lots" className="mb-6">
        <TabsList>
          <TabsTrigger value="lots">Inventory lots</TabsTrigger>
          <TabsTrigger value="location">By location</TabsTrigger>
          <TabsTrigger value="depleted">Fully used</TabsTrigger>
          <TabsTrigger value="brought">Brought-in log</TabsTrigger>
        </TabsList>

        <TabsContent value="lots">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Original</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Cost rate</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {activeLots.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.lot_code}</TableCell>
                    <TableCell className="font-medium">{l.currency}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(l.original_amount, l.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(l.remaining_amount, l.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(l.cost_basis_rate)} {l.cost_basis_currency}/{l.currency}</TableCell>
                    <TableCell className="text-xs">{l.account_name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={l.source_description}>{l.source_description}</TableCell>
                    <TableCell className="text-xs">{l.entry_date}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "available" ? "default" : "secondary"}>{l.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {activeLots.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No active lots.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="location">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Lots</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {inventoryByLocation.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.location}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.available, r.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{r.lots}</TableCell>
                  </TableRow>
                ))}
                {inventoryByLocation.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Nothing held.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="depleted">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Original</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Date</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {depletedLots.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.lot_code}</TableCell>
                    <TableCell>{l.currency}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(l.original_amount, l.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(l.sold_amount, l.currency)}</TableCell>
                    <TableCell className="text-xs">{l.account_name || "—"}</TableCell>
                    <TableCell className="text-xs">{l.entry_date}</TableCell>
                  </TableRow>
                ))}
                {depletedLots.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nothing fully used.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="brought">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-3">
              Historical record only. These amounts are not summed as capital — capital comes from live inventory lots above.
            </p>
            {broughtQ.data && broughtQ.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No records yet.</p>
            ) : (
              <div className="divide-y">
                {(broughtQ.data ?? []).map((r: any) => (
                  <div key={r.id} className="flex justify-between py-2 text-sm">
                    <span className="text-muted-foreground">{r.entry_date} · {r.source_name || "—"}</span>
                    <span className="font-mono">
                      {fmt(r.amount, r.currency)} {r.currency}
                      {r.convert_enabled && r.converted_amount ? (
                        <span className="text-muted-foreground"> → {fmt(r.converted_amount, r.converted_currency)} {r.converted_currency}</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

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