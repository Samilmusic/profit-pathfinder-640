import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Download, ArrowLeft } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import {
  fetchSupplierDetail,
  buildCsvMetaHeader,
  downloadCsv,
  formatDurationSeconds,
  type SupplierDetailResponse,
} from "@/lib/reports/counterparties.functions";
import type { QualityMode } from "@/lib/reports/executive.functions";

export const Route = createFileRoute("/_authenticated/reports/suppliers/$id")({
  head: () => ({
    meta: [
      { title: "Supplier Analytics — Reports" },
      { name: "description", content: "Historical supplier profile: delivery, profit, outstanding, reliability." },
    ],
  }),
  component: SupplierDetailPage,
});

const AED = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

function KpiCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function SupplierDetailPage() {
  const { id } = Route.useParams();
  const [mode, setMode] = useState<QualityMode>("exclude_invalid");

  const q = useQuery<SupplierDetailResponse>({
    queryKey: ["report_supplier_detail", id, mode],
    queryFn: () => fetchSupplierDetail(id, mode),
    staleTime: 60_000,
  });

  const d = q.data;
  const totals = d?.totals;
  const monthly = d?.monthly ?? [];

  const exportMonthly = () => {
    if (!d) return;
    const head = buildCsvMetaHeader(d);
    const cols = ["bucket", "profit_aed", "volume_aed", "events"];
    const rows = monthly.map((m) => [m.bucket, m.profit_aed, m.volume_aed, m.events].join(","));
    downloadCsv(`supplier_${id}_monthly.csv`, [...head, cols.join(","), ...rows]);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/reports/counterparties">
          <Button size="sm" variant="ghost"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        </Link>
        <PageHeader
          title={d?.supplier?.name ?? "Supplier"}
          description={d?.supplier?.phone ?? "Historical analytics"}
        />
        <div className="ml-auto flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Quality</label>
            <Select value={mode} onValueChange={(v) => setMode(v as QualityMode)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="exclude_invalid">Exclude invalid</SelectItem>
                <SelectItem value="exclude_suspicious">Only valid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
        <Badge variant="outline" className="uppercase tracking-wide">{mode.replace("_", " ")}</Badge>
        <span>Rows included <span className="tabular-nums font-medium text-foreground">{d?.rows_included ?? "—"}</span></span>
        <span>·</span>
        <span>Rows excluded <span className="tabular-nums font-medium text-foreground">{d?.rows_excluded ?? "—"}</span></span>
        {d?.meta?.data_cutoff ? <span>· Data cutoff {new Date(d.meta.data_cutoff).toLocaleString()}</span> : null}
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiCard label="Delivered Profit (AED)" value={AED(totals?.profit_total_aed)} />
        <KpiCard label="Delivered Volume (AED)" value={AED(totals?.volume_total_aed)} />
        <KpiCard label="Deliveries" value={totals?.event_count ?? "—"} sub={`Avg ${AED(totals?.avg_profit_aed)} / delivery`} />
        <KpiCard label="Outstanding" value={(d?.outstanding ?? []).length} sub={`${(d?.completed ?? []).length} completed shown`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Monthly delivery</CardTitle>
          <Button variant="outline" size="sm" onClick={exportMonthly} disabled={!d}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="profit_aed" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="volume_aed" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Outstanding</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doc</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d?.outstanding ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-mono">{r.doc_no ?? r.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">{new Date(r.entry_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{AED(r.transferred_amount)} {r.transfer_currency}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{r.workflow_state}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {(d?.outstanding.length ?? 0) === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nothing outstanding.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Completed</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doc</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Settle</TableHead>
                    <TableHead className="text-right">Close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d?.completed ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-mono">{r.doc_no ?? r.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">{new Date(r.entry_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{AED(r.transferred_amount)} {r.transfer_currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{AED(r.total_profit_aed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatDurationSeconds(r.settle_seconds)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatDurationSeconds(r.close_seconds)}</TableCell>
                    </TableRow>
                  ))}
                  {(d?.completed.length ?? 0) === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No completed deliveries.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}