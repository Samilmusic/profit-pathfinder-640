import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { MarketRatesWidget } from "@/components/market-rates-widget";
import { MARKET_CURRENCIES, currencyMeta } from "@/lib/market-currencies";
import {
  useMarketRateDeltas,
  useMarketRateHistory,
  useInventoryExposure,
  useMarketNotifications,
  useAlertThresholds,
  useLatestMarketRates,
  pickDisplayRate,
  rateFreshness,
  triggerMarketRateRefresh,
  computeRateMargin,
} from "@/lib/market-rates";
import { fmt, fmtProfit } from "@/lib/exchange";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  BellRing,
  Activity,
  Boxes,
  ShieldAlert,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/market-intelligence")({
  component: MarketIntelligencePage,
});

function toneClass(tone: "ok" | "warn" | "danger" | "neutral") {
  if (tone === "ok") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "warn") return "text-amber-600 dark:text-amber-400";
  if (tone === "danger") return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function pctBadge(pct: number | null | undefined) {
  if (pct == null || !Number.isFinite(pct)) return { label: "—", tone: "neutral" as const };
  if (Math.abs(pct) < 0.05) return { label: "0.00%", tone: "neutral" as const };
  const tone = pct > 0 ? ("ok" as const) : ("danger" as const);
  return { label: `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`, tone };
}

function DeltaChip({ label, pct }: { label: string; pct: number | null | undefined }) {
  const b = pctBadge(pct);
  const Icon = b.tone === "ok" ? TrendingUp : b.tone === "danger" ? TrendingDown : Minus;
  return (
    <div className="text-center rounded-md border p-2 bg-card/60">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("flex items-center justify-center gap-1 font-mono text-xs font-semibold", toneClass(b.tone))}>
        <Icon className="h-3 w-3" />
        {b.label}
      </div>
    </div>
  );
}

function Sparkline({ currency, hours }: { currency: string; hours: number }) {
  const q = useMarketRateHistory(currency, hours);
  const rows = (q.data ?? []) as Array<{ fetched_at: string; mid_rate: number | null }>;
  const path = useMemo(() => {
    const pts = rows.map((r) => Number(r.mid_rate)).filter((n) => Number.isFinite(n) && n > 0);
    if (pts.length < 2) return null;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 1;
    const w = 320, h = 80;
    const step = w / (pts.length - 1);
    const d = pts
      .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
      .join(" ");
    const trend = pts[pts.length - 1] - pts[0];
    return { d, w, h, min, max, trend, first: pts[0], last: pts[pts.length - 1] };
  }, [rows]);
  if (!path) return <div className="text-xs text-muted-foreground">Not enough data</div>;
  const trendCls = path.trend > 0 ? "text-emerald-500" : path.trend < 0 ? "text-red-500" : "text-muted-foreground";
  return (
    <div className="space-y-1">
      <svg width="100%" viewBox={`0 0 ${path.w} ${path.h}`} preserveAspectRatio="none" className={trendCls}>
        <path d={path.d} fill="none" stroke="currentColor" strokeWidth={2} />
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>low {fmt(path.min)}</span>
        <span>from {fmt(path.first)} → {fmt(path.last)}</span>
        <span>high {fmt(path.max)}</span>
      </div>
    </div>
  );
}

