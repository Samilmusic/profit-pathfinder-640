import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CURRENCIES } from "@/lib/exchange";
import { toast } from "sonner";

type Row = any;

export function CustomerBankAccountForm({
  open, onOpenChange, customerId, initial, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  initial?: Row | null;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<Row>(defaults());

  useEffect(() => {
    if (open) setF(initial ? { ...defaults(), ...initial } : defaults());
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        customer_id: customerId,
        nickname: f.nickname || null,
        bank_name: f.bank_name,
        currency: f.currency,
        country: f.country || null,
        holder_name: f.holder_name || null,
        iban: f.iban || null,
        account_number: f.account_number || null,
        card_number: f.card_number || null,
        swift_bic: f.swift_bic || null,
        sort_code: f.sort_code || null,
        phone: f.phone || null,
        notes: f.notes || null,
        is_active: !!f.is_active,
        is_default: !!f.is_default,
      };
      if (initial?.id) {
        const { data, error } = await supabase.from("customer_bank_accounts").update(payload).eq("id", initial.id).select("id").single();
        if (error) throw error; return data.id as string;
      } else {
        const { data, error } = await supabase.from("customer_bank_accounts").insert({ ...payload, created_by: u.user?.id }).select("id").single();
        if (error) throw error; return data.id as string;
      }
    },
    onSuccess: (id) => {
      toast.success("Bank account saved");
      qc.invalidateQueries({ queryKey: ["customer_bank_accounts"] });
      qc.invalidateQueries({ queryKey: ["customer_bank_accounts", customerId] });
      onSaved?.(id);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!customerId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial?.id ? "Edit bank account" : "Add bank account"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (!f.bank_name || !f.currency) return toast.error("Bank name and currency are required"); save.mutate(); }} className="grid md:grid-cols-2 gap-3">
          <Field label="Nickname"><Input value={f.nickname ?? ""} placeholder="e.g. ENBD Salary" onChange={(e) => setF({ ...f, nickname: e.target.value })} /></Field>
          <Field label="Bank / Provider *"><Input value={f.bank_name ?? ""} placeholder="ENBD, Mellat, Barclays, Wise…" onChange={(e) => setF({ ...f, bank_name: e.target.value })} required /></Field>
          <Field label="Currency *">
            <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
              <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Country"><Input value={f.country ?? ""} placeholder="AE, IR, GB…" onChange={(e) => setF({ ...f, country: e.target.value })} /></Field>
          <Field label="Account holder"><Input value={f.holder_name ?? ""} onChange={(e) => setF({ ...f, holder_name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="IBAN"><Input value={f.iban ?? ""} onChange={(e) => setF({ ...f, iban: e.target.value })} /></Field></div>
          <Field label="Account number"><Input value={f.account_number ?? ""} onChange={(e) => setF({ ...f, account_number: e.target.value })} /></Field>
          <Field label="Card number"><Input value={f.card_number ?? ""} onChange={(e) => setF({ ...f, card_number: e.target.value })} /></Field>
          <Field label="SWIFT / BIC"><Input value={f.swift_bic ?? ""} onChange={(e) => setF({ ...f, swift_bic: e.target.value })} /></Field>
          <Field label="Sort code"><Input value={f.sort_code ?? ""} onChange={(e) => setF({ ...f, sort_code: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="Notes"><Textarea value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
          <div className="flex items-center gap-2"><Switch checked={!!f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} /><Label className="text-sm">Active</Label></div>
          <div className="flex items-center gap-2"><Switch checked={!!f.is_default} onCheckedChange={(v) => setF({ ...f, is_default: v })} /><Label className="text-sm">Default for this currency</Label></div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{initial?.id ? "Save changes" : "Add account"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function defaults(): Row {
  return { nickname: "", bank_name: "", currency: "AED", country: "", holder_name: "", iban: "", account_number: "", card_number: "", swift_bic: "", sort_code: "", phone: "", notes: "", is_active: true, is_default: false };
}

export function maskAccount(v?: string | null) {
  if (!v) return "";
  const s = String(v).replace(/\s+/g, "");
  if (s.length <= 4) return s;
  return "•••• " + s.slice(-4);
}