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
import { Textarea } from "@/components/ui/textarea";
import { AccountSelect } from "@/components/account-select";
import { NumberInput } from "@/components/number-input";

import { markFundsReceivedSchema } from "@/lib/remittance-v2-settlement-schema";
import { remittanceV2MarkFundsReceived } from "@/lib/remittance-v2-settlement.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  remittanceId: string;
  defaultAmount?: number | null;
  defaultCurrency?: string | null;
};

export function MarkFundsReceivedDialog({
  open,
  onOpenChange,
  remittanceId,
  defaultAmount,
  defaultCurrency,
}: Props) {
  const qc = useQueryClient();
  // Stable idempotency key per dialog mount.
  const [clientRequestId] = useState<string>(() => crypto.randomUUID());
  const [accountId, setAccountId] = useState<string>("");
  const [amount, setAmount] = useState<number | null>(defaultAmount ?? null);
  const [note, setNote] = useState<string>("");

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = markFundsReceivedSchema.parse({
        remittance_id: remittanceId,
        account_id: accountId,
        amount,
        note: note.trim() || undefined,
      });
      await remittanceV2MarkFundsReceived(parsed, clientRequestId);
    },
    onSuccess: async () => {
      toast.success("Funds received recorded");
      await qc.invalidateQueries({ queryKey: ["remittance-v2"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err?.message ?? "Failed to record funds received");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Funds Received</DialogTitle>
          <DialogDescription>
            Record that the customer paid the company. The server validates the workflow
            state and payment destination.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Received into account</Label>
            <AccountSelect
              value={accountId}
              onChange={setAccountId}
              currency={defaultCurrency ?? undefined}
            />
          </div>
          <div className="space-y-1">
            <Label>Amount {defaultCurrency ? `(${defaultCurrency})` : ""}</Label>
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
            disabled={mut.isPending || !accountId || !amount || amount <= 0}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Recording…" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}