function MarketIntelligencePage() {
  const qc = useQueryClient();
  const [range, setRange] = useState<1 | 24 | 168>(24);

  const deltasQ = useMarketRateDeltas();
  const exposureQ = useInventoryExposure();
  const notifQ = useMarketNotifications(30);
  const thresholdsQ = useAlertThresholds();
  const latestQ = useLatestMarketRates();

  const refresh = useMutation({
    mutationFn: triggerMarketRateRefresh,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market_rates_latest"] });
      qc.invalidateQueries({ queryKey: ["market_rate_deltas"] });
      qc.invalidateQueries({ queryKey: ["market_rate_history"] });
      qc.invalidateQueries({ queryKey: ["inventory_exposure"] });
      toast.success("Market data refreshed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Refresh failed"),
  });

  // Derived: computed alerts from thresholds + deltas + exposure
  const derivedAlerts = useMemo(() => {
    const t = thresholdsQ.data;
    if (!t) return [] as Array<{ severity: "info" | "warn" | "danger"; title: string; body?: string; kind: string }>;
    const alerts: Array<{ severity: "info" | "warn" | "danger"; title: string; body?: string; kind: string }> = [];
    for (const d of deltasQ.data ?? []) {
      const fresh = rateFreshness(d.fetched_at);
      if (fresh.minutes > t.alert_stale_minutes) {
        alerts.push({
          severity: "warn",
          kind: "stale",
          title: `${d.currency} rate is stale`,
          body: `Last update ${fresh.minutes.toFixed(0)} minutes ago. Manual confirmation recommended.`,
        });
      }
      if (d.pct_15m != null && d.pct_15m <= -t.alert_drop_pct_15min) {
        alerts.push({
          severity: "danger",
          kind: "drop",
          title: `${d.currency} dropped ${d.pct_15m.toFixed(2)}% in 15 min`,
          body: `Consider reviewing open ${d.currency} deals — market is falling fast.`,
        });
      }
      if (d.pct_15m != null && d.pct_15m >= t.alert_rise_pct_15min) {
        alerts.push({
          severity: "warn",
          kind: "rise",
          title: `${d.currency} rising ${d.pct_15m.toFixed(2)}% in 15 min`,
          body: `Check ${d.currency} exposure — market is moving up fast.`,
        });
      }
      if (d.pct_1h != null && Math.abs(d.pct_1h) >= t.alert_volatility_pct_1h) {
        alerts.push({
          severity: "warn",
          kind: "volatility",
          title: `${d.currency} high volatility (${d.pct_1h.toFixed(2)}% / 1h)`,
          body: `Rates are moving quickly — verify quotes before closing deals.`,
        });
      }
    }
    for (const e of exposureQ.data ?? []) {
      if (e.market_mid == null || e.avg_cost <= 0) continue;
      const pct = ((e.market_mid - e.avg_cost) / e.avg_cost) * 100;
      if (pct <= 0) {
        alerts.push({
          severity: "danger",
          kind: "below_cost",
          title: `${e.currency} inventory is below cost`,
          body: `Market ${fmt(e.market_mid)} vs average cost ${fmt(e.avg_cost)}. Selling now may create a loss.`,
        });
      } else if (pct <= t.alert_near_cost_pct) {
        alerts.push({
          severity: "warn",
          kind: "near_cost",
          title: `${e.currency} market is near your average cost`,
          body: `Only ${pct.toFixed(2)}% above cost. Review position.`,
        });
      }
    }
    return alerts;
  }, [deltasQ.data, exposureQ.data, thresholdsQ.data]);

  // Open sell deals affected by market movement
  const openDealsQ = useQuery({
    queryKey: ["open_deals_for_market"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sell_transactions")
        .select("id,entry_date,sold_currency,sold_amount,received_currency,received_amount,sell_rate,deal_status,customer_id,reference_mid_rate,reference_rate_time")
        .in("deal_status", ["open", "waiting_payment", "partially_paid", "waiting_receipt", "waiting_currency_delivery", "waiting_delivery_proof", "ready_to_close"])
        .is("deleted_at", null)
        .order("entry_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Market Intelligence"
        description="Live rates, movement alerts, inventory exposure & open-deal risk"
        action={
          <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={cn("h-4 w-4 mr-2", refresh.isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <Tabs defaultValue="live">
        <TabsList className="grid grid-cols-2 md:grid-cols-6 w-full">
          <TabsTrigger value="live"><Activity className="h-4 w-4 mr-1" />Live</TabsTrigger>
          <TabsTrigger value="trends"><BarChart3 className="h-4 w-4 mr-1" />Trends</TabsTrigger>
          <TabsTrigger value="alerts"><BellRing className="h-4 w-4 mr-1" />Alerts</TabsTrigger>
          <TabsTrigger value="exposure"><Boxes className="h-4 w-4 mr-1" />Exposure</TabsTrigger>
          <TabsTrigger value="deals"><ShieldAlert className="h-4 w-4 mr-1" />Open Deals</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* -------- LIVE -------- */}
        <TabsContent value="live" className="space-y-3 pt-3">
          <MarketRatesWidget />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {MARKET_CURRENCIES.filter((c) => c.primary).map((c) => {
              const d = deltasQ.data?.find((x) => x.currency === c.code);
              const picked = pickDisplayRate(latestQ.data, c.code);
              const fresh = rateFreshness(picked.row?.fetched_at);
              return (
                <Card key={c.code}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>{c.flag}</span> {c.code} / IRR
                      <Badge variant="outline" className="ml-auto text-[10px]">{fresh.label}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Buy</div>
                        <div className="font-mono font-semibold">{picked.row?.buy_rate != null ? fmt(picked.row.buy_rate) : "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Mid</div>
                        <div className="font-mono font-semibold">{picked.row?.mid_rate != null ? fmt(picked.row.mid_rate) : "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Sell</div>
                        <div className="font-mono font-semibold">{picked.row?.sell_rate != null ? fmt(picked.row.sell_rate) : "—"}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <DeltaChip label="5m" pct={d?.pct_5m} />
                      <DeltaChip label="15m" pct={d?.pct_15m} />
                      <DeltaChip label="1h" pct={d?.pct_1h} />
                      <DeltaChip label="24h" pct={d?.pct_24h} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* -------- TRENDS -------- */}
        <TabsContent value="trends" className="space-y-3 pt-3">
          <div className="flex items-center gap-2">
            {([{ v: 1, label: "1h" }, { v: 24, label: "24h" }, { v: 168, label: "7d" }] as const).map((opt) => (
              <Button
                key={opt.v}
                size="sm"
                variant={range === opt.v ? "default" : "outline"}
                className="h-7 px-3 text-[11px]"
                onClick={() => setRange(opt.v as any)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MARKET_CURRENCIES.filter((c) => c.primary).map((c) => (
              <Card key={c.code}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span>{c.flag}</span> {c.code} / IRR
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Sparkline currency={c.code} hours={range} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* -------- ALERTS -------- */}
        <TabsContent value="alerts" className="space-y-3 pt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Live alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {derivedAlerts.length === 0 && (
                <div className="text-sm text-muted-foreground">No active alerts — market looks calm.</div>
              )}
              {derivedAlerts.map((a, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-md border p-3",
                    a.severity === "danger"
                      ? "bg-red-500/10 border-red-500/30"
                      : a.severity === "warn"
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-muted/40",
                  )}
                >
                  <div className="text-sm font-medium">{a.title}</div>
                  {a.body && <div className="text-xs text-muted-foreground mt-0.5">{a.body}</div>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BellRing className="h-4 w-4 text-primary" /> Recent notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {(notifQ.data ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground">No notifications yet.</div>
              )}
              {(notifQ.data ?? []).map((n) => (
                <div key={n.id} className="text-xs flex items-start justify-between gap-2 border-b py-1.5 last:border-0">
                  <div>
                    <div className="font-medium">{n.title}</div>
                    {n.body && <div className="text-muted-foreground">{n.body}</div>}
                  </div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(n.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------- EXPOSURE -------- */}
        <TabsContent value="exposure" className="pt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Inventory exposure</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-muted-foreground border-b">
                      <th className="py-2 pr-3">Currency</th>
                      <th className="py-2 pr-3 text-right">Available</th>
                      <th className="py-2 pr-3 text-right">Avg cost</th>
                      <th className="py-2 pr-3 text-right">Market buy</th>
                      <th className="py-2 pr-3 text-right">Market sell</th>
                      <th className="py-2 pr-3 text-right">Unrealized P/L</th>
                      <th className="py-2 pr-3 text-right">%</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(exposureQ.data ?? []).map((e) => {
                      const pct = e.unrealized_pl_pct ?? 0;
                      const tone = pct > 0 ? "ok" : pct < 0 ? "danger" : "neutral";
                      const status =
                        e.market_mid == null
                          ? "No market rate"
                          : pct > 1 ? "Positive"
                          : pct >= 0 ? "Near cost"
                          : "Below cost";
                      return (
                        <tr key={e.currency} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium flex items-center gap-1">
                            <span>{currencyMeta(e.currency).flag}</span> {e.currency}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">{fmt(e.available)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{fmt(e.avg_cost)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{e.market_buy != null ? fmt(e.market_buy) : "—"}</td>
                          <td className="py-2 pr-3 text-right font-mono">{e.market_sell != null ? fmt(e.market_sell) : "—"}</td>
                          <td className={cn("py-2 pr-3 text-right font-mono", toneClass(tone as any))}>
                            {e.unrealized_pl != null ? fmtProfit(e.unrealized_pl) : "—"}
                          </td>
                          <td className={cn("py-2 pr-3 text-right font-mono", toneClass(tone as any))}>
                            {e.unrealized_pl_pct != null ? `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
                          </td>
                          <td className="py-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                status === "Positive" && "border-emerald-500/40 text-emerald-700",
                                status === "Near cost" && "border-amber-500/40 text-amber-700",
                                status === "Below cost" && "border-red-500/40 text-red-700",
                              )}
                            >
                              {status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {(exposureQ.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                          No active inventory.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------- OPEN DEALS -------- */}
        <TabsContent value="deals" className="pt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Open deals vs current market</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-muted-foreground border-b">
                      <th className="py-2 pr-3">Deal</th>
                      <th className="py-2 pr-3">Ccy</th>
                      <th className="py-2 pr-3 text-right">Deal rate</th>
                      <th className="py-2 pr-3 text-right">Market</th>
                      <th className="py-2 pr-3 text-right">Δ</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(openDealsQ.data ?? []).map((d: any) => {
                      const market = deltasQ.data?.find((x) => x.currency === d.sold_currency);
                      const marketMid = market?.current_mid ?? null;
                      const margin = computeRateMargin(d.sell_rate, marketMid);
                      // "sell" side: if deal rate > market → favourable
                      const tone: any = !margin
                        ? "neutral"
                        : Math.abs(margin.pct) < 0.05
                          ? "neutral"
                          : margin.diff > 0
                            ? "ok"
                            : "danger";
                      return (
                        <tr key={d.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">{new Date(d.entry_date).toLocaleDateString()}</td>
                          <td className="py-2 pr-3">{d.sold_currency}→{d.received_currency}</td>
                          <td className="py-2 pr-3 text-right font-mono">{fmt(d.sell_rate)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{marketMid ? fmt(marketMid) : "—"}</td>
                          <td className={cn("py-2 pr-3 text-right font-mono", toneClass(tone))}>
                            {margin ? `${margin.diff > 0 ? "+" : ""}${fmt(margin.diff)} (${margin.pct.toFixed(2)}%)` : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className="text-[10px]">{d.deal_status}</Badge>
                          </td>
                          <td className="py-2">
                            <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                              <Link to="/sells/$id" params={{ id: d.id }}>
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {(openDealsQ.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                          No open sell deals.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------- REPORTS -------- */}
        <TabsContent value="reports" className="pt-3 space-y-3">
          <MarginReports />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MarginReports() {
  const q = useQuery({
    queryKey: ["margin_report_sells"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sell_transactions")
        .select("id,entry_date,sold_currency,received_currency,sell_rate,transaction_rate,reference_mid_rate,rate_difference,rate_difference_percent,deal_status")
        .is("deleted_at", null)
        .not("reference_mid_rate", "is", null)
        .order("entry_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = q.data ?? [];
  const withPct = rows.filter((r: any) => r.rate_difference_percent != null);
  const avg = withPct.length ? withPct.reduce((a: number, r: any) => a + Number(r.rate_difference_percent), 0) / withPct.length : 0;
  const best = [...withPct].sort((a: any, b: any) => Number(b.rate_difference_percent) - Number(a.rate_difference_percent)).slice(0, 5);
  const worst = [...withPct].sort((a: any, b: any) => Number(a.rate_difference_percent) - Number(b.rate_difference_percent)).slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Average margin vs market</CardTitle></CardHeader>
        <CardContent>
          <div className={cn("text-3xl font-mono font-semibold", avg > 0 ? "text-emerald-600" : avg < 0 ? "text-red-600" : "")}>
            {avg > 0 ? "+" : ""}{avg.toFixed(3)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">Across {withPct.length} sells with recorded reference rate.</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-600">Best rate deals</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {best.length === 0 && <div className="text-xs text-muted-foreground">No data yet</div>}
          {best.map((r: any) => (
            <div key={r.id} className="text-xs flex justify-between font-mono">
              <span>{new Date(r.entry_date).toLocaleDateString()} {r.sold_currency}</span>
              <span className="text-emerald-600">+{Number(r.rate_difference_percent).toFixed(2)}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">Worst rate deals</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {worst.length === 0 && <div className="text-xs text-muted-foreground">No data yet</div>}
          {worst.map((r: any) => (
            <div key={r.id} className="text-xs flex justify-between font-mono">
              <span>{new Date(r.entry_date).toLocaleDateString()} {r.sold_currency}</span>
              <span className="text-red-600">{Number(r.rate_difference_percent).toFixed(2)}%</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}