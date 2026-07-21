import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Download, ArrowRight, Users, Truck } from "lucide-react";
import {
  fetchCustomerList,
  fetchSupplierList,
  buildCsvMetaHeader,
  downloadCsv,
  formatDurationSeconds,
  type CustomerListResponse,
  type SupplierListResponse,
} from "@/lib/reports/counterparties.functions";
import type { QualityMode } from "@/lib/reports/executive.functions";

export const Route = createFileRoute("/_authenticated/reports/counterparties")({
  head: () => ({
    meta: [
      { title: "Customer & Supplier Analytics — Reports" },
      {
        name: "description",
        content:
          "Server-authoritative customer and supplier rankings: lifetime volume, profit, settlement times, deterministic risk and reliability scoring.",
      },
    ],
  }),
  component: CounterpartiesPage,
});

const AED = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

const PCT = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(0)}%`;

function Disclosure(props: {
  mode: QualityMode;
  included: number | undefined;
  excluded: number | undefined;
  total: number | undefined;
  cutoff: string | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
      <Badge variant="outline" className="uppercase tracking-wide">
        {props.mode.replace("_", " ")}
      </Badge>
      <span>
        Rows included{" "}
        <span className="tabular-nums font-medium text-foreground">{props.included ?? "—"}</span>
      </span>
      <span>·</span>
      <span>
        Rows excluded{" "}
        <span className="tabular-nums font-medium text-foreground">{props.excluded ?? "—"}</span>
      </span>
      <span>·</span>
      <span>
        Total matched{" "}
        <span className="tabular-nums font-medium text-foreground">{props.total ?? "—"}</span>
      </span>
      {props.cutoff ? (
        <>
          <span>·</span>
          <span>Data cutoff {new Date(props.cutoff).toLocaleString()}</span>
        </>
      ) : null}
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    low: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    medium: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    high: "bg-red-500/15 text-red-700 border-red-500/30",
    unknown: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={map[level] ?? map.unknown}>
      {level}
    </Badge>
  );
}

function ReliabilityBadge({ score }: { score: number }) {
  const cls =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
      : score >= 60
        ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
        : "bg-red-500/15 text-red-700 border-red-500/30";
  return (
    <Badge variant="outline" className={cls}>
      {score}
    </Badge>
  );
}

function CustomersTab() {
  const [mode, setMode] = useState<QualityMode>("exclude_invalid");
  const [sort, setSort] = useState<string>("profit_desc");
  const [search, setSearch] = useState<string>("");

  const q = useQuery<CustomerListResponse>({
    queryKey: ["report_customer_list", mode, sort, search],
    queryFn: () => fetchCustomerList({ quality_mode: mode, sort, search, limit: 200 }),
    staleTime: 60_000,
  });

  const data = q.data;

  const exportCsv = () => {
    if (!data) return;
    const head = buildCsvMetaHeader(data);
    const cols = [
      "customer_id",
      "name",
      "phone",
      "trade_count",
      "lifetime_profit_aed",
      "lifetime_volume_aed",
      "avg_profit_aed",
      "avg_spread_aed",
      "avg_commission_aed",
      "largest_profit_aed",
      "largest_loss_aed",
      "preferred_currency",
      "preferred_destination_id",
      "most_active_month",
      "events_30d",
      "events_90d",
      "first_event_at",
      "last_event_at",
      "rem_total",
      "rem_open",
      "rem_closed",
      "rem_cancelled",
      "avg_settle_seconds",
      "avg_alloc_seconds",
      "avg_close_seconds",
      "success_rate",
      "cancel_rate",
      "loss_rate",
      "dormant_days",
      "risk_points",
      "risk_level",
    ];
    const rows = data.rows.map((r) =>
      cols.map((c) => JSON.stringify((r as Record<string, unknown>)[c] ?? "")).join(","),
    );
    downloadCsv(`customer_analytics_${data.date_from}_${data.date_to}.csv`, [
      ...head,
      cols.join(","),
      ...rows,
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="min-w-[220px] flex-1">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or phone"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Quality</label>
          <Select value={mode} onValueChange={(v) => setMode(v as QualityMode)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="exclude_invalid">Exclude invalid</SelectItem>
              <SelectItem value="exclude_suspicious">Only valid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Sort</label>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profit_desc">Profit (high → low)</SelectItem>
              <SelectItem value="profit_asc">Profit (low → high)</SelectItem>
              <SelectItem value="volume_desc">Volume</SelectItem>
              <SelectItem value="trades_desc">Trade count</SelectItem>
              <SelectItem value="risk_desc">Risk score</SelectItem>
              <SelectItem value="recent_desc">Most recent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <Disclosure
        mode={mode}
        included={data?.rows_included}
        excluded={data?.rows_excluded}
        total={data?.total}
        cutoff={data?.meta?.data_cutoff}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Lifetime Profit</TableHead>
                  <TableHead className="text-right">Lifetime Volume</TableHead>
                  <TableHead className="text-right">Avg Profit</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                  <TableHead className="text-right">Cancel</TableHead>
                  <TableHead className="text-right">Settle</TableHead>
                  <TableHead className="text-right">30d</TableHead>
                  <TableHead className="text-right">Last</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((r) => (
                  <TableRow key={r.customer_id}>
                    <TableCell className="font-medium">
                      <div>{r.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.phone ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.trade_count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {AED(r.lifetime_profit_aed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {AED(r.lifetime_volume_aed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {AED(r.avg_profit_aed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{PCT(r.success_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{PCT(r.cancel_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDurationSeconds(r.avg_settle_seconds)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.events_30d}</TableCell>
                    <TableCell className="text-right text-xs">
                      {r.last_event_at ? new Date(r.last_event_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RiskBadge level={r.risk_level} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to="/reports/customers/$id" params={{ id: r.customer_id }}>
                        <Button size="sm" variant="ghost">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {!q.isLoading && (data?.rows.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      No customers match the current filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SuppliersTab() {
  const [mode, setMode] = useState<QualityMode>("exclude_invalid");
  const [sort, setSort] = useState<string>("volume_desc");
  const [search, setSearch] = useState<string>("");

  const q = useQuery<SupplierListResponse>({
    queryKey: ["report_supplier_list", mode, sort, search],
    queryFn: () => fetchSupplierList({ quality_mode: mode, sort, search, limit: 200 }),
    staleTime: 60_000,
  });

  const data = q.data;

  const exportCsv = () => {
    if (!data) return;
    const head = buildCsvMetaHeader(data);
    const cols = [
      "supplier_id",
      "supplier_name",
      "phone",
      "delivered_count",
      "delivered_profit_aed",
      "delivered_volume_aed",
      "avg_profit_aed",
      "rem_total",
      "rem_open",
      "rem_closed",
      "rem_cancelled",
      "avg_delivery_seconds",
      "median_delivery_seconds",
      "late_deliveries",
      "alloc_total",
      "alloc_reversed",
      "alloc_delay_seconds",
      "avg_remittance_amount",
      "cancel_rate",
      "alloc_success_rate",
      "on_time_rate",
      "sample_ratio",
      "reliability_score",
    ];
    const rows = data.rows.map((r) =>
      cols.map((c) => JSON.stringify((r as Record<string, unknown>)[c] ?? "")).join(","),
    );
    downloadCsv(`supplier_analytics_${data.date_from}_${data.date_to}.csv`, [
      ...head,
      cols.join(","),
      ...rows,
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="min-w-[220px] flex-1">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Supplier name"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Quality</label>
          <Select value={mode} onValueChange={(v) => setMode(v as QualityMode)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="exclude_invalid">Exclude invalid</SelectItem>
              <SelectItem value="exclude_suspicious">Only valid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Sort</label>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="volume_desc">Volume</SelectItem>
              <SelectItem value="profit_desc">Profit</SelectItem>
              <SelectItem value="reliability_desc">Reliability (high → low)</SelectItem>
              <SelectItem value="reliability_asc">Reliability (low → high)</SelectItem>
              <SelectItem value="delivery_asc">Fastest delivery</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <Disclosure
        mode={mode}
        included={data?.rows_included}
        excluded={data?.rows_excluded}
        total={data?.total}
        cutoff={data?.meta?.data_cutoff}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Avg delivery</TableHead>
                  <TableHead className="text-right">Median</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead className="text-right">Cancel</TableHead>
                  <TableHead className="text-right">Alloc ok</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Reliability</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((r) => (
                  <TableRow key={r.supplier_id}>
                    <TableCell className="font-medium">
                      <div>{r.supplier_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {(r.currencies_served ?? []).join(", ")}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.delivered_count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {AED(r.delivered_volume_aed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {AED(r.delivered_profit_aed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDurationSeconds(r.avg_delivery_seconds)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDurationSeconds(r.median_delivery_seconds)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.late_deliveries}</TableCell>
                    <TableCell className="text-right tabular-nums">{PCT(r.cancel_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {PCT(r.alloc_success_rate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.rem_open}</TableCell>
                    <TableCell className="text-right">
                      <ReliabilityBadge score={r.reliability_score} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to="/reports/suppliers/$id" params={{ id: r.supplier_id }}>
                        <Button size="sm" variant="ghost">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {!q.isLoading && (data?.rows.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      No suppliers match the current filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CounterpartiesPage() {
  const [tab, setTab] = useState<"customers" | "suppliers">("customers");
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Customer & Supplier Analytics"
        description="Deterministic historical rankings and health scoring. Read-only. Server-authoritative."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as "customers" | "suppliers")}>
        <TabsList>
          <TabsTrigger value="customers" className="gap-2">
            <Users className="h-4 w-4" /> Customers
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-2">
            <Truck className="h-4 w-4" /> Suppliers
          </TabsTrigger>
        </TabsList>
        <TabsContent value="customers" className="mt-4">
          <CustomersTab />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <SuppliersTab />
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Scoring methodology</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div>
            Customer risk: deterministic points from cancel rate, loss rate, success rate,
            settlement time and dormancy. ≤2 low · ≤4 medium · &gt;4 high.
          </div>
          <div>
            Supplier reliability: 40% on-time + 30% allocation success + 20% (1 − cancel rate) + 10%
            sample size (0–100).
          </div>
          <div>Both are pure historical calculations. No AI, no forecasting, no live rates.</div>
        </CardContent>
      </Card>
    </div>
  );
}
