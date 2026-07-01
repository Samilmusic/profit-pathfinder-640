import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "@/lib/exchange";
import { SettlementStatusBadge } from "@/components/settlement-status-badge";
import { TxnDetailDialog } from "@/components/txn-detail-dialog";
import { holderLabel } from "@/lib/settlement";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pending-settlements")({ component: Page });

function isPending(status: string | null | undefined) {
  return status !== "completed" && status !== "cancelled";
}

function Page() {
  const [detail, setDetail] = useState<{ table: any; row: any; showHolders?: boolean } | null>(null);

  const buys = useQuery({
    queryKey: ["pending_buys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buy_transactions").select("*").is("deleted_at", null).order("entry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const sells = useQuery({
    queryKey: ["pending_sells"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sell_transactions").select("*").is("deleted_at", null).order("entry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const expenses = useQuery({
    queryKey: ["pending_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").is("deleted_at", null).order("entry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const transfers = useQuery({
    queryKey: ["pending_transfers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transfers").select("*").is("deleted_at", null).order("entry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const docs = useQuery({
    queryKey: ["pending_docs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("ref_type,ref_id,doc_type");
      if (error) throw error;
      return data ?? [];
    },
  });
  const customers = useQuery({
    queryKey: ["customers_light"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name").is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const docIndex = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (docs.data ?? []).forEach((d: any) => {
      const k = `${d.ref_type}:${d.ref_id}`;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(d.doc_type);
    });
    return m;
  }, [docs.data]);
  const customerName = (id: string | null) => (customers.data ?? []).find((c: any) => c.id === id)?.name ?? "";

  const pendingBuys = (buys.data ?? []).filter((r: any) => isPending(r.settlement_status));
  const pendingSells = (sells.data ?? []).filter((r: any) => isPending(r.settlement_status));
  const pendingExpenses = (expenses.data ?? []).filter((r: any) => isPending(r.settlement_status));
  const pendingTransfers = (transfers.data ?? []).filter((r: any) => isPending(r.settlement_status));

  function txnMissing(refType: string, id: string): string[] {
    const set = docIndex.get(`${refType}:${id}`) ?? new Set();
    const missing: string[] = [];
    const money = ["payment_receipt", "bank_transfer_screenshot", "cash_delivery_receipt", "whatsapp_confirmation"];
    const delivery = ["currency_handover_proof", "cash_delivery_receipt", "bank_transfer_screenshot"];
    if (!money.some((d) => set.has(d))) missing.push("Payment proof");
    if (!delivery.some((d) => set.has(d))) missing.push("Delivery proof");
    return missing;
  }
  function expMissing(id: string): string[] {
    const set = docIndex.get(`expense:${id}`) ?? new Set();
    return ["expense_receipt", "payment_receipt", "bank_transfer_screenshot"].some((d) => set.has(d)) ? [] : ["Receipt"];
  }
  function trfMissing(id: string): string[] {
    const set = docIndex.get(`transfer:${id}`) ?? new Set();
    return ["bank_transfer_screenshot", "cash_delivery_receipt", "currency_handover_proof", "payment_receipt"].some((d) => set.has(d)) ? [] : ["Transfer proof"];
  }

  return (
    <>
      <PageHeader title="Pending Settlements" description="Every unfinished transaction, grouped by type. Nothing disappears until docs are attached and status is completed." />

      <Tabs defaultValue="buys">
        <TabsList>
          <TabsTrigger value="buys">Buys ({pendingBuys.length})</TabsTrigger>
          <TabsTrigger value="sells">Sells ({pendingSells.length})</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({pendingExpenses.length})</TabsTrigger>
          <TabsTrigger value="transfers">Transfers ({pendingTransfers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="buys">
          <Card><CardContent className="p-0 overflow-x-auto"><Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Counterparty</TableHead>
              <TableHead>Money w/</TableHead><TableHead>Currency w/</TableHead>
              <TableHead>Status</TableHead><TableHead>Missing</TableHead><TableHead>Due</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pendingBuys.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.entry_date}</TableCell>
                  <TableCell className="font-mono">{fmt(r.bought_amount, r.bought_currency)}</TableCell>
                  <TableCell>{customerName(r.customer_id) || r.counterparty || "—"}</TableCell>
                  <TableCell>{holderLabel(r.money_holder_type) || "—"}</TableCell>
                  <TableCell>{holderLabel(r.currency_holder_type) || "—"}</TableCell>
                  <TableCell><SettlementStatusBadge value={r.settlement_status} /></TableCell>
                  <TableCell className="text-xs text-destructive">{txnMissing("buy", r.id).join(", ") || "—"}</TableCell>
                  <TableCell>{r.due_date ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetail({ table: "buy_transactions", row: r, showHolders: true })}>
                      <FileText className="h-4 w-4 mr-1" /> Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {pendingBuys.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">All buys settled.</TableCell></TableRow>}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="sells">
          <Card><CardContent className="p-0 overflow-x-auto"><Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Sold</TableHead><TableHead>Received</TableHead><TableHead>Customer</TableHead>
              <TableHead>Money w/</TableHead><TableHead>Currency w/</TableHead>
              <TableHead>Status</TableHead><TableHead>Missing</TableHead><TableHead>Due</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pendingSells.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.entry_date}</TableCell>
                  <TableCell className="font-mono">{fmt(r.sold_amount, r.sold_currency)}</TableCell>
                  <TableCell className="font-mono">{fmt(r.received_amount, r.received_currency)}</TableCell>
                  <TableCell>{customerName(r.customer_id) || "—"}</TableCell>
                  <TableCell>{holderLabel(r.money_holder_type) || "—"}</TableCell>
                  <TableCell>{holderLabel(r.currency_holder_type) || "—"}</TableCell>
                  <TableCell><SettlementStatusBadge value={r.settlement_status} /></TableCell>
                  <TableCell className="text-xs text-destructive">{txnMissing("sell", r.id).join(", ") || "—"}</TableCell>
                  <TableCell>{r.due_date ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetail({ table: "sell_transactions", row: r, showHolders: true })}>
                      <FileText className="h-4 w-4 mr-1" /> Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {pendingSells.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">All sells settled.</TableCell></TableRow>}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card><CardContent className="p-0 overflow-x-auto"><Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>By</TableHead><TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead>Missing</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pendingExpenses.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.entry_date}</TableCell>
                  <TableCell className="capitalize">{r.paid_by}</TableCell>
                  <TableCell className="capitalize">{r.category?.replace("_", " ")}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.amount, r.currency)}</TableCell>
                  <TableCell><SettlementStatusBadge value={r.settlement_status} /></TableCell>
                  <TableCell className="text-xs text-destructive">{expMissing(r.id).join(", ") || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetail({ table: "expenses", row: r })}>
                      <FileText className="h-4 w-4 mr-1" /> Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {pendingExpenses.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">All expenses settled.</TableCell></TableRow>}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="transfers">
          <Card><CardContent className="p-0 overflow-x-auto"><Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>By</TableHead><TableHead>Reason</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead>Missing</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pendingTransfers.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.entry_date}</TableCell>
                  <TableCell className="capitalize">{r.requested_by}</TableCell>
                  <TableCell>{r.reason || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.amount, r.currency)}</TableCell>
                  <TableCell><SettlementStatusBadge value={r.settlement_status} /></TableCell>
                  <TableCell className="text-xs text-destructive">{trfMissing(r.id).join(", ") || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetail({ table: "transfers", row: r })}>
                      <FileText className="h-4 w-4 mr-1" /> Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {pendingTransfers.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">All transfers settled.</TableCell></TableRow>}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>
      </Tabs>

      <TxnDetailDialog
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        table={detail?.table}
        row={detail?.row ?? null}
        showHolders={detail?.showHolders}
      />
    </>
  );
}