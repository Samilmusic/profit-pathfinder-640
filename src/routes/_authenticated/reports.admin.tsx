import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert as UIAlert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  Bell,
  Database,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  History,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import {
  fetchSystemHealth,
  fetchReportingHealth,
  fetchSlowQueries,
  fetchBiInventory,
  fetchBusinessAlerts,
  fetchAlertHistory,
  dismissAlert,
  undismissAlert,
  buildCsv,
  downloadCsv,
  formatBytes,
  type Alert,
  type AlertLevel,
} from "@/lib/reports/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports/admin")({
  head: () => ({
    meta: [
      { title: "Administration — Reports" },
      { name: "description", content: "System health, business alerts, and BI registry." },
      { property: "og:title", content: "Administration — Reports" },
      { property: "og:description", content: "Read-only enterprise administration for reporting." },
    ],
  }),
  component: AdminReportPage,
});

function AdminReportPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Administration"
        description="Read-only enterprise administration for the reporting layer."
      />
      <UIAlert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Read-only</AlertTitle>
        <AlertDescription>
          This module does not alter the accounting engine. Dismissing an alert stores metadata
          only.
        </AlertDescription>
      </UIAlert>

      <Tabs defaultValue="health" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="health">
            <Gauge className="h-4 w-4 mr-1.5" />
            System
          </TabsTrigger>
          <TabsTrigger value="reporting">
            <Database className="h-4 w-4 mr-1.5" />
            Reporting
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <Bell className="h-4 w-4 mr-1.5" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="perf">
            <ServerCog className="h-4 w-4 mr-1.5" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="registry">
            <FileText className="h-4 w-4 mr-1.5" />
            Export Center
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <SystemHealthPanel />
        </TabsContent>
        <TabsContent value="reporting">
          <ReportingHealthPanel />
        </TabsContent>
        <TabsContent value="alerts">
          <AlertsPanel />
        </TabsContent>
        <TabsContent value="perf">
          <PerformancePanel />
        </TabsContent>
        <TabsContent value="registry">
          <ExportCenterPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────
