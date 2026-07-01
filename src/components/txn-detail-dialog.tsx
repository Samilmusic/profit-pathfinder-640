import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SETTLEMENT_STATUSES, HOLDER_TYPES } from "@/lib/settlement";
import { DocumentsPanel, type RefType } from "@/components/documents-panel";
import { SettlementStatusBadge, SmartLabels } from "@/components/settlement-status-badge";
import { TxnTimeline } from "@/components/txn-timeline";
import { toast } from "sonner";

type Table = "buy_transactions" | "sell_transactions" | "expenses" | "transfers";

const REF_FOR_TABLE: Record<Table, RefType> = {
  buy_transactions: "buy",
  sell_transactions: "sell",
  expenses: "expense",
  transfers: "transfer",
};

export function TxnDetailDialog({
  open,
  onOpenChange,
  table,
  row,
  showHolders,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  table: Table;
  row: any | null;
  showHolders?: boolean;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("draft");
  const [note, setNote] = useState("");
  const [moneyHolder, setMoneyHolder] = useState<string>("");
  const [currencyHolder, setCurrencyHolder] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  useEffect(() => {
    if (row) {
      setStatus(row.settlement_status ?? "draft");
      setNote(row.completion_note ?? "");
      setMoneyHolder(row.money_holder_type ?? "");
      setCurrencyHolder(row.currency_holder_type ?? "");
      setDueDate(row.due_date ?? "");
    }
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const patch: any = { settlement_status: status, completion_note: note || null };
      if (showHolders) {
        patch.money_holder_type = moneyHolder || null;
        patch.currency_holder_type = currencyHolder || null;
        patch.due_date = dueDate || null;
      }
      const { error } = await supabase.from(table).update(patch).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!row) return null;
  const refType = REF_FOR_TABLE[table];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Manage settlement
            <SettlementStatusBadge value={status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <SmartLabels row={{ ...row, settlement_status: status }} />
          <TxnTimeline refType={refType} row={row} />
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Settlement status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SETTLEMENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {showHolders && (
              <div className="space-y-1.5">
                <Label className="text-xs">Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
            {showHolders && (
              <div className="space-y-1.5">
                <Label className="text-xs">Money currently held by</Label>
                <Select value={moneyHolder || "__none"} onValueChange={(v) => setMoneyHolder(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— none —</SelectItem>
                    {HOLDER_TYPES.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {showHolders && (
              <div className="space-y-1.5">
                <Label className="text-xs">Currency currently held by</Label>
                <Select value={currencyHolder || "__none"} onValueChange={(v) => setCurrencyHolder(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— none —</SelectItem>
                    {HOLDER_TYPES.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs">Final confirmation note (required to complete)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cash handed to customer, both sides confirmed on WhatsApp." />
            </div>
          </div>

          <DocumentsPanel refType={refType} refId={row.id} />

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Completion is blocked by the system unless the required documents and a confirmation note are attached.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}