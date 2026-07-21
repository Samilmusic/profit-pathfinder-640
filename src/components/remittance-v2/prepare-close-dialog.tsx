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

import { prepareCloseSchema } from "@/lib/remittance-v2-allocation-schema";
import { remittanceV2PrepareClose } from "@/lib/remittance-v2-allocation.functions";

export function PrepareCloseDialog({
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
  const [note, setNote] = useState<string>("");

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = prepareCloseSchema.parse({
        remittance_id: remittanceId,
        note: note.trim() || undefined,
      });
      await remittanceV2PrepareClose(parsed, clientRequestId);
    },
    onSuccess: async () => {
      toast.success("Remittance prepared for close (frozen)");
      await qc.invalidateQueries({ queryKey: ["remittance-v2"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err?.message ?? "Failed to prepare close");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prepare close</DialogTitle>
          <DialogDescription>
            Freezes profit numbers on every active allocation and moves the remittance to
            "ready to close". This step is reversible via allocation reversal until finalize.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Note (optional)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Preparing…" : "Prepare close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}