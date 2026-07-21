import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { fetchExecutiveKpis, type ExecutiveKpis } from "@/lib/reports/executive.functions";

export const Route = createFileRoute("/_authenticated/reports/executive")({
  head: () => ({
    meta: [
      { title: "Executive Dashboard — Reports" },
      { name: "description", content: "Profit, remittance workflow state, and inventory value at a glance." },
    ],
  }),
  component: ExecutiveDashboardPage,
});

const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(n);

function delta(current: number, prior: number) {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" /> n/a
    </span>
  );
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}>
      <Icon className="h-3 w-3" />
      {(value * 100).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function ExecutiveDashboardPage() {
  const q = useQuery<ExecutiveKpis>({
    queryKey: ["report_executive_kpis"],
    queryFn: fetchExecutiveKpis,
    staleTime: 60_000,          // executive cache 60s
    refetchInterval: 300_000,   // background refresh 5m
  });

  const data = q.data;
  const meta = data?.meta;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Executive Dashboard"
        description="Server-authoritative profit, workflow, and inventory value. Cached 60 seconds."
        actions={
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {meta ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">v{meta.report_version}</Badge>
          <span>Generated {new Date(meta.generated_at).toLocaleString()}</span>
          <span>·</span>
          <span>Data cutoff {new Date(meta.data_cutoff).toLocaleString()}</span>
        </div>
      ) : null}

      {q.isError ? (
        <Card>
          <CardContent className="py-8 text-sm text-red-600">
            Failed to load report: {(q.error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      {/* Profit */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Profit (AED)</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label="Today"
            value={fmt(data?.profit.today)}
            sub={<DeltaBadge value={data ? delta(data.profit.today, data.profit.yesterday) : null} />}
          />
          <KpiCard label="Yesterday" value={fmt(data?.profit.yesterday)} />
          <KpiCard
            label="Month-to-date"
            value={fmt(data?.profit.mtd)}
            sub={<DeltaBadge value={data ? delta(data.profit.mtd, data.profit.last_month) : null} />}
          />
          <KpiCard label="Last month" value={fmt(data?.profit.last_month)} />
          <KpiCard label="Year-to-date" value={fmt(data?.profit.ytd)} />
        </div>
      </section>

      {/* Remittances */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Remittances</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Open"                value={fmt(data?.remittances.open)} />
          <KpiCard label="Waiting supplier"    value={fmt(data?.remittances.waiting_supplier)} />
          <KpiCard label="Waiting allocation"  value={fmt(data?.remittances.waiting_allocation)} />
          <KpiCard label="Ready to close"      value={fmt(data?.remittances.ready_to_close)} />
          <KpiCard label="Closed (total)"      value={fmt(data?.remittances.closed)} />
        </div>
      </section>

      {/* Inventory */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Inventory by currency</h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Currency</th>
                  <th className="text-right p-3">Remaining</th>
                  <th className="text-right p-3">WAP cost</th>
                  <th className="text-right p-3">Cost basis ccy</th>
                  <th className="text-right p-3">Market mid</th>
                  <th className="text-right p-3">Est. market value (AED)</th>
                  <th className="text-right p-3">Unrealized P/L (AED)</th>
                  <th className="text-right p-3">Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {(data?.inventory ?? []).map((r) => {
                  const pl = r.unrealized_pl_aed;
                  return (
                    <tr key={r.currency} className="border-t">
                      <td className="p-3 font-medium">{r.currency}</td>
                      <td className="p-3 text-right tabular-nums">{fmt(r.remaining_amount, 2)}</td>
                      <td className="p-3 text-right tabular-nums">{fmt(r.wap_cost_rate, 4)}</td>
                      <td className="p-3 text-right text-muted-foreground">{r.cost_basis_currency ?? "—"}</td>
                      <td className="p-3 text-right tabular-nums">
                        {r.market_mid === null ? (
                          <span className="text-muted-foreground text-xs">unavailable</span>
                        ) : fmt(r.market_mid, 4)}
                      </td>
                      <td className="p-3 text-right tabular-nums">{fmt(r.estimated_market_value_aed, 0)}</td>
                      <td className={`p-3 text-right tabular-nums ${
                        pl === null ? "text-muted-foreground" : pl >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}>{fmt(pl, 0)}</td>
                      <td className="p-3 text-right text-xs text-muted-foreground">
                        {r.market_snapshot_at ? (
                          <>
                            {new Date(r.market_snapshot_at).toLocaleString()}
                            {r.market_snapshot_source ? <> · {r.market_snapshot_source}</> : null}
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {data && data.inventory.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">No inventory on hand.</td></tr>
                ) : null}
                {!data ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">Loading…</td></tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Market values are derived from the latest persisted rate snapshot per currency. Live rate feeds are never read
          from within reports, so historical rendering is reproducible.
        </p>
      </section>
    </div>
  );
}