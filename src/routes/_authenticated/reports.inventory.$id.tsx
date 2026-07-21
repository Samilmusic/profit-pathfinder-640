import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { ArrowLeft, Package } from "lucide-react";
import { fetchInventoryLotDetail } from "@/lib/reports/inventory.functions";

export const Route = createFileRoute("/_authenticated/reports/inventory/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Inventory Lot ${params.id.slice(0, 8)} — Reports` },
      { name: "description", content: "Lot-level FIFO details: consumption timeline, allocations, related sells and remittances." },
    ],
  }),
  component: LotDetail,
});

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(Number(n));

function LotDetail() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["report", "inventory_lot_detail", id],
    queryFn: () => fetchInventoryLotDetail(id),
  });

  const lot = q.data?.lot ?? null;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/reports/inventory"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
      </div>
      <PageHeader
        title={lot ? `Lot ${String(lot.lot_code)}` : `Lot ${id.slice(0,8)}`}
        description="Server-authoritative FIFO detail: cost basis, consumption, allocations, and related documents."
      />

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !lot ? (
        <div className="text-sm text-muted-foreground">Lot not found.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Currency</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{String(lot.currency)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Status</CardTitle></CardHeader><CardContent><Badge variant={lot.status === "available" ? "default" : lot.status === "partial" ? "secondary" : "outline"} className="text-base">{String(lot.status)}</Badge></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Age</CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{fmt(lot.age_days, 1)}d</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Remaining Cost</CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{fmt(lot.remaining_cost)}<span className="text-xs text-muted-foreground ml-1">{String(lot.cost_basis_currency ?? "")}</span></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Lot Details</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <div><span className="text-muted-foreground">Account: </span>{String(lot.account_name ?? "—")} <span className="text-xs text-muted-foreground">({String(lot.account_owner ?? "—")})</span></div>
              <div><span className="text-muted-foreground">Entry Date: </span>{String(lot.entry_date)}</div>
              <div><span className="text-muted-foreground">Original: </span><span className="tabular-nums">{fmt(lot.original_amount)}</span></div>
              <div><span className="text-muted-foreground">Consumed: </span><span className="tabular-nums">{fmt(lot.consumed_amount)}</span></div>
              <div><span className="text-muted-foreground">Remaining: </span><span className="tabular-nums">{fmt(lot.remaining_amount)}</span></div>
              <div><span className="text-muted-foreground">Cost Rate: </span><span className="tabular-nums">{fmt(lot.cost_basis_rate, 6)}</span> {String(lot.cost_basis_currency ?? "")}</div>
              <div><span className="text-muted-foreground">Original Cost: </span><span className="tabular-nums">{fmt(lot.original_cost)}</span></div>
              <div><span className="text-muted-foreground">Source: </span>{String(lot.source_ref_type ?? "—")}</div>
              <div className="sm:col-span-2 text-muted-foreground">{String(lot.source_description ?? "")}</div>
              <div><span className="text-muted-foreground">Operator: </span>{String(lot.operator_label ?? "—")}</div>
              <div><span className="text-muted-foreground">Created: </span>{new Date(String(lot.created_at)).toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Consumption Timeline</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {q.data && q.data.consumption.length > 0 ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>When</TableHead><TableHead>Entry Date</TableHead>
                    <TableHead>Ref</TableHead><TableHead>Currency</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Cost Rate</TableHead>
                    <TableHead className="text-right">Cost Amount</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {q.data.consumption.map((c) => (
                      <TableRow key={c.consumption_id}>
                        <TableCell className="text-xs">{new Date(c.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{c.entry_date}</TableCell>
                        <TableCell className="text-xs font-mono">{c.sell_ref_type}:{c.sell_ref_id.slice(0,8)}</TableCell>
                        <TableCell>{c.currency}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.cost_rate, 6)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.cost_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <div className="text-sm text-muted-foreground">No consumption yet.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Remittance Allocations</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {q.data && q.data.allocations.length > 0 ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Remittance</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {q.data.allocations.map((a) => (
                      <TableRow key={a.allocation_id}>
                        <TableCell className="text-xs">{new Date(a.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-xs font-mono">{a.remittance_id.slice(0,8)}</TableCell>
                        <TableCell>{a.currency}</TableCell>
                        <TableCell><Badge variant="outline">{a.entry_kind}</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{a.status}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(a.allocated_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <div className="text-sm text-muted-foreground">No allocations.</div>}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Related Sells</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {q.data && q.data.related_sells.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Doc</TableHead><TableHead>Date</TableHead>
                      <TableHead>Sold</TableHead><TableHead>Received</TableHead>
                      <TableHead className="text-right">Profit AED</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {q.data.related_sells.map((s) => (
                        <TableRow key={s.sell_id}>
                          <TableCell className="text-xs font-mono">{s.doc_no ?? s.sell_id.slice(0,8)}</TableCell>
                          <TableCell className="text-xs">{s.entry_date}</TableCell>
                          <TableCell className="text-xs tabular-nums">{fmt(s.sold_amount)} {s.sold_currency}</TableCell>
                          <TableCell className="text-xs tabular-nums">{fmt(s.received_amount)} {s.received_currency}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(s.net_profit_aed)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <div className="text-sm text-muted-foreground">None.</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Related Remittances</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {q.data && q.data.related_remittances.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Doc</TableHead><TableHead>Date</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>State</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {q.data.related_remittances.map((r) => (
                        <TableRow key={r.remittance_id}>
                          <TableCell className="text-xs font-mono">{r.doc_no ?? r.remittance_id.slice(0,8)}</TableCell>
                          <TableCell className="text-xs">{r.entry_date}</TableCell>
                          <TableCell>{r.transfer_currency ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(r.transferred_amount)}</TableCell>
                          <TableCell><Badge variant="outline">{r.workflow_state ?? "—"}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <div className="text-sm text-muted-foreground">None.</div>}
              </CardContent>
            </Card>
          </div>

          <div className="text-xs text-muted-foreground">
            Report v{q.data?.meta.report_version ?? "—"} · generated {q.data?.meta.generated_at ? new Date(q.data.meta.generated_at).toLocaleString() : "—"}
          </div>
        </>
      )}
    </div>
  );
}