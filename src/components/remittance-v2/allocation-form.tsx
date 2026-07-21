import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { fmt } from "@/lib/exchange";

import { allocateBuySchema } from "@/lib/remittance-v2-allocation-schema";
import { remittanceV2AllocateBuy } from "@/lib/remittance-v2-allocation.functions";

/**
 * Phase 4F — Allocate remittance capacity against a buy transaction.
 * Visibility gated on workflow_state = 'allocating'. Server re-validates
 * state, currency match, and remaining capacity under lock on submit.
 */
export function AllocationForm({
  remittanceId,
  workflowState,
  transferCurrency,
  transferredAmount,
  defaultBuyId,
}: {
  remittanceId: string;
  workflowState: string;
  transferCurrency: string | null;
  transferredAmount: number | null;
  defaultBuyId: string | null;
}) {
  const qc = useQueryClient();
  const [buyId, setBuyId] = useState<string>(defaultBuyId ?? "");
  const [amount, setAmount] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>("");

  // Eligible buys: matching currency, not soft-deleted.
  const buys = useQuery({
    queryKey: ["remittance-v2", "eligible-buys", transferCurrency],
    enabled: !!transferCurrency && workflowState === "allocating",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buy_transactions")
        .select("id, doc_no, bought_currency, bought_amount, buy_rate, paid_currency")
        .eq("bought_currency", transferCurrency ?? "")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Already-allocated total (all remittances) per buy — informational only;
  // server recomputes under lock and is the sole authority for capacity.
  const usage = useQuery({
    queryKey: ["remittance-v2", "buy-usage", buyId],
    enabled: !!buyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_allocations")
        .select("allocated_amount, entry_kind, status, reversed_by_id")
        .eq("buy_id", buyId);
      if (error) throw error;
      let used = 0;
      for (const row of data ?? []) {
        const amt = Number(row.allocated_amount ?? 0) || 0;
        if (row.entry_kind === "normal" && !row.reversed_by_id && row.status !== "void") {
          used += amt;
        } else if (row.entry_kind === "reversal") {
          used -= amt;
        }
      }
      return used;
    },
  });

  const selectedBuy = useMemo(
    () => (buys.data ?? []).find((b: { id: string }) => b.id === buyId) ?? null,
    [buys.data, buyId],
  );
  const remainingOnBuy = useMemo(() => {
    if (!selectedBuy) return null;
    const total = Number(selectedBuy.bought_amount ?? 0);
    const used = usage.data ?? 0;
    return Math.max(0, total - used);
  }, [selectedBuy, usage.data]);

  const [clientRequestId, setClientRequestId] = useState<string>(() => crypto.randomUUID());

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = allocateBuySchema.parse({
        remittance_id: remittanceId,
        buy_id: buyId,
        amount,
        notes: notes.trim() || undefined,
      });
      await remittanceV2AllocateBuy(parsed, clientRequestId);
    },
    onSuccess: async () => {
      toast.success("Allocation recorded");
      setAmount(null);
      setNotes("");
      setClientRequestId(crypto.randomUUID());
      await qc.invalidateQueries({ queryKey: ["remittance-v2"] });
    },
    onError: (err: Error) => {
      toast.error(err?.message ?? "Failed to allocate");
    },
  });

  if (workflowState !== "allocating") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Allocate against a buy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Currency: <span className="font-mono">{transferCurrency ?? "—"}</span>
          {transferredAmount != null ? (
            <>
              {" "}
              · Required <span className="font-mono">{fmt(transferredAmount)}</span>
            </>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label>Buy</Label>
          <Select value={buyId} onValueChange={setBuyId}>
            <SelectTrigger>
              <SelectValue placeholder="Select buy" />
            </SelectTrigger>
            <SelectContent>
              {(buys.data ?? []).map(
                (b: {
                  id: string;
                  doc_no: string | null;
                  bought_amount: number | null;
                  bought_currency: string | null;
                  buy_rate: number | null;
                  paid_currency: string | null;
                }) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.doc_no ?? String(b.id).slice(0, 8)} · {fmt(b.bought_amount)}{" "}
                    {b.bought_currency} @ {fmt(b.buy_rate)} {b.paid_currency}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          {selectedBuy && remainingOnBuy != null ? (
            <div className="text-xs text-muted-foreground">
              Remaining on buy ≈ <span className="font-mono">{fmt(remainingOnBuy)}</span>{" "}
              {selectedBuy.bought_currency} (server re-checks under lock)
            </div>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label>Amount {transferCurrency ? `(${transferCurrency})` : ""}</Label>
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
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={mut.isPending || !buyId || !amount || amount <= 0}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Allocating…" : "Allocate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}