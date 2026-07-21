import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Download, TrendingUp } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import {
  fetchProfitSeries,
  fetchProfitBreakdown,
  fetchProfitSummary,
  type QualityMode,
  type Granularity,
  type BreakdownDim,
  type ProfitSeriesResponse,
  type ProfitBreakdownResponse,
  type ProfitSummaryResponse,
} from "@/lib/reports/executive.functions";

export const Route = createFileRoute("/_authenticated/reports/profits")({
  head: () => ({
    meta: [
      { title: "Profit Analytics — Reports" },
      { name: "description", content: "Server-authoritative daily, weekly, monthly, yearly profit series with breakdowns by customer, supplier, currency, buy lot, operator, and payment destination." },
    ],
  }),
  component: ProfitAnalyticsPage,
});

const AED = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

function DisclosureBar(props: {
  mode: QualityMode;
  included: number | undefined;
  excluded: number | undefined;
  from: string | undefined;
  to: string | undefined;
  cutoff: string | undefined;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
      <Badge variant="outline" className="uppercase tracking-wide">{props.mode.replace("_", " ")}</Badge>
      <span>Rows included <span className="tabular-nums font-medium text-foreground">{props.included ?? "—"}</span></span>
      <span>·</span>
      <span>Rows excluded <span className="tabular-nums font-medium text-foreground">{props.excluded ?? "—"}</span></span>
      <span>·</span>
      <span>Range {props.from ?? "—"} → {props.to ?? "—"}</span>
      {props.cutoff ? (<><span>·</span><span>Data cutoff {new Date(props.cutoff).toLocaleString()}</span></>) : null}
      {props.extra}
    </div>
  );
}

function useDateRange() {
  const today = new Date();
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const yStart = new Date(today.getFullYear(), 0, 1);
  const [from, setFrom] = useState<string>(toISO(yStart));
  const [to, setTo] = useState<string>(toISO(today));
  return { from, to, setFrom, setTo };
}

function exportSeriesCsv(r: ProfitSeriesResponse) {
  const header = ["bucket_start", "profit_aed", "events"];
  const meta = [
    `# report=${r.meta.report_key}`,
    `# version=${r.meta.report_version}`,
    `# generated_at=${r.meta.generated_at}`,
    `# data_cutoff=${r.meta.data_cutoff}`,
    `# generated_by_version=${r.meta.generated_by_version}`,
    `# quality_mode=${r.quality_mode}`,
    `# granularity=${r.granularity}`,
    `# date_from=${r.date_from}`,
    `# date_to=${r.date_to}`,
    `# rows_included=${r.rows_included}`,
    `# rows_excluded=${r.rows_excluded}`,
  ];
  const body = r.series.map((b) => [b.bucket_start, b.profit_aed, b.events].join(","));
  return [...meta, header.join(","), ...body].join("\n");
}