function SystemHealthPanel() {
  const q = useQuery({
    queryKey: ["report_system_health"],
    queryFn: fetchSystemHealth,
    staleTime: 60_000,
  });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const flags = d.feature_flags ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <StatCard
        label="Database"
        value={d.db.database}
        subtitle={`Postgres ${d.db.server_version}`}
        icon={<Database className="h-4 w-4" />}
      />
      <StatCard label="DB size" value={formatBytes(d.db.size_bytes)} subtitle={d.db.timezone} />
      <StatCard
        label="Tables / Views"
        value={`${d.table_count} / ${d.view_count}`}
        subtitle={`${d.report_function_count} report functions`}
      />
      <StatCard
        label="Auth users"
        value={d.auth_users}
        subtitle={`${d.user_roles_count} role bindings`}
      />
      <StatCard
        label="Materialized views"
        value={d.matviews.length}
        subtitle={d.matviews.length ? d.matviews.map((m) => m.name).join(", ") : "none"}
      />
      <StatCard
        label="pg_stat_statements"
        value={d.pg_stat_statements_available ? "enabled" : "disabled"}
      />

      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Feature flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {flags.length === 0 && <div className="text-sm text-muted-foreground">No flags.</div>}
          {flags.map((f) => (
            <div key={f.key} className="flex items-center justify-between text-sm">
              <div>
                <div className="font-mono text-xs">{f.key}</div>
                <div className="text-xs text-muted-foreground">{f.description ?? ""}</div>
              </div>
              <Badge variant={f.enabled ? "default" : "outline"}>{f.enabled ? "ON" : "OFF"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Data quality</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <Row label="Total" value={d.data_quality.total} />
          <Row label="Valid" value={d.data_quality.valid} />
          <Row label="Suspicious" value={d.data_quality.suspicious} />
          <Row
            label="Invalid"
            value={d.data_quality.invalid}
            tone={d.data_quality.invalid > 0 ? "warning" : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Last reconciliation</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {d.last_reconciliation.run_at ? (
            <>
              Last logged {new Date(d.last_reconciliation.run_at).toLocaleString()} ·{" "}
              {d.last_reconciliation.row_count} entries
            </>
          ) : (
            <span className="text-muted-foreground">No reconciliation events logged yet.</span>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2 xl:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Extensions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {d.extensions.map((e) => (
            <Badge key={e.name} variant="outline" className="font-mono text-[11px]">
              {e.name} {e.version}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card className="md:col-span-2 xl:col-span-3">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Background jobs (pg_cron)</CardTitle>
          <Badge variant={d.pg_cron_available ? "default" : "outline"}>
            {d.pg_cron_available ? "available" : "unavailable"}
          </Badge>
        </CardHeader>
        <CardContent className="text-sm">
          {Array.isArray(d.background_jobs) && d.background_jobs.length > 0 ? (
            <pre className="text-xs overflow-auto max-h-40">
              {JSON.stringify(d.background_jobs, null, 2)}
            </pre>
          ) : (
            <span className="text-muted-foreground">No scheduled jobs.</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
function ReportingHealthPanel() {
  const q = useQuery({
    queryKey: ["report_reporting_health"],
    queryFn: fetchReportingHealth,
    staleTime: 60_000,
  });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const doExport = () => {
    const csv = buildCsv(
      ["source_table", "total", "valid", "suspicious", "invalid"],
      d.by_source.map((r) => [r.source_table, r.total, r.valid, r.suspicious, r.invalid]),
      d.meta,
      {
        quality_mode: "n/a",
        rows_included: d.summary.included_in_executive,
        rows_excluded: d.summary.excluded_in_executive,
      },
    );
    downloadCsv(`reporting_health_${Date.now()}.csv`, csv);
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Rows processed"
          value={d.summary.total}
          subtitle={`${d.summary.included_in_executive} included in Executive`}
        />
        <StatCard
          label="Rows excluded"
          value={d.summary.excluded_in_executive}
          subtitle="quality_mode=exclude_invalid"
          tone={d.summary.excluded_in_executive > 0 ? "warning" : undefined}
        />
        <StatCard label="Suspicious" value={d.summary.suspicious} />
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">By source</CardTitle>
          <Button size="sm" variant="outline" onClick={doExport}>
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            <div className="grid grid-cols-5 gap-2 font-medium text-xs text-muted-foreground border-b pb-1.5">
              <div>Source</div>
              <div className="text-right">Total</div>
              <div className="text-right">Valid</div>
              <div className="text-right">Suspicious</div>
              <div className="text-right">Invalid</div>
            </div>
            {d.by_source.map((r) => (
              <div
                key={r.source_table}
                className="grid grid-cols-5 gap-2 py-1 text-sm border-b last:border-b-0"
              >
                <div className="font-mono text-xs">{r.source_table}</div>
                <div className="text-right">{r.total}</div>
                <div className="text-right">{r.valid}</div>
                <div className="text-right">{r.suspicious}</div>
                <div className="text-right">{r.invalid}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Report query stats</CardTitle>
        </CardHeader>
        <CardContent>
          {d.pg_stat_statements_available ? (
            <SlowTable rows={d.report_query_stats} />
          ) : (
            <span className="text-sm text-muted-foreground">pg_stat_statements unavailable.</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
function AlertsPanel() {
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [levelFilter, setLevelFilter] = useState<AlertLevel | "all">("all");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["business_alerts", includeDismissed],
    queryFn: () => fetchBusinessAlerts(includeDismissed),
    staleTime: 30_000,
  });
  const hist = useQuery({
    queryKey: ["alert_history"],
    queryFn: () => fetchAlertHistory(200),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const rows = q.data?.alerts ?? [];
    return levelFilter === "all" ? rows : rows.filter((a) => a.level === levelFilter);
  }, [q.data, levelFilter]);

  async function onDismiss(a: Alert) {
    const reason = window.prompt(`Dismiss "${a.title}"? Enter reason (optional):`) ?? undefined;
    try {
      await dismissAlert(a.key, reason);
      toast.success("Alert dismissed");
      qc.invalidateQueries({ queryKey: ["business_alerts"] });
      qc.invalidateQueries({ queryKey: ["alert_history"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function onRestore(a: Alert) {
    try {
      await undismissAlert(a.key);
      toast.success("Alert restored");
      qc.invalidateQueries({ queryKey: ["business_alerts"] });
      qc.invalidateQueries({ queryKey: ["alert_history"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function doExport() {
    if (!q.data) return;
    const csv = buildCsv(
      ["key", "level", "category", "title", "message", "raised_at", "dismissed"],
      filtered.map((a) => [
        a.key,
        a.level,
        a.category,
        a.title,
        a.message,
        a.raised_at,
        a.dismissed ? "yes" : "no",
      ]),
      q.data.meta,
      { rows_included: filtered.length, rows_excluded: 0, quality_mode: "n/a" },
    );
    downloadCsv(`business_alerts_${Date.now()}.csv`, csv);
  }

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorBox error={q.error} />;

  const c = q.data!.counts;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <StatCard label="Total" value={c.total} icon={<Bell className="h-4 w-4" />} />
        <StatCard
          label="Critical"
          value={c.critical}
          tone={c.critical > 0 ? "critical" : undefined}
        />
        <StatCard label="Warning" value={c.warning} tone={c.warning > 0 ? "warning" : undefined} />
        <StatCard label="Info" value={c.info} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "critical", "warning", "info"] as const).map((l) => (
          <Button
            key={l}
            size="sm"
            variant={levelFilter === l ? "default" : "outline"}
            onClick={() => setLevelFilter(l)}
          >
            {l}
          </Button>
        ))}
        <Button
          size="sm"
          variant={includeDismissed ? "default" : "outline"}
          onClick={() => setIncludeDismissed((v) => !v)}
        >
          {includeDismissed ? "Hide dismissed" : "Show dismissed"}
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => q.refetch()}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={doExport}>
          <Download className="h-4 w-4 mr-1.5" />
          CSV
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground text-center">
            No alerts match the current filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <Card key={a.key} className={a.dismissed ? "opacity-60" : ""}>
              <CardContent className="py-3 flex flex-col sm:flex-row items-start gap-3">
                <div className={levelPillClass(a.level)}>{a.level}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.message}</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-1">{a.key}</div>
                  {a.dismissed && a.dismissed_meta?.reason && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Dismissed: {a.dismissed_meta.reason}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {a.dismissed ? (
                    <Button size="sm" variant="outline" onClick={() => onRestore(a)}>
                      <Undo2 className="h-4 w-4 mr-1.5" />
                      Restore
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => onDismiss(a)}>
                      Dismiss
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Dismiss history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hist.data && hist.data.rows.length > 0 ? (
            <div className="text-sm max-h-64 overflow-auto">
              {hist.data.rows.map((h) => (
                <div
                  key={h.id}
                  className="grid grid-cols-4 gap-2 py-1 border-b last:border-b-0 text-xs"
                >
                  <div className="col-span-2 font-mono truncate">{h.alert_key}</div>
                  <div>{new Date(h.dismissed_at).toLocaleString()}</div>
                  <div className="text-muted-foreground truncate">{h.reason ?? ""}</div>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No dismissals recorded.</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
function PerformancePanel() {
  const q = useQuery({
    queryKey: ["report_slow_queries", 25],
    queryFn: () => fetchSlowQueries(25),
    staleTime: 60_000,
  });
  const health = useQuery({
    queryKey: ["report_system_health"],
    queryFn: fetchSystemHealth,
    staleTime: 60_000,
  });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const idxCount = health.data?.report_function_count ?? 0;

  function doExport() {
    const csv = buildCsv(
      ["query", "calls", "total_ms", "mean_ms", "max_ms", "rows"],
      d.rows.map((r) => [r.query.slice(0, 500), r.calls, r.total_ms, r.mean_ms, r.max_ms, r.rows]),
      d.meta,
      { rows_included: d.rows.length, rows_excluded: 0 },
    );
    downloadCsv(`slow_queries_${Date.now()}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="pg_stat_statements"
          value={d.available ? "available" : "unavailable"}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard label="Report functions" value={idxCount} subtitle="server-side aggregation" />
        <StatCard label="Sampled queries" value={d.rows.length} />
      </div>
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Largest queries</CardTitle>
          <Button size="sm" variant="outline" onClick={doExport}>
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          <SlowTable rows={d.rows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Known limitations</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <div>· `pg_stat_statements` figures are cumulative from the last stats reset.</div>
          <div>· No materialized views yet — all reports read live views.</div>
          <div>· Executive rates never touch live market rates; only lot-basis rates are used.</div>
          <div>· Alerts are deterministic snapshots; no AI or automatic actions.</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
function ExportCenterPanel() {
  const q = useQuery({ queryKey: ["bi_inventory"], queryFn: fetchBiInventory, staleTime: 60_000 });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;

  function exportRegistry() {
    const csv = buildCsv(
      ["key", "route", "rpc", "version", "slice", "read_only"],
      d.reports.map((r) => [r.key, r.route, r.rpc, r.version, r.slice, String(r.read_only)]),
      d.meta,
      { rows_included: d.reports.length, rows_excluded: 0 },
    );
    downloadCsv(`bi_inventory_${Date.now()}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Export contract</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="text-muted-foreground">Every report supports:</div>
          <div className="flex flex-wrap gap-2">
            {d.export_formats.map((f) => (
              <Badge key={f} variant="outline">
                {f.toUpperCase()}
              </Badge>
            ))}
          </div>
          <div className="pt-2 text-muted-foreground">Metadata attached to every export:</div>
          <div className="flex flex-wrap gap-2">
            {d.metadata_fields.map((f) => (
              <Badge key={f} variant="outline" className="font-mono text-[10px]">
                {f}
              </Badge>
            ))}
          </div>
          <div className="pt-2 text-xs text-muted-foreground">
            PDF and Print use the browser print dialog on each report page; Excel is served as CSV
            that Excel opens natively.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">BI report registry (v{d.meta.report_version})</CardTitle>
          <Button size="sm" variant="outline" onClick={exportRegistry}>
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {d.reports.map((r) => {
              const isDynamic = r.route.includes("$");
              return (
                <div key={r.key} className="border rounded-md p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium capitalize">
                      {r.key.replaceAll("_", " ")}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate">
                      {r.rpc}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        v{r.version}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Slice {r.slice}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        read-only
                      </Badge>
                    </div>
                  </div>
                  {!isDynamic && (
                    <Link
                      to={r.route}
                      className="text-primary text-xs inline-flex items-center gap-1"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// Shared bits
function StatCard({
  label,
  value,
  subtitle,
  icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "warning" | "critical";
}) {
  const border =
    tone === "critical"
      ? "border-destructive/60"
      : tone === "warning"
        ? "border-yellow-500/50"
        : "";
  return (
    <Card className={border}>
      <CardHeader className="pb-1 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold">{value}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warning" }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          tone === "warning" ? "text-yellow-600 dark:text-yellow-400 font-medium" : "font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}

function SlowTable({
  rows,
}: {
  rows: {
    query: string;
    calls: number;
    total_ms: number;
    mean_ms: number;
    max_ms: number;
    rows: number;
  }[];
}) {
  if (!rows || rows.length === 0)
    return <div className="text-sm text-muted-foreground">No data collected.</div>;
  return (
    <div className="text-xs">
      <div className="grid grid-cols-12 gap-2 font-medium text-muted-foreground border-b pb-1.5">
        <div className="col-span-6">Query</div>
        <div className="text-right">Calls</div>
        <div className="text-right col-span-2">Total ms</div>
        <div className="text-right">Mean</div>
        <div className="text-right">Max</div>
        <div className="text-right">Rows</div>
      </div>
      {rows.slice(0, 25).map((r, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 py-1 border-b last:border-b-0">
          <div className="col-span-6 font-mono truncate" title={r.query}>
            {r.query}
          </div>
          <div className="text-right">{r.calls}</div>
          <div className="text-right col-span-2">{r.total_ms}</div>
          <div className="text-right">{r.mean_ms}</div>
          <div className="text-right">{r.max_ms}</div>
          <div className="text-right">{r.rows}</div>
        </div>
      ))}
    </div>
  );
}

function levelPillClass(l: AlertLevel) {
  const base = "text-[10px] uppercase font-medium rounded px-2 py-0.5 self-start";
  if (l === "critical") return `${base} bg-destructive/15 text-destructive`;
  if (l === "warning") return `${base} bg-yellow-500/15 text-yellow-700 dark:text-yellow-300`;
  return `${base} bg-muted text-muted-foreground`;
}

function ErrorBox({ error }: { error: unknown }) {
  return (
    <UIAlert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Failed to load</AlertTitle>
      <AlertDescription>{(error as Error)?.message ?? String(error)}</AlertDescription>
    </UIAlert>
  );
}
