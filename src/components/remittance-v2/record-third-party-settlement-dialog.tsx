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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { NumberInput } from "@/components/number-input";
import { useCustomers } from "@/components/account-select";

import { recordThirdPartySettlementSchema } from "@/lib/remittance-v2-settlement-schema";
import { remittanceV2RecordThirdPartySettlement } from "@/lib/remittance-v2-settlement.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  remittanceId: string;
  defaultThirdPartyCustomerId?: string | null;
  remainingAmount?: number | null;
  settlementCurrency?: string | null;
};

export function RecordThirdPartySettlementDialog({
  open,
  onOpenChange,
  remittanceId,
  defaultThirdPartyCustomerId,
  remainingAmount,
  settlementCurrency,
}: Props) {
  const qc = useQueryClient();
  const [clientRequestId] = useState<string>(() => crypto.randomUUID());
  const [thirdParty, setThirdParty] = useState<string>(defaultThirdPartyCustomerId ?? "");
  const [amount, setAmount] = useState<number | null>(remainingAmount ?? null);
  const [note, setNote] = useState<string>("");

  const customers = useCustomers();

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = recordThirdPartySettlementSchema.parse({
        remittance_id: remittanceId,
        third_party_customer_id: thirdParty,
        amount,
        note: note.trim() || undefined,
      });
      await remittanceV2RecordThirdPartySettlement(parsed, clientRequestId);
    },
    onSuccess: async () => {
      toast.success("Third-party settlement recorded");
      await qc.invalidateQueries({ queryKey: ["remittance-v2"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err?.message ?? "Failed to record third-party settlement");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Third-Party Settlement</DialogTitle>
          <DialogDescription>
            Record a payment the customer made directly to the designated third party.
            Partial amounts are supported; the server enforces the over-settlement guard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Paid to (third-party customer)</Label>
            <Select value={thirdParty} onValueChange={setThirdParty}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {(customers.data ?? []).map((c: { id: string; name: string }) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>
              Amount {settlementCurrency ? `(${settlementCurrency})` : ""}
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
            disabled={mut.isPending || !thirdParty || !amount || amount <= 0}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Recording…" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}