import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Plus, Search, Building2, Trash2, Star } from "lucide-react";
import { RecordActions } from "@/components/record-actions";
import { EDIT_FIELDS } from "@/lib/edit-fields";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ACCOUNT_TYPES, BANK_SUGGESTIONS } from "@/components/customer-bank-account-form";
import { CURRENCIES } from "@/lib/exchange";

export const Route = createFileRoute("/_authenticated/customers/")({ component: CustomersPage });

function CustomersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [drafts, setDrafts] = useState<any[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<any>(emptyDraft());
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
      const { data: cust, error } = await supabase
        .from("customers")
        .insert({ ...form, created_by: u.user?.id })
        .select("id")
        .single();
      if (error) throw error;
      if (drafts.length > 0) {
        const rows = drafts.map((d) => ({
          customer_id: cust.id,
          created_by: u.user?.id,
          account_type: d.account_type || null,
          nickname: d.nickname || null,
          bank_name: d.bank_name,
          currency: d.currency,
          country: d.country || null,
          holder_name: d.holder_name || null,
          iban: d.iban || null,
          account_number: d.account_number || null,
          card_number: d.card_number || null,
          swift_bic: d.swift_bic || null,
          phone: d.phone || null,
          notes: d.notes || null,
          is_active: true,
          is_default: !!d.is_default,
        }));
        const { error: e2 } = await supabase.from("customer_bank_accounts").insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("Customer added");
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer_bank_accounts"] });
      setOpen(false);
      setForm({ name: "", phone: "", notes: "" });
      setDrafts([]);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Customers"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New customer</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-5">
                <section className="space-y-3">
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Basic information</h3>
                  <div><Label className="text-xs">Customer name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Phone</Label><Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  </div>
                  <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Bank accounts</h3>
                    <span className="text-[11px] text-muted-foreground">{drafts.length} added</span>
                  </div>

                  <div className="rounded-md border divide-y">
                    {drafts.length === 0 && !draftOpen && (
                      <div className="p-4 text-sm text-muted-foreground text-center italic">No bank accounts added.</div>
                    )}
                    {drafts.map((d, i) => (
                      <div key={i} className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium truncate">
                            <Building2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{d.nickname || d.bank_name}</span>
                            {d.is_default && <Badge variant="secondary" className="text-[10px] gap-1"><Star className="h-3 w-3" />Default</Badge>}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {[d.account_type, d.bank_name, d.currency, d.iban || d.account_number || d.card_number].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => setDrafts(drafts.filter((_, ix) => ix !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    ))}

                    {draftOpen && (
                      <div className="p-3 bg-muted/30 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label className="text-xs">Account type *</Label>
                            <Select value={draft.account_type} onValueChange={(v) => setDraft({ ...draft, account_type: v })}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div><Label className="text-xs">Currency *</Label>
                            <Select value={draft.currency} onValueChange={(v) => setDraft({ ...draft, currency: v })}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div><Label className="text-xs">Bank *</Label>
                            <Input list="new-cust-banks" className="h-9" value={draft.bank_name} onChange={(e) => setDraft({ ...draft, bank_name: e.target.value })} placeholder="ENBD, Mellat…" />
                            <datalist id="new-cust-banks">{BANK_SUGGESTIONS.map((b) => <option key={b} value={b} />)}</datalist>
                          </div>
                          <div><Label className="text-xs">Account holder *</Label>
                            <Input className="h-9" value={draft.holder_name} onChange={(e) => setDraft({ ...draft, holder_name: e.target.value })} />
                          </div>
                          <div className="col-span-2"><Label className="text-xs">Nickname</Label>
                            <Input className="h-9" value={draft.nickname} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} placeholder="Main AED, Settlement…" />
                          </div>
                          <div className="col-span-2"><Label className="text-xs">IBAN</Label>
                            <Input className="h-9" value={draft.iban} onChange={(e) => setDraft({ ...draft, iban: e.target.value })} />
                          </div>
                          <div><Label className="text-xs">Account number</Label>
                            <Input className="h-9" value={draft.account_number} onChange={(e) => setDraft({ ...draft, account_number: e.target.value })} />
                          </div>
                          <div><Label className="text-xs">Card number</Label>
                            <Input className="h-9" value={draft.card_number} onChange={(e) => setDraft({ ...draft, card_number: e.target.value })} />
                          </div>
                          <div><Label className="text-xs">SWIFT / BIC</Label>
                            <Input className="h-9" value={draft.swift_bic} onChange={(e) => setDraft({ ...draft, swift_bic: e.target.value })} />
                          </div>
                          <div><Label className="text-xs">Country</Label>
                            <Input className="h-9" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} placeholder="AE, IR, GB…" />
                          </div>
                          <div className="col-span-2"><Label className="text-xs">Notes</Label>
                            <Input className="h-9" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                          </div>
                          <label className="col-span-2 flex items-center gap-2 text-sm">
                            <Switch checked={!!draft.is_default} onCheckedChange={(v) => setDraft({ ...draft, is_default: v })} />
                            Default account for this currency
                          </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button type="button" variant="ghost" size="sm" onClick={() => { setDraftOpen(false); setDraft(emptyDraft()); }}>Cancel</Button>
                          <Button type="button" size="sm" onClick={() => {
                            if (!draft.account_type || !draft.bank_name || !draft.currency || !draft.holder_name) { toast.error("Type, bank, currency and holder are required"); return; }
                            setDrafts([...drafts, draft]);
                            setDraft(emptyDraft());
                            setDraftOpen(false);
                          }}>Save account</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {!draftOpen && (
                    <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setDraftOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Add bank account
                    </Button>
                  )}
                </section>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending}>Save customer</Button>
                </div>
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
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <span>{c.phone || "No phone"}</span>
                      {c.phone && <CopyButton value={c.phone} label="Phone copied" title="Copy phone" className="h-5 w-5" />}
                      {c.name && <CopyButton value={c.name} label="Name copied" title="Copy name" className="h-5 w-5" />}
                    </div>
                  </div>
                  <RecordActions
                    table="customers"
                    row={c}
                    invalidateKeys={["customers"]}
                    fields={EDIT_FIELDS.customers}
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

function emptyDraft() {
  return { account_type: "", nickname: "", bank_name: "", currency: "AED", country: "", holder_name: "", iban: "", account_number: "", card_number: "", swift_bic: "", phone: "", notes: "", is_default: false };
}