import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Download, RefreshCw, Printer } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area } from "recharts";
import {
  fetchTreasuryOverview, fetchCashflow, fetchCurrencyExposure, fetchBankAccountAnalytics,
  buildTreasuryCsvMeta, downloadCsv,
} from "@/lib/reports/treasury.functions";
import type { QualityMode } from "@/lib/reports/executive.functions";

export const Route = createFileRoute("/_authenticated/reports/treasury")({
  head: () => ({
    meta: [
      { title: "Treasury & Cash Intelligence — Reports" },
      { name: "description", content: "Cash position by currency, account and owner; cash flow; forecast (rolling-average estimate); currency exposure; bank account analytics." },
    ],
  }),
  component: TreasuryDashboard,
});

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(Number(n))
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(Number(n));

function KpiCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function TreasuryDashboard() {
  const [mode, setMode] = useState<QualityMode>("exclude_invalid");
  const [currency, setCurrency] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [account, setAccount] = useState<string>("all");
  const [granularity, setGranularity] = useState<"day" | "week" | "month" | "year">("day");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const overviewArgs = useMemo(() => ({
    quality_mode: mode,
    currency: currency === "all" ? null : currency,
    owner: owner === "all" ? null : owner,
    account_id: account === "all" ? null : account,
    from: from || null, to: to || null,
  }), [mode, currency, owner, account, from, to]);

  const overview = useQuery({
    queryKey: ["report", "treasury_overview", overviewArgs],
    queryFn: () => fetchTreasuryOverview(overviewArgs),
    staleTime: 60_000,
  });

  const cashflow = useQuery({
    queryKey: ["report", "treasury_cashflow", granularity, currency, owner, account, from, to],
    queryFn: () => fetchCashflow({
      granularity,
      currency: currency === "all" ? null : currency,
      owner: owner === "all" ? null : owner,
      account_id: account === "all" ? null : account,
      from: from || null, to: to || null,
    }),
    staleTime: 60_000,
  });

  const exposure = useQuery({
    queryKey: ["report", "currency_exposure", from, to],
    queryFn: () => fetchCurrencyExposure(from || null, to || null),
    staleTime: 60_000,
  });

  const bankAnalytics = useQuery({
    queryKey: ["report", "bank_analytics", from, to, currency, owner],
    queryFn: () => fetchBankAccountAnalytics({
      from: from || null, to: to || null,
      currency: currency === "all" ? null : currency,
      owner: owner === "all" ? null : owner,
      limit: 200,
    }),
    staleTime: 60_000,
  });

  const currencies = (overview.data?.by_currency ?? []).map((c: { currency: string }) => c.currency);
  const accounts = (overview.data?.by_account ?? []) as Array<{ account_id: string; account_name: string; currency: string }>;

  const combinedFlow = useMemo(() => {
    const hist = (cashflow.data?.series ?? []).map((r: { bucket_start: string; inflow: number; outflow: number; net: number; running_net: number }) => ({
      bucket_start: r.bucket_start, inflow: r.inflow, outflow: r.outflow, net: r.net, running_net: r.running_net, is_estimate: false,
    }));
    const fc = (cashflow.data?.forecast ?? []).map((r: { bucket_start: string; inflow_est: number; outflow_est: number; net_est: number }) => ({
      bucket_start: r.bucket_start, inflow: r.inflow_est, outflow: r.outflow_est, net: r.net_est, is_estimate: true,
    }));
    return [...hist, ...fc];
  }, [cashflow.data]);

  const refetchAll = () => { overview.refetch(); cashflow.refetch(); exposure.refetch(); bankAnalytics.refetch(); };

  return (
    <div className="p-4 sm:p-6 space-y-6 print:p-0">
      <PageHeader
        title="Treasury & Cash Intelligence"
        description="Live cash position, flow, currency exposure and bank-account analytics. All math server-side."
      />

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Quality</label>
            <Select value={mode} onValueChange={(v) => setMode(v as QualityMode)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="exclude_invalid">Exclude invalid</SelectItem>
                <SelectItem value="exclude_suspicious">Exclude suspicious</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Currency</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {currencies.map((c: string) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Owner</label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="milad">Milad</SelectItem>
                <SelectItem value="ali">Ali</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Account</label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.account_id} value={a.account_id}>{a.account_name} ({a.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Granularity</label>
            <Select value={granularity} onValueChange={(v) => setGranularity(v as "day" | "week" | "month" | "year")}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={refetchAll}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
        </CardContent>
      </Card>

      {/* Disclosure */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
        <Badge variant="outline" className="uppercase tracking-wide">{mode.replace("_", " ")}</Badge>
        <span>Range {overview.data?.date_from ?? "—"} → {overview.data?.date_to ?? "—"}</span>
        <span>·</span>
        <span>AED snap {fmt(overview.data?.kpis.aed_snapshot_rate, 0)}</span>
        <span>·</span>
        <span>Report v{overview.data?.meta.report_version ?? "—"}</span>
        {overview.data?.meta.data_cutoff ? (<><span>·</span><span>Cutoff {new Date(overview.data.meta.data_cutoff).toLocaleString()}</span></>) : null}
      </div>

      {/* KPIs */}
      <section aria-label="Treasury KPIs" className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Total (AED equiv)" value={fmt(overview.data?.kpis.total_aed_equiv)} hint="Held across all active accounts" />
        <KpiCard label="Accounts" value={fmt(overview.data?.kpis.total_accounts, 0)} hint={`${overview.data?.kpis.accounts_with_balance ?? "—"} with balance`} />
        <KpiCard label="Reserved (settlements)" value={
          <div className="text-sm">{(overview.data?.reserved ?? []).map((r: { currency: string; amount: number }) => (
            <div key={r.currency}><span className="tabular-nums font-semibold">{fmt(r.amount)}</span> <span className="text-xs text-muted-foreground">{r.currency}</span></div>
          ))}{(overview.data?.reserved ?? []).length === 0 ? "—" : null}</div>
        } />
        <KpiCard label="Pending (draft)" value={
          <div className="text-sm">{(overview.data?.pending ?? []).map((r: { currency: string; amount: number }) => (
            <div key={r.currency}><span className="tabular-nums font-semibold">{fmt(r.amount)}</span> <span className="text-xs text-muted-foreground">{r.currency}</span></div>
          ))}{(overview.data?.pending ?? []).length === 0 ? "—" : null}</div>
        } />
        <KpiCard label="Expected inflows" value={
          <div className="text-sm">{(overview.data?.expected_inflows ?? []).map((r: { currency: string; amount: number }) => (
            <div key={r.currency}><span className="tabular-nums font-semibold">{fmt(r.amount)}</span> <span className="text-xs text-muted-foreground">{r.currency}</span></div>
          ))}{(overview.data?.expected_inflows ?? []).length === 0 ? "—" : null}</div>
        } />
        <KpiCard label="Expected outflows" value={
          <div className="text-sm">{(overview.data?.expected_outflows ?? []).map((r: { currency: string; amount: number }) => (
            <div key={r.currency}><span className="tabular-nums font-semibold">{fmt(r.amount)}</span> <span className="text-xs text-muted-foreground">{r.currency}</span></div>
          ))}{(overview.data?.expected_outflows ?? []).length === 0 ? "—" : null}</div>
        } />
        <KpiCard label="Largest daily move"
          value={fmt(overview.data?.largest_daily_movement?.total_abs_move)}
          hint={overview.data?.largest_daily_movement?.entry_date ?? "—"} />
        <KpiCard label="Newest activity"
          value={overview.data?.kpis.newest_activity ? new Date(overview.data.kpis.newest_activity).toLocaleDateString() : "—"} />
      </section>

      <Tabs defaultValue="position" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="position">Position</TabsTrigger>
          <TabsTrigger value="flow">Cash Flow</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="exposure">Currency Exposure</TabsTrigger>
          <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
          <TabsTrigger value="dormant">Dormant</TabsTrigger>
          <TabsTrigger value="limits">Known Limitations</TabsTrigger>
        </TabsList>

        {/* POSITION */}
        <TabsContent value="position" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>By Currency</CardTitle>
                <Button variant="outline" size="sm" disabled={!overview.data} onClick={() => {
                  if (!overview.data) return;
                  downloadCsv(
                    `treasury_by_currency_${new Date().toISOString().slice(0,10)}.csv`,
                    buildTreasuryCsvMeta(overview.data.meta, { date_from: overview.data.date_from, date_to: overview.data.date_to }),
                    ["currency","held","held_aed","account_count","oldest_activity","newest_activity"],
                    overview.data.by_currency.map((c: { currency: string; held: number; held_aed: number | null; account_count: number; oldest_activity: string | null; newest_activity: string | null }) =>
                      [c.currency, c.held, c.held_aed ?? "", c.account_count, c.oldest_activity ?? "", c.newest_activity ?? ""].join(",")),
                  );
                }}><Download className="h-4 w-4 mr-1" /> CSV</Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Held</TableHead>
                    <TableHead className="text-right">Held (AED)</TableHead>
                    <TableHead className="text-right">Accounts</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {overview.data?.by_currency.map((c: { currency: string; held: number; held_aed: number | null; account_count: number }) => (
                      <TableRow key={c.currency}>
                        <TableCell className="font-medium">{c.currency}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.held)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.held_aed)}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.account_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>By Owner</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Accounts</TableHead>
                    <TableHead className="text-right">AED</TableHead>
                    <TableHead className="text-right">IRR</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {overview.data?.by_owner.map((r: { owner: string; account_count: number; aed_balance: number; irr_balance: number; other_balance: number }) => (
                      <TableRow key={r.owner}>
                        <TableCell className="font-medium capitalize">{r.owner}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.account_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.aed_balance)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.irr_balance, 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.other_balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Largest Balances (top 10 AED equiv)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">AED Equiv</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {overview.data?.largest_balances.map((r: { account_id: string; account_name: string; currency: string; account_owner: string; balance: number; balance_aed: number | null }) => (
                    <TableRow key={r.account_id}>
                      <TableCell className="font-medium">{r.account_name}</TableCell>
                      <TableCell>{r.currency}</TableCell>
                      <TableCell className="capitalize">{r.account_owner}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.balance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.balance_aed)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FLOW */}
        <TabsContent value="flow">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Cash Flow ({granularity})</CardTitle>
              <Button variant="outline" size="sm" disabled={!cashflow.data} onClick={() => {
                if (!cashflow.data) return;
                downloadCsv(
                  `treasury_cashflow_${granularity}_${new Date().toISOString().slice(0,10)}.csv`,
                  buildTreasuryCsvMeta(cashflow.data.meta, { granularity: cashflow.data.granularity, date_from: cashflow.data.date_from, date_to: cashflow.data.date_to }),
                  ["bucket_start","inflow","outflow","net","running_net","movements"],
                  cashflow.data.series.map((r: { bucket_start: string; inflow: number; outflow: number; net: number; running_net: number; movements: number }) =>
                    [r.bucket_start, r.inflow, r.outflow, r.net, r.running_net, r.movements].join(",")),
                );
              }}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashflow.data?.series ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bucket_start" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend />
                    <Bar dataKey="inflow" name="Inflow" fill="hsl(var(--primary))" />
                    <Bar dataKey="outflow" name="Outflow" fill="hsl(var(--destructive))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-64 mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cashflow.data?.series ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bucket_start" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Line type="monotone" dataKey="running_net" name="Running Net" stroke="hsl(var(--primary))" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FORECAST */}
        <TabsContent value="forecast">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Cash Forecast <Badge variant="outline" className="ml-2">ESTIMATE</Badge></CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{cashflow.data?.forecast_note}</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={combinedFlow}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bucket_start" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend />
                    <Area type="monotone" dataKey="inflow" name="Inflow" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="outflow" name="Outflow" fill="hsl(var(--destructive))" stroke="hsl(var(--destructive))" fillOpacity={0.2} />
                    <Line type="monotone" dataKey="net" name="Net" stroke="hsl(var(--foreground))" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 text-xs text-muted-foreground grid gap-1 sm:grid-cols-4">
                <div>Avg inflow / day: <span className="tabular-nums font-medium text-foreground">{fmt(cashflow.data?.forecast_stats?.avg_inflow)}</span></div>
                <div>Avg outflow / day: <span className="tabular-nums font-medium text-foreground">{fmt(cashflow.data?.forecast_stats?.avg_outflow)}</span></div>
                <div>Avg net / day: <span className="tabular-nums font-medium text-foreground">{fmt(cashflow.data?.forecast_stats?.avg_net)}</span></div>
                <div>Active days sampled: <span className="tabular-nums font-medium text-foreground">{fmt(cashflow.data?.forecast_stats?.active_days, 0)}</span></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXPOSURE */}
        <TabsContent value="exposure">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Currency Exposure</CardTitle>
              <Button variant="outline" size="sm" disabled={!exposure.data} onClick={() => {
                if (!exposure.data) return;
                downloadCsv(
                  `currency_exposure_${new Date().toISOString().slice(0,10)}.csv`,
                  buildTreasuryCsvMeta(exposure.data.meta, { date_from: exposure.data.date_from, date_to: exposure.data.date_to }),
                  ["currency","held","reserved","pending","net_position","market_mid","market_value","market_snapshot_at"],
                  exposure.data.rows.map((r: { currency: string; held: number; reserved: number; pending: number; net_position: number; market_mid: number | null; market_value: number | null; market_snapshot_at: string | null }) =>
                    [r.currency, r.held, r.reserved, r.pending, r.net_position, r.market_mid ?? "", r.market_value ?? "", r.market_snapshot_at ?? ""].join(",")),
                );
              }}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Held</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Market mid</TableHead>
                  <TableHead className="text-right">Market value</TableHead>
                  <TableHead>Snapshot</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {exposure.data?.rows.map((r: { currency: string; held: number; reserved: number; pending: number; net_position: number; market_mid: number | null; market_value: number | null; market_snapshot_at: string | null }) => (
                    <TableRow key={r.currency}>
                      <TableCell className="font-medium">{r.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.held)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.reserved)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.pending)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.net_position)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.market_mid, 4)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.market_value)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.market_snapshot_at ? new Date(r.market_snapshot_at).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="h-72 mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={exposure.data?.trend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="entry_date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend />
                    <Line type="monotone" dataKey="running_change" stroke="hsl(var(--primary))" dot={false} name="Running Δ" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACCOUNTS */}
        <TabsContent value="accounts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Bank Account Analytics</CardTitle>
              <Button variant="outline" size="sm" disabled={!bankAnalytics.data} onClick={() => {
                if (!bankAnalytics.data) return;
                downloadCsv(
                  `bank_account_analytics_${new Date().toISOString().slice(0,10)}.csv`,
                  buildTreasuryCsvMeta(bankAnalytics.data.meta, { date_from: bankAnalytics.data.date_from, date_to: bankAnalytics.data.date_to, total: bankAnalytics.data.total }),
                  ["account_name","currency","account_owner","account_type","bank_name","balance","avg_daily_balance","movements","inflow","outflow","net_flow","largest_tx","most_active_period","activity_status","days_dormant"],
                  bankAnalytics.data.rows.map((r: { account_name: string; currency: string; account_owner: string; account_type: string; bank_name: string | null; balance: number; avg_daily_balance: number; movements: number; inflow: number; outflow: number; net_flow: number; largest_tx: number | null; most_active_period: string | null; activity_status: string; days_dormant: number }) =>
                    [r.account_name, r.currency, r.account_owner, r.account_type, r.bank_name ?? "", r.balance, r.avg_daily_balance, r.movements, r.inflow, r.outflow, r.net_flow, r.largest_tx ?? "", r.most_active_period ?? "", r.activity_status, r.days_dormant].join(",")),
                );
              }}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Ccy</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Avg Daily</TableHead>
                  <TableHead className="text-right">Movements</TableHead>
                  <TableHead className="text-right">Largest Tx</TableHead>
                  <TableHead>Most Active</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {bankAnalytics.data?.rows.map((r: { account_id: string; account_name: string; currency: string; account_owner: string; balance: number; avg_daily_balance: number; movements: number; largest_tx: number | null; most_active_period: string | null; activity_status: string; days_dormant: number }) => (
                    <TableRow key={r.account_id}>
                      <TableCell className="font-medium">{r.account_name}</TableCell>
                      <TableCell>{r.currency}</TableCell>
                      <TableCell className="capitalize">{r.account_owner}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.balance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.avg_daily_balance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.movements}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.largest_tx)}</TableCell>
                      <TableCell className="text-xs">{r.most_active_period ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.activity_status === "dormant" ? "destructive" : r.activity_status === "quiet" ? "outline" : "default"}>
                          {r.activity_status} · {fmt(r.days_dormant, 0)}d
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DORMANT */}
        <TabsContent value="dormant">
          <Card>
            <CardHeader><CardTitle>Dormant Accounts (no activity ≥ 60 days, non-zero balance)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="text-right">Days Dormant</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {overview.data?.dormant_accounts.map((r: { account_id: string; account_name: string; currency: string; account_owner: string; balance: number; last_activity_at: string | null; days_dormant: number }) => (
                    <TableRow key={r.account_id}>
                      <TableCell className="font-medium">{r.account_name}</TableCell>
                      <TableCell>{r.currency}</TableCell>
                      <TableCell className="capitalize">{r.account_owner}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.balance)}</TableCell>
                      <TableCell className="text-xs">{r.last_activity_at ? new Date(r.last_activity_at).toLocaleString() : "never"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.days_dormant, 0)}</TableCell>
                    </TableRow>
                  ))}
                  {(overview.data?.dormant_accounts.length ?? 0) === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No dormant accounts.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LIMITS */}
        <TabsContent value="limits">
          <Card>
            <CardHeader><CardTitle>Known Limitations</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p><strong>Reserved cash</strong> = sum of <code>settlement_amount</code> for v2 remittances in workflow states <em>funds_received, settlement_pending, allocating, ready_to_close</em>. Legacy remittances are not classified as reserved.</p>
              <p><strong>Pending cash</strong> = sum of <code>settlement_amount</code> for v2 remittances in <em>draft</em> state.</p>
              <p><strong>Expected inflows</strong> = customer payment amounts for remittances still awaiting funds.</p>
              <p><strong>Expected outflows</strong> = settlement obligations for remittances not yet delivered/closed. This overlaps with Reserved by design; both views are intentional.</p>
              <p><strong>Forecast</strong> = arithmetic mean of the last 30 days of net cash flow, projected forward. No AI. No seasonality. Every forecast row is flagged <code>is_estimate=true</code>.</p>
              <p><strong>AED equivalents</strong> are computed with the latest persisted <code>v_market_rate_latest</code> snapshot. Only AED and IRR convert; other currencies show only native amounts.</p>
              <p><strong>Excel &amp; PDF exports</strong>: use the CSV button (opens directly in Excel) and browser Print → Save as PDF respectively. No standalone Excel/PDF binaries are generated server-side.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
