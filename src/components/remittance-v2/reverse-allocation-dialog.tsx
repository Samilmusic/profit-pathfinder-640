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

import { reverseAllocationSchema } from "@/lib/remittance-v2-allocation-schema";
import { remittanceV2ReverseAllocation } from "@/lib/remittance-v2-allocation.functions";

export function ReverseAllocationDialog({
  open,
  onOpenChange,
  allocationId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allocationId: string;
}) {
  const qc = useQueryClient();
  const [clientRequestId] = useState<string>(() => crypto.randomUUID());
  const [reason, setReason] = useState<string>("");

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = reverseAllocationSchema.parse({
        allocation_id: allocationId,
        reason,
      });
      await remittanceV2ReverseAllocation(parsed, clientRequestId);
    },
    onSuccess: async () => {
      toast.success("Allocation reversed");
      await qc.invalidateQueries({ queryKey: ["remittance-v2"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err?.message ?? "Failed to reverse allocation");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse allocation</DialogTitle>
          <DialogDescription>
            Creates a reversal row negating this allocation. If the remittance was ready to
            close, it will drop back to allocating.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Why is this allocation being reversed?"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mut.isPending || !reason.trim()}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Reversing…" : "Reverse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}