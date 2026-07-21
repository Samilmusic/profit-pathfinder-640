import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Download, AlertTriangle, AlertOctagon, CheckCircle2 } from "lucide-react";
import {
  fetchDataQualitySummary,
  fetchDataQualityRows,
  type DataQualityRow,
  type DataQualitySummary,
  type QualityClass,
  type QualitySeverity,
} from "@/lib/reports/executive.functions";

export const Route = createFileRoute("/_authenticated/reports/data-quality")({
  head: () => ({
    meta: [
      { title: "Data Quality — Reports" },
      { name: "description", content: "Read-only classification of every financial row as valid, suspicious, or invalid. Historical data is never modified." },
    ],
  }),
  component: DataQualityPage,
});

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);

const classColor: Record<QualityClass, string> = {
  valid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  suspicious: "bg-amber-50 text-amber-800 border-amber-200",
  invalid: "bg-red-50 text-red-700 border-red-200",
};
const sevIcon = {
  info: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
  critical: <AlertOctagon className="h-3.5 w-3.5 text-red-600" />,
} as const;

function toCsv(rows: DataQualityRow[]) {
  const header = [
    "id",
    "source_table",
    "entry_date",
    "closed_at",
    "classification",
    "severity",
    "reason",
    "suggested_remediation",
    "details_json",
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) =>
    [
      r.id,
      r.source_table,
      r.entry_date ?? "",
      r.closed_at ?? "",
      r.classification,
      r.severity,
      r.reason ?? "",
      r.suggested_remediation ?? "",
      r.details,
    ].map(esc).join(","),
  );
  return [header.join(","), ...body].join("\n");
}

function KpiCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  const toneClass =
    tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-emerald-700" : "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function DataQualityPage() {
  const [classification, setClassification] = useState<QualityClass | "any">("any");
  const [severity, setSeverity] = useState<QualitySeverity | "any">("any");
  const [source, setSource] = useState<"sell_transactions" | "remittances" | "any">("any");

  const summaryQ = useQuery<DataQualitySummary>({
    queryKey: ["report_data_quality_summary"],
    queryFn: fetchDataQualitySummary,
    staleTime: 60_000,
  });

  const rowsQ = useQuery<DataQualityRow[]>({
    queryKey: ["v_data_quality", classification, severity, source],
    queryFn: () => fetchDataQualityRows({ classification, severity, source, limit: 1000 }),
    staleTime: 60_000,
  });

  const s = summaryQ.data;
  const rows = rowsQ.data ?? [];
  const impact = s?.executive_impact;

  const impactDelta = useMemo(() => {
    if (!impact) return null;
    const all = impact.total_amount_aed_all;
    const clean = impact.total_amount_aed_exclude_invalid;
    return all - clean; // AED removed when excluding invalid
  }, [impact]);

  const downloadCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data-quality-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Data Quality"
        description="Read-only classification of every financial row. No historical data is modified — filters are applied at report time only."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { summaryQ.refetch(); rowsQ.refetch(); }} disabled={summaryQ.isFetching || rowsQ.isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${summaryQ.isFetching || rowsQ.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
          </div>
        }
      />

      {s?.meta ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">v{s.meta.report_version}</Badge>
          <span>Generated {new Date(s.meta.generated_at).toLocaleString()}</span>
          <span>·</span>
          <span>Data cutoff {new Date(s.meta.data_cutoff).toLocaleString()}</span>
        </div>
      ) : null}

      {/* Class breakdown */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Valid" value={fmt(s?.by_class.valid)} tone="ok" />
        <KpiCard label="Suspicious" value={fmt(s?.by_class.suspicious)} tone="warn" />
        <KpiCard label="Invalid" value={fmt(s?.by_class.invalid)} tone="bad" />
      </div>

      {/* Severity breakdown */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Severity: info" value={fmt(s?.by_severity.info)} />
        <KpiCard label="Severity: warning" value={fmt(s?.by_severity.warning)} tone="warn" />
        <KpiCard label="Severity: critical" value={fmt(s?.by_severity.critical)} tone="bad" />
      </div>

      {/* Executive impact */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Executive-reporting impact (AED)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Include all</div>
            <div className="text-lg tabular-nums font-semibold">{fmt(impact?.total_amount_aed_all)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Exclude invalid</div>
            <div className="text-lg tabular-nums font-semibold text-amber-700">{fmt(impact?.total_amount_aed_exclude_invalid)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Exclude invalid + suspicious</div>
            <div className="text-lg tabular-nums font-semibold text-emerald-700">{fmt(impact?.total_amount_aed_exclude_suspicious)}</div>
          </div>
          {impactDelta !== null && impactDelta !== 0 ? (
            <div className="sm:col-span-3 text-xs text-muted-foreground">
              Filtering invalid rows removes <span className="tabular-nums font-medium text-red-600">{fmt(impactDelta)} AED</span> from
              the total — this is legacy data of dubious currency scale, not real earnings.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={classification} onValueChange={(v) => setClassification(v as QualityClass | "any")}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Classification" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any classification</SelectItem>
            <SelectItem value="valid">Valid</SelectItem>
            <SelectItem value="suspicious">Suspicious</SelectItem>
            <SelectItem value="invalid">Invalid</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={(v) => setSeverity(v as QualitySeverity | "any")}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any severity</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
          <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any source table</SelectItem>
            <SelectItem value="sell_transactions">sell_transactions</SelectItem>
            <SelectItem value="remittances">remittances</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-2">{rows.length} row{rows.length === 1 ? "" : "s"} shown (limit 1000)</div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left p-3">Class</th>
                <th className="text-left p-3">Sev</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Row id</th>
                <th className="text-left p-3">Closed at</th>
                <th className="text-left p-3">Reason</th>
                <th className="text-left p-3">Suggested remediation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.source_table}:${r.id}`} className="border-t align-top">
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${classColor[r.classification]}`}>
                      {r.classification}
                    </span>
                  </td>
                  <td className="p-3">{sevIcon[r.severity]}</td>
                  <td className="p-3 text-muted-foreground">{r.source_table}</td>
                  <td className="p-3 font-mono text-xs">{r.id.slice(0, 8)}…</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.closed_at ? new Date(r.closed_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3">{r.reason ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3 text-muted-foreground">{r.suggested_remediation ?? "—"}</td>
                </tr>
              ))}
              {rowsQ.isSuccess && rows.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">No rows match the current filters.</td></tr>
              ) : null}
              {rowsQ.isLoading ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">Loading…</td></tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <div><strong>Thresholds:</strong> profit magnitude &gt; 10,000,000 AED → suspicious; ≥ 1,000,000,000 AED → invalid. IRR-denominated rows with AED profit &gt; 10M are treated as scale errors (invalid).</div>
        <div>This report is read-only. Reclassifying a row requires correcting the underlying source data, not this view.</div>
      </div>
    </div>
  );
}