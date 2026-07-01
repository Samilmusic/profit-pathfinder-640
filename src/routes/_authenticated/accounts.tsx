import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ACCOUNT_TYPES, CURRENCIES, OWNERS, fmt } from "@/lib/exchange";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { RecordActions } from "@/components/record-actions";

export const Route = createFileRoute("/_authenticated/accounts")({ component: AccountsPage });

function AccountsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const accountsQ = useQuery({
    queryKey: ["accounts_full"],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase.from("accounts").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("account_balances").select("*"),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      const balMap = new Map(b.data.map((x: any) => [x.account_id, x.current_balance]));
      return a.data.map((row: any) => ({ ...row, current_balance: balMap.get(row.id) ?? row.opening_balance }));
    },
  });

  const [form, setForm] = useState({
    name: "", account_type: "toman_bank", currency: "IRR", bank_name: "", holder_name: "",
    account_number: "", iban: "", card_number: "", owner: "shared", opening_balance: "0", notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("accounts").insert({
        ...form,
        account_type: form.account_type as any,
        owner: form.owner as any,
        opening_balance: Number(form.opening_balance) || 0,
        created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account created");
      qc.invalidateQueries();
      setOpen(false);
      setForm({ ...form, name: "", opening_balance: "0", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Banks, cash boxes, and wallets. Balances update live from the ledger."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New account</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New account</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid md:grid-cols-2 gap-3">
                <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
                <Field label="Type">
                  <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Currency">
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Owner">
                  <Select value={form.owner} onValueChange={(v) => setForm({ ...form, owner: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Bank name"><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></Field>
                <Field label="Holder name"><Input value={form.holder_name} onChange={(e) => setForm({ ...form, holder_name: e.target.value })} /></Field>
                <Field label="Account number"><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></Field>
                <Field label="IBAN"><Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} /></Field>
                <Field label="Card number"><Input value={form.card_number} onChange={(e) => setForm({ ...form, card_number: e.target.value })} /></Field>
                <Field label="Opening balance"><Input type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></Field>
                <div className="md:col-span-2">
                  <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                </div>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending}>Save</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Bank / Holder</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accountsQ.data ?? []).map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="secondary">{a.account_type.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="capitalize">{a.owner}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{[a.bank_name, a.holder_name].filter(Boolean).join(" · ")}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(a.current_balance, a.currency)}</TableCell>
                  <TableCell className="text-right">
                    <RecordActions
                      table="accounts"
                      row={a}
                      invalidateKeys={["accounts"]}
                      fields={[
                        { key: "name", label: "Name" },
                        { key: "bank_name", label: "Bank" },
                        { key: "holder_name", label: "Holder" },
                        { key: "notes", label: "Notes", type: "textarea" },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {accountsQ.data && accountsQ.data.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No accounts yet. Add your first one.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}