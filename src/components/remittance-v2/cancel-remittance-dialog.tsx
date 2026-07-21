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

import { cancelRemittanceSchema } from "@/lib/remittance-v2-allocation-schema";
import { remittanceV2Cancel } from "@/lib/remittance-v2-allocation.functions";

export function CancelRemittanceDialog({
  open,
  onOpenChange,
  remittanceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  remittanceId: string;
}) {
  const qc = useQueryClient();
  const [clientRequestId] = useState<string>(() => crypto.randomUUID());
  const [reason, setReason] = useState<string>("");

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = cancelRemittanceSchema.parse({
        remittance_id: remittanceId,
        reason,
      });
      await remittanceV2Cancel(parsed, clientRequestId);
    },
    onSuccess: async () => {
      toast.success("Remittance cancelled");
      await qc.invalidateQueries({ queryKey: ["remittance-v2"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err?.message ?? "Failed to cancel remittance");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel remittance</DialogTitle>
          <DialogDescription>
            Only draft remittances (no funds moved) can be cancelled in this phase. The
            server rejects cancellation for any other state.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Why is this draft being cancelled?"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep
          </Button>
          <Button
            variant="destructive"
            disabled={mut.isPending || !reason.trim()}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Cancelling…" : "Cancel remittance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}