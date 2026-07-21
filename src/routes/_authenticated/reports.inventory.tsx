import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Download, RefreshCw, Package, ArrowRight } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  fetchInventoryOverview,
  fetchInventoryLots,
  fetchInventoryTimeline,
  fetchInventoryConsumption,
  buildInventoryCsvMeta,
  downloadCsv,
  type InventoryOverviewResponse,
  type InventoryLotsResponse,
} from "@/lib/reports/inventory.functions";
import type { QualityMode } from "@/lib/reports/executive.functions";

export const Route = createFileRoute("/_authenticated/reports/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory Analytics — Reports" },
      {
        name: "description",
        content:
          "FIFO inventory: lot-level costs, aging buckets, consumption velocity, and unrealized market P&L using persisted snapshots.",
      },
    ],
  }),
  component: InventoryDashboard,
});

const AGE_BUCKETS = ["0-7", "8-30", "31-90", "91-180", "181-365", "365+"];

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(Number(n))
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(Number(n));

const pct = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(2)}%`;

function DisclosureBar({
  mode,
  included,
  excluded,
  from,
  to,
  cutoff,
  extra,
}: {
  mode: QualityMode;
  included: number | undefined;
  excluded: number | undefined;
  from: string | undefined;
  to: string | undefined;
  cutoff: string | undefined;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30"
      role="status"
      aria-label="Report disclosure"
    >
      <Badge variant="outline" className="uppercase tracking-wide">
        {mode.replace("_", " ")}
      </Badge>
      <span>
        Rows included <span className="tabular-nums font-medium text-foreground">{included ?? "—"}</span>
      </span>
      <span>·</span>
      <span>
        Rows excluded <span className="tabular-nums font-medium text-foreground">{excluded ?? "—"}</span>
      </span>
      <span>·</span>
      <span>
        Range {from ?? "—"} → {to ?? "—"}
      </span>
      {cutoff ? (
        <>
          <span>·</span>
          <span>Data cutoff {new Date(cutoff).toLocaleString()}</span>
        </>
      ) : null}
      {extra}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function InventoryDashboard() {
  const [mode, setMode] = useState<QualityMode>("exclude_invalid");
  const [currency, setCurrency] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [ageBucket, setAgeBucket] = useState<string>("all");
  const [granularity, setGranularity] = useState<"day" | "week" | "month" | "year">("day");
  const [search, setSearch] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const overviewArgs = useMemo(
    () => ({
      quality_mode: mode,
      currency: currency === "all" ? null : currency,
      status: status === "all" ? null : status,
      from: from || null,
      to: to || null,
    }),
    [mode, currency, status, from, to],
  );

  const overview = useQuery({
    queryKey: ["report", "inventory_overview", overviewArgs],
    queryFn: () => fetchInventoryOverview(overviewArgs),
    staleTime: 60_000,
  });

  const timeline = useQuery({
    queryKey: ["report", "inventory_timeline", granularity, currency, from, to],
    queryFn: () =>
      fetchInventoryTimeline({
        granularity,
        currency: currency === "all" ? null : currency,
        from: from || null,
        to: to || null,
      }),
    staleTime: 60_000,
  });

  const consumption = useQuery({
    queryKey: ["report", "inventory_consumption", currency, from, to],
    queryFn: () =>
      fetchInventoryConsumption({
        quality_mode: mode,
        currency: currency === "all" ? null : currency,
        from: from || null,
        to: to || null,
        limit: 10,
      }),
    staleTime: 60_000,
  });

  const lots = useQuery({
    queryKey: ["report", "inventory_lots", overviewArgs, ageBucket, search],
    queryFn: () =>
      fetchInventoryLots({
        ...overviewArgs,
        age_bucket: ageBucket === "all" ? null : ageBucket,
        search: search || null,
        limit: 100,
      }),
    staleTime: 60_000,
  });

  const currencies = overview.data?.by_currency.map((c) => c.currency) ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Inventory Analytics"
        description="FIFO lots as the accounting engine sees them. All math server-side."
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Quality</label>
            <Select value={mode} onValueChange={(v) => setMode(v as QualityMode)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
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
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="depleted">Depleted</SelectItem>
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
          <Button variant="outline" onClick={() => { overview.refetch(); timeline.refetch(); consumption.refetch(); lots.refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </CardContent>
      </Card>

      <DisclosureBar
        mode={mode}
        included={overview.data?.rows_included}
        excluded={overview.data?.rows_excluded}
        from={overview.data?.date_from}
        to={overview.data?.date_to}
        cutoff={overview.data?.meta.data_cutoff}
        extra={
          <>
            <span>·</span>
            <span>Report v{overview.data?.meta.report_version ?? "—"}</span>
          </>
        }
      />

      {/* KPIs */}
      <section aria-label="Overview KPIs" className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard
          label="Remaining Cost (AED)"
          value={fmt(overview.data?.kpis.remaining_cost_aed)}
          hint={overview.data?.kpis.aed_market_snapshot_rate ? `AED snap ${fmt(overview.data.kpis.aed_market_snapshot_rate, 0)}` : "no snapshot"}
        />
        <KpiCard label="Consumed Cost (AED)" value={fmt(overview.data?.kpis.consumed_cost_aed)} />
        <KpiCard label="Original Cost (AED)" value={fmt(overview.data?.kpis.original_cost_aed)} />
        <KpiCard label="Utilization %" value={pct(overview.data?.kpis.utilization_pct)} hint="cost basis" />
        <KpiCard label="Turnover" value={fmt(overview.data?.kpis.turnover_ratio, 2)} hint="consumed / avg cost" />
        <KpiCard label="Avg Lot Age" value={`${fmt(overview.data?.kpis.avg_age_days, 1)}d`} />
        <KpiCard label="Total Lots" value={fmt(overview.data?.kpis.total_lots, 0)} />
        <KpiCard label="Available" value={fmt(overview.data?.kpis.available_lots, 0)} />
        <KpiCard label="Partial" value={fmt(overview.data?.kpis.partial_lots, 0)} />
        <KpiCard label="Depleted" value={fmt(overview.data?.kpis.depleted_lots, 0)} />
        <KpiCard label="Oldest Lot" value={overview.data?.kpis.oldest_entry_date ?? "—"} />
        <KpiCard label="Newest Lot" value={overview.data?.kpis.newest_entry_date ?? "—"} />
      </section>

      <Tabs defaultValue="aging" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="currency">By Currency</TabsTrigger>
          <TabsTrigger value="account">By Account</TabsTrigger>
          <TabsTrigger value="fifo">FIFO Queue</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="consumption">Consumption</TabsTrigger>
          <TabsTrigger value="market">Market</TabsTrigger>
        </TabsList>

        {/* AGING */}
        <TabsContent value="aging" className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={!overview.data}
              onClick={() => {
                if (!overview.data) return;
                const r = overview.data;
                downloadCsv(
                  `inventory_aging_${new Date().toISOString().slice(0,10)}.csv`,
                  buildInventoryCsvMeta(r),
                  ["bucket","lot_count","remaining_amount","remaining_cost","remaining_cost_aed","pct_of_remaining"],
                  r.aging.map((b) => [b.bucket,b.lot_count,b.remaining_amount,b.remaining_cost,b.remaining_cost_aed ?? "",b.pct_of_remaining ?? ""].join(",")),
                );
              }}
            >
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Inventory Aging</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.data?.aging ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bucket" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      formatter={(v: number, k) => [fmt(v), String(k)]}
                    />
                    <Bar dataKey="remaining_cost_aed" name="Remaining Cost (AED)" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Bucket</TableHead>
                    <TableHead className="text-right">Lots</TableHead>
                    <TableHead className="text-right">Remaining Amount</TableHead>
                    <TableHead className="text-right">Remaining Cost</TableHead>
                    <TableHead className="text-right">Remaining Cost AED</TableHead>
                    <TableHead className="text-right">% of Remaining</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {overview.data?.aging.map((b) => (
                      <TableRow key={b.bucket}>
                        <TableCell>{b.bucket}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(b.lot_count, 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(b.remaining_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(b.remaining_cost)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(b.remaining_cost_aed)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(b.pct_of_remaining)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CURRENCY */}
        <TabsContent value="currency">
          <Card>
            <CardHeader><CardTitle>By Currency</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Cost Basis</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Consumed</TableHead>
                  <TableHead className="text-right">WAP Cost Rate</TableHead>
                  <TableHead className="text-right">Lots (A/P/D)</TableHead>
                  <TableHead className="text-right">Avg Age</TableHead>
                  <TableHead className="text-right">Util %</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {overview.data?.by_currency.map((c) => (
                    <TableRow key={c.currency}>
                      <TableCell className="font-medium">{c.currency}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.cost_basis_currency ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.original_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.remaining_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.consumed_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.wap_cost_rate, 6)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {c.available_lots}/{c.partial_lots}/{c.depleted_lots}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.avg_age_days, 1)}d</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(c.utilization_pct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACCOUNT */}
        <TabsContent value="account">
          <Card>
            <CardHeader><CardTitle>By Account</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Currencies</TableHead>
                  <TableHead className="text-right">Lots</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Consumed</TableHead>
                  <TableHead className="text-right">Remaining Cost AED</TableHead>
                  <TableHead className="text-right">Largest Lot</TableHead>
                  <TableHead className="text-right">Util %</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {overview.data?.by_account.map((a) => (
                    <TableRow key={a.account_id}>
                      <TableCell className="font-medium">{a.account_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{a.account_owner ?? "—"}</TableCell>
                      <TableCell className="text-xs">{(a.currencies ?? []).join(", ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(a.lot_count, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(a.remaining_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(a.consumed_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(a.remaining_cost_aed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(a.largest_lot_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(a.utilization_pct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FIFO */}
        <TabsContent value="fifo" className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Age bucket</label>
              <Select value={ageBucket} onValueChange={setAgeBucket}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {AGE_BUCKETS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">Search (code, account, description)</label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="AED-0001…" />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!lots.data}
              onClick={() => {
                const r = lots.data as InventoryLotsResponse | undefined;
                if (!r) return;
                downloadCsv(
                  `inventory_lots_${new Date().toISOString().slice(0,10)}.csv`,
                  buildInventoryCsvMeta(r),
                  ["lot_code","currency","account","status","entry_date","age_days","original_amount","remaining_amount","consumed_amount","cost_basis_rate","cost_basis_currency","original_cost","remaining_cost","source_ref_type","operator"],
                  r.rows.map((l) => [
                    l.lot_code, l.currency, JSON.stringify(l.account_name ?? ""), l.status, l.entry_date, Number(l.age_days).toFixed(2),
                    l.original_amount, l.remaining_amount, l.consumed_amount,
                    l.cost_basis_rate ?? "", l.cost_basis_currency ?? "",
                    l.original_cost, l.remaining_cost,
                    l.source_ref_type ?? "", JSON.stringify(l.operator_label ?? ""),
                  ].join(",")),
                );
              }}
            >
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>FIFO Queue ({lots.data?.total ?? 0} lots)</span>
                <span className="text-xs font-normal text-muted-foreground">v{lots.data?.meta.report_version ?? "—"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Consumed</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Cost Rate</TableHead>
                  <TableHead className="text-right">Remaining Cost</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {lots.data?.rows.map((l) => (
                    <TableRow key={l.lot_id}>
                      <TableCell className="font-mono text-xs">{l.lot_code}</TableCell>
                      <TableCell>{l.currency}</TableCell>
                      <TableCell className="text-xs">{l.account_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.entry_date}</TableCell>
                      <TableCell className="text-xs">{fmt(l.age_days, 1)}d <span className="text-muted-foreground">({l.age_bucket})</span></TableCell>
                      <TableCell>
                        <Badge variant={l.status === "available" ? "default" : l.status === "partial" ? "secondary" : "outline"}>
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(l.original_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(l.consumed_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(l.remaining_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {fmt(l.cost_basis_rate, 6)}
                        {l.cost_basis_currency ? <span className="text-muted-foreground"> {l.cost_basis_currency}</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(l.remaining_cost)}</TableCell>
                      <TableCell className="text-xs">{l.operator_label ?? "—"}</TableCell>
                      <TableCell>
                        <Link to="/reports/inventory/$id" params={{ id: l.lot_id }} className="inline-flex items-center text-xs text-primary hover:underline">
                          Open <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="space-y-3">
          <div className="flex items-end justify-between">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Granularity</label>
              <Select value={granularity} onValueChange={(v) => setGranularity(v as "day" | "week" | "month" | "year")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Card>
            <CardHeader><CardTitle>Buy / Consumption Timeline</CardTitle></CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline.data?.series ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bucket_start" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      formatter={(v: number, k) => [fmt(v), String(k)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="added_amount" name="Added" stroke="hsl(var(--primary))" dot={false} />
                    <Line type="monotone" dataKey="consumed_amount" name="Consumed" stroke="hsl(var(--destructive))" dot={false} />
                    <Line type="monotone" dataKey="net_amount" name="Net" stroke="hsl(var(--muted-foreground))" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONSUMPTION */}
        <TabsContent value="consumption" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="Avg Consumption Delay" value={consumption.data?.avg_consumption_delay_seconds ? `${(consumption.data.avg_consumption_delay_seconds / 86400).toFixed(2)}d` : "—"} />
            <KpiCard label="Velocity" value={consumption.data?.consumption_velocity_per_day ? `${fmt(consumption.data.consumption_velocity_per_day, 2)}/d` : "—"} hint="events per day" />
            <KpiCard label="Est. Remaining Lifetime" value={consumption.data?.remaining_lifetime_days ? `${fmt(consumption.data.remaining_lifetime_days, 1)}d` : "—"} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { title: "Most Consumed", rows: consumption.data?.most_consumed_lots ?? [] },
              { title: "Least Consumed", rows: consumption.data?.least_consumed_lots ?? [] },
              { title: "Fastest Consumed", rows: consumption.data?.fastest_consumed_lots ?? [] },
              { title: "Slowest Consumed", rows: consumption.data?.slowest_consumed_lots ?? [] },
            ].map((sec) => (
              <Card key={sec.title}>
                <CardHeader><CardTitle className="text-base">{sec.title}</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Lot</TableHead><TableHead>Ccy</TableHead>
                      <TableHead className="text-right">Consumed %</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                      <TableHead className="text-right">Delay</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {sec.rows.map((l) => (
                        <TableRow key={l.lot_id}>
                          <TableCell className="font-mono text-xs">
                            <Link to="/reports/inventory/$id" params={{ id: l.lot_id }} className="hover:underline">
                              {l.lot_code}
                            </Link>
                          </TableCell>
                          <TableCell>{l.currency}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.consumed_pct !== null ? `${(Number(l.consumed_pct) * 100).toFixed(1)}%` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.consumption_events}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{l.delay_seconds !== null ? `${(l.delay_seconds/86400).toFixed(2)}d` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* MARKET */}
        <TabsContent value="market" className="space-y-3">
          <div className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-amber-500/10">
            Unrealized only. Uses persisted market snapshots; never live rates. Do not add to realized P&L.
          </div>
          <Card>
            <CardHeader><CardTitle>Cost vs Market</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">WAP Cost</TableHead>
                  <TableHead>Cost Basis</TableHead>
                  <TableHead className="text-right">Market Mid</TableHead>
                  <TableHead>Snapshot</TableHead>
                  <TableHead className="text-right">Remaining Cost AED</TableHead>
                  <TableHead className="text-right">Est Market Value AED</TableHead>
                  <TableHead className="text-right">Unrealized P&L AED</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {overview.data?.market.map((m) => (
                    <TableRow key={m.currency}>
                      <TableCell className="font-medium">{m.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.wap_cost_rate, 6)}</TableCell>
                      <TableCell className="text-xs">{m.cost_basis_currency ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.market_mid, 6)}</TableCell>
                      <TableCell className="text-xs">
                        {m.market_snapshot_at ? new Date(m.market_snapshot_at).toLocaleString() : "—"}
                        {m.market_snapshot_source ? <span className="text-muted-foreground"> · {m.market_snapshot_source}</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.remaining_cost_aed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.estimated_market_value_aed)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${Number(m.unrealized_pnl_aed) < 0 ? "text-destructive" : Number(m.unrealized_pnl_aed) > 0 ? "text-emerald-600" : ""}`}>
                        {fmt(m.unrealized_pnl_aed)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {overview.error ? (
        <div className="text-sm text-destructive">Failed to load: {String((overview.error as Error).message)}</div>
      ) : null}
    </div>
  );
}

// Silence unused type import in production if minifiers strip TSX.
export type _Ensure = InventoryOverviewResponse | InventoryLotsResponse;