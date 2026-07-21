import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AccountSelect } from "@/components/account-select";
import { NumberInput } from "@/components/number-input";

import { recordSupplierDeliverySchema } from "@/lib/remittance-v2-settlement-schema";
import { remittanceV2RecordSupplierDelivery } from "@/lib/remittance-v2-settlement.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  remittanceId: string;
  buyId: string;
  deliveryCurrency?: string | null;
  remainingAmount?: number | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function RecordSupplierDeliveryDialog({
  open,
  onOpenChange,
  remittanceId,
  buyId,
  deliveryCurrency,
  remainingAmount,
}: Props) {
  const qc = useQueryClient();
  const [clientRequestId] = useState<string>(() => crypto.randomUUID());
  const [amount, setAmount] = useState<number | null>(remainingAmount ?? null);
  const [accountId, setAccountId] = useState<string>("");
  const [when, setWhen] = useState<string>(todayISO());
  const [note, setNote] = useState<string>("");

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = recordSupplierDeliverySchema.parse({
        remittance_id: remittanceId,
        buy_id: buyId,
        delivered_amount: amount,
        received_into_account_id: accountId,
        delivered_at: when,
        note: note.trim() || undefined,
      });
      await remittanceV2RecordSupplierDelivery(parsed, clientRequestId);
    },
    onSuccess: async () => {
      toast.success("Supplier delivery recorded");
      await qc.invalidateQueries({ queryKey: ["remittance-v2"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err?.message ?? "Failed to record supplier delivery");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Supplier Delivery</DialogTitle>
          <DialogDescription>
            Record currency physically delivered to us by the supplier. The workflow will
            advance automatically once cumulative delivered reaches the required amount —
            no manual "final" flag is required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>
              Delivered amount {deliveryCurrency ? `(${deliveryCurrency})` : ""}
              {remainingAmount != null ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  remaining ≈ {remainingAmount}
                </span>
              ) : null}
            </Label>
            <NumberInput
              value={amount ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setAmount(v === "" ? null : Number(v));
              }}
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1">
            <Label>Received into account</Label>
            <AccountSelect
              value={accountId}
              onChange={setAccountId}
              currency={deliveryCurrency ?? undefined}
            />
          </div>
          <div className="space-y-1">
            <Label>Delivery date</Label>
            <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={mut.isPending || !accountId || !amount || amount <= 0 || !when}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Recording…" : "Record delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}