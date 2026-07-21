import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity } from "lucide-react";
import { fetchOperationalKpis, type OperationalKpis } from "@/lib/reports/executive.functions";

export const Route = createFileRoute("/_authenticated/reports/operations")({
  head: () => ({
    meta: [
      { title: "Operational KPIs — Reports" },
      { name: "description", content: "Live queue state, operator workload, and processing times." },
    ],
  }),
  component: OperationsPage,
});

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);

function fmtDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function OperationsPage() {
  const q = useQuery<OperationalKpis>({
    queryKey: ["report_operational_kpis"],
    queryFn: fetchOperationalKpis,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const data = q.data;
  const meta = data?.meta;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Operational KPIs"
        description="Live queue and workload. Refreshes every 15 seconds."
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
        <Card><CardContent className="py-8 text-sm text-red-600">
          Failed to load report: {(q.error as Error).message}
        </CardContent></Card>
      ) : null}

      {/* Today counters */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Closed today</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{fmt(data?.closed_today)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Cancelled today</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{fmt(data?.cancelled_today)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Avg processing (open → close)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{fmtDuration(data?.avg_processing_seconds)}</div></CardContent>
        </Card>
      </div>

      {/* Queue by state */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Remittance queue</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data ? Object.entries(data.states).sort(([a], [b]) => a.localeCompare(b)).map(([state, n]) => (
            <Card key={state}>
              <CardHeader className="pb-1"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{state.replace(/_/g, " ")}</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-semibold tabular-nums">{fmt(n)}</div></CardContent>
            </Card>
          )) : (
            <div className="text-sm text-muted-foreground flex items-center gap-2"><Activity className="h-4 w-4 animate-pulse" /> Loading…</div>
          )}
        </div>
      </section>

      {/* Operator workload */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Operator workload</h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Operator</th>
                  <th className="text-right p-3">Open drafts</th>
                  <th className="text-right p-3">In flight</th>
                  <th className="text-right p-3">Closed today</th>
                  <th className="text-right p-3">Cancelled today</th>
                </tr>
              </thead>
              <tbody>
                {(data?.operator_workload ?? []).map((r) => (
                  <tr key={r.operator_id} className="border-t">
                    <td className="p-3 font-mono text-xs">{r.operator_id.slice(0, 8)}…</td>
                    <td className="p-3 text-right tabular-nums">{fmt(r.open_drafts)}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(r.in_flight)}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(r.closed_today)}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(r.cancelled_today)}</td>
                  </tr>
                ))}
                {data && data.operator_workload.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No active operators.</td></tr>
                ) : null}
                {!data ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">Loading…</td></tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}