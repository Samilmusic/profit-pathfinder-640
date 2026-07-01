import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, Building2 } from "lucide-react";
import { RecordActions } from "@/components/record-actions";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/customers")({ component: CustomersPage });

function CustomersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", account_details: "", notes: "" });
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const accountsQ = useQuery({
    queryKey: ["customer_bank_accounts", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_bank_accounts").select("*").is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const accountsByCustomer = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of accountsQ.data ?? []) {
      const arr = map.get(a.customer_id) ?? [];
      arr.push(a); map.set(a.customer_id, arr);
    }
    return map;
  }, [accountsQ.data]);

  const filtered = useMemo(() => {
    const list = q.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c: any) => {
      const inCore = [c.name, c.phone, c.account_details, c.notes].some((v) => v && String(v).toLowerCase().includes(s));
      if (inCore) return true;
      const accs = accountsByCustomer.get(c.id) ?? [];
      return accs.some((a: any) =>
        [a.bank_name, a.currency, a.iban, a.account_number, a.card_number, a.nickname, a.holder_name, a.swift_bic]
          .some((v) => v && String(v).toLowerCase().includes(s))
      );
    });
  }, [q.data, accountsByCustomer, search]);

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("customers").insert({ ...form, created_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Customer added"); qc.invalidateQueries({ queryKey: ["customers"] }); setOpen(false); setForm({ name: "", phone: "", account_details: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Customers"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New customer</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Account numbers / cards</Label><Textarea value={form.account_details} onChange={(e) => setForm({ ...form, account_details: e.target.value })} /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>Save</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, IBAN, account number, card, bank, currency…" className="pl-9" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((c: any) => {
          const accs = accountsByCustomer.get(c.id) ?? [];
          return (
            <Card key={c.id} className="hover:shadow-md transition">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to="/customers/$id" params={{ id: c.id }} className="font-semibold text-base hover:underline block truncate">{c.name}</Link>
                    <div className="text-xs text-muted-foreground">{c.phone || "No phone"}</div>
                  </div>
                  <RecordActions
                    table="customers"
                    row={c}
                    invalidateKeys={["customers"]}
                    fields={[
                      { key: "name", label: "Name" },
                      { key: "phone", label: "Phone" },
                      { key: "account_details", label: "Accounts", type: "textarea" },
                      { key: "notes", label: "Notes", type: "textarea" },
                    ]}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {accs.length === 0 && <span className="text-xs text-muted-foreground italic">No saved bank accounts</span>}
                  {accs.slice(0, 6).map((a: any) => (
                    <Badge key={a.id} variant={a.is_active ? "outline" : "secondary"} className="text-[11px] gap-1">
                      <Building2 className="h-3 w-3" />{a.nickname || a.bank_name} · {a.currency}
                    </Badge>
                  ))}
                  {accs.length > 6 && <Badge variant="outline" className="text-[11px]">+{accs.length - 6}</Badge>}
                </div>
                {c.notes && <div className="text-xs text-muted-foreground line-clamp-2">{c.notes}</div>}
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="col-span-full text-center py-10 text-muted-foreground text-sm">No customers match.</div>}
      </div>
    </>
  );
}