function exportBreakdownCsv(r: ProfitBreakdownResponse) {
  const header = ["key", "label", "events", "profit_aed", "spread_aed", "commission_aed"];
  const meta = [
    `# report=${r.meta.report_key}`,
    `# version=${r.meta.report_version}`,
    `# generated_at=${r.meta.generated_at}`,
    `# data_cutoff=${r.meta.data_cutoff}`,
    `# generated_by_version=${r.meta.generated_by_version}`,
    `# quality_mode=${r.quality_mode}`,
    `# dimension=${r.dimension}`,
    `# date_from=${r.date_from}`,
    `# date_to=${r.date_to}`,
    `# rows_included=${r.rows_included}`,
    `# rows_excluded=${r.rows_excluded}`,
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = r.buckets.map((b) => [b.key, b.label, b.events, b.profit_aed, b.spread_aed, b.commission_aed].map(esc).join(","));
  return [...meta, header.join(","), ...body].join("\n");
}

function download(name: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function ProfitAnalyticsPage() {
  const [mode, setMode] = useState<QualityMode>("exclude_invalid");
  const [gran, setGran] = useState<Granularity>("day");
  const [dim, setDim] = useState<BreakdownDim>("customer");
  const { from, to, setFrom, setTo } = useDateRange();

  const seriesQ = useQuery<ProfitSeriesResponse>({
    queryKey: ["profit_series", mode, gran, from, to],
    queryFn: () => fetchProfitSeries({ quality_mode: mode, granularity: gran, from, to }),
    staleTime: 60_000,
  });
  const breakdownQ = useQuery<ProfitBreakdownResponse>({
    queryKey: ["profit_breakdown", mode, dim, from, to],
    queryFn: () => fetchProfitBreakdown({ quality_mode: mode, dimension: dim, from, to, limit: 25 }),
    staleTime: 60_000,
  });
  const summaryQ = useQuery<ProfitSummaryResponse>({
    queryKey: ["profit_summary", mode, from, to],
    queryFn: () => fetchProfitSummary({ quality_mode: mode, from, to, limit: 10 }),
    staleTime: 60_000,
  });

  const refetchAll = () => { seriesQ.refetch(); breakdownQ.refetch(); summaryQ.refetch(); };

  const seriesData = useMemo(() => (seriesQ.data?.series ?? []).map((b) => ({
    bucket: b.bucket_start, profit: Number(b.profit_aed), events: b.events,
  })), [seriesQ.data]);

  const breakdownData = useMemo(() => (breakdownQ.data?.buckets ?? []).map((b) => ({
    label: b.label ?? "—", profit: Number(b.profit_aed), spread: Number(b.spread_aed), commission: Number(b.commission_aed),
  })), [breakdownQ.data]);

  const s = summaryQ.data;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Profit Analytics"
        description="Server-authoritative profit aggregation. No financial math runs in the browser."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={mode} onValueChange={(v) => setMode(v as QualityMode)}>
              <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Include all historical data</SelectItem>
                <SelectItem value="exclude_invalid">Exclude invalid rows</SelectItem>
                <SelectItem value="exclude_suspicious">Exclude suspicious rows</SelectItem>
              </SelectContent>
            </Select>
            <input type="date" className="h-9 px-2 rounded-md border bg-background text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-muted-foreground text-xs">→</span>
            <input type="date" className="h-9 px-2 rounded-md border bg-background text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button variant="outline" size="sm" onClick={refetchAll} disabled={seriesQ.isFetching || breakdownQ.isFetching || summaryQ.isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${seriesQ.isFetching || breakdownQ.isFetching || summaryQ.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Total profit</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{AED(s?.total_profit_aed)} <span className="text-sm text-muted-foreground">AED</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Avg spread</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{AED(s?.avg_spread_aed)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Avg commission</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{AED(s?.avg_commission_aed)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Events counted</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{s?.rows_included ?? "—"}</div></CardContent>
        </Card>
      </div>

      {/* Series */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Profit series</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={gran} onValueChange={(v) => setGran(v as Granularity)}>
              <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={!seriesQ.data} onClick={() => seriesQ.data && download(`profit-series-${gran}-${from}_${to}.csv`, exportSeriesCsv(seriesQ.data))}>
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <DisclosureBar mode={mode} included={seriesQ.data?.rows_included} excluded={seriesQ.data?.rows_excluded} from={seriesQ.data?.date_from} to={seriesQ.data?.date_to} cutoff={seriesQ.data?.meta.data_cutoff} />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => AED(v as number)} />
                <Tooltip formatter={(v: number | string) => (typeof v === "number" ? `${AED(v)} AED` : v)} />
                <Line type="monotone" dataKey="profit" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Breakdown</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={dim} onValueChange={(v) => setDim(v as BreakdownDim)}>
              <SelectTrigger className="w-[220px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
                <SelectItem value="buy_lot">Buy Lot</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="payment_destination">Payment Destination</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={!breakdownQ.data} onClick={() => breakdownQ.data && download(`profit-breakdown-${dim}-${from}_${to}.csv`, exportBreakdownCsv(breakdownQ.data))}>
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <DisclosureBar mode={mode} included={breakdownQ.data?.rows_included} excluded={breakdownQ.data?.rows_excluded} from={breakdownQ.data?.date_from} to={breakdownQ.data?.date_to} cutoff={breakdownQ.data?.meta.data_cutoff} />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdownData} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => AED(v as number)} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={140} />
                <Tooltip formatter={(v: number | string) => (typeof v === "number" ? `${AED(v)} AED` : v)} />
                <Bar dataKey="profit" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Label</th>
                  <th className="text-right p-2">Events</th>
                  <th className="text-right p-2">Profit (AED)</th>
                  <th className="text-right p-2">Spread (AED)</th>
                  <th className="text-right p-2">Commission (AED)</th>
                </tr>
              </thead>
              <tbody>
                {(breakdownQ.data?.buckets ?? []).map((b) => (
                  <tr key={`${b.key ?? "null"}`} className="border-t">
                    <td className="p-2">{b.label}</td>
                    <td className="p-2 text-right tabular-nums">{b.events}</td>
                    <td className="p-2 text-right tabular-nums">{AED(b.profit_aed)}</td>
                    <td className="p-2 text-right tabular-nums">{AED(b.spread_aed)}</td>
                    <td className="p-2 text-right tabular-nums">{AED(b.commission_aed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Winners / Losers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top winners</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-2">Doc</th><th className="text-left p-2">Source</th><th className="text-left p-2">Date</th><th className="text-right p-2">Profit (AED)</th></tr>
              </thead>
              <tbody>
                {(s?.top_winners ?? []).map((w) => (
                  <tr key={`${w.source}:${w.ref_id}`} className="border-t">
                    <td className="p-2 font-mono text-xs">{w.doc_no ?? w.ref_id.slice(0, 8)}</td>
                    <td className="p-2 text-muted-foreground">{w.source}</td>
                    <td className="p-2 text-xs">{new Date(w.event_date).toLocaleDateString()}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-700">{AED(w.profit_aed)}</td>
                  </tr>
                ))}
                {(s?.top_winners?.length ?? 0) === 0 ? (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No events in range.</td></tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top losers</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-2">Doc</th><th className="text-left p-2">Source</th><th className="text-left p-2">Date</th><th className="text-right p-2">Loss (AED)</th></tr>
              </thead>
              <tbody>
                {(s?.top_losers ?? []).map((w) => (
                  <tr key={`${w.source}:${w.ref_id}`} className="border-t">
                    <td className="p-2 font-mono text-xs">{w.doc_no ?? w.ref_id.slice(0, 8)}</td>
                    <td className="p-2 text-muted-foreground">{w.source}</td>
                    <td className="p-2 text-xs">{new Date(w.event_date).toLocaleDateString()}</td>
                    <td className="p-2 text-right tabular-nums text-red-600">{AED(w.profit_aed)}</td>
                  </tr>
                ))}
                {(s?.top_losers?.length ?? 0) === 0 ? (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No losses in range.</td></tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        All aggregation runs inside <code>report_profit_series</code>, <code>report_profit_breakdown</code>, and <code>report_profit_summary</code> — the browser never sums, averages, or filters financial numbers. Metadata (version, quality mode, cutoff, included/excluded counts) is embedded in every response and every CSV export.
      </div>
    </div>
  );
}