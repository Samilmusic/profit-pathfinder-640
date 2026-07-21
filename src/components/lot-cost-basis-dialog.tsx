import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/exchange";
import { toast } from "sonner";

type Props = {
  lotId: string;
  lotCode: string | null;
  currency: string;
  trigger: React.ReactNode;
  mode?: "assign" | "capital";
};

export function LotCostBasisDialog({ lotId, lotCode, currency, trigger, mode = "assign" }: Props) {
  const [open, setOpen] = useState(false);
  const [costRate, setCostRate] = useState("");
  const [costCurrency, setCostCurrency] = useState<string>("IRR");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: async () => {
      if (mode === "capital") {
        const { error } = await (supabase as any).rpc("mark_lot_capital", { _lot_id: lotId, _reason: reason });
        if (error) throw error;
      } else {
        const rate = Number(costRate);
        if (!rate || rate <= 0) throw new Error("Cost rate must be positive");
        const { error } = await (supabase as any).rpc("assign_lot_cost_basis", {
          _lot_id: lotId, _cost_rate: rate, _cost_currency: costCurrency, _reason: reason,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(mode === "capital" ? "Lot marked as capital" : "Cost basis assigned");
      qc.invalidateQueries();
      setOpen(false); setCostRate(""); setReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "capital" ? "Mark as capital" : "Assign cost basis"} — {lotCode}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "assign" && (
            <>
              <div>
                <Label className="text-xs">Cost currency</Label>
                <Select value={costCurrency} onValueChange={setCostCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.filter(c => c !== currency).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Cost rate ({costCurrency} per 1 {currency})</Label>
                <NumberInput value={costRate} onChange={setCostRate} />
              </div>
            </>
          )}
          <div>
            <Label className="text-xs">Reason <span className="text-destructive">*</span></Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Cost recovered from original bank slip dated…" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => m.mutate()}
              disabled={m.isPending || !reason.trim() || (mode === "assign" && !Number(costRate))}
            >
              {mode === "capital" ? "Mark as capital" : "Assign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}