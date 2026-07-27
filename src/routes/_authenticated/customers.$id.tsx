import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Plus, Pencil, Star, StarOff, Power, FileDown, FileSpreadsheet, Printer,
  Upload, StickyNote, ArrowRightLeft, ExternalLink, Search, Landmark,
} from "lucide-react";
import { CustomerBankAccountForm } from "@/components/customer-bank-account-form";
import { CopyButton, CopyRow, CopyFullDetailsButton } from "@/components/copy-button";
import { useCustomerBankAccounts } from "@/components/customer-bank-account-picker";
import { DocumentsPanel } from "@/components/documents-panel";
import { CustomerNotes } from "@/components/customer/customer-notes";
import { useCustomer360, txnKindOptions, type Txn } from "@/lib/customer360";
import { fmt } from "@/lib/exchange";
import { docTypeLabel } from "@/lib/settlement";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers/$id")({ component: CustomerProfile });

function CustomerProfile() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [tab, setTab] = useState("overview");

  const { customer, core, notes, audit, transactions, stats } = useCustomer360(id);
  const accountsQ = useCustomerBankAccounts(id);
  const c = customer.data as any;

  const tags = useMemo(() => {
    const d = core.data;
    const t: string[] = [];
    if (!d) return t;
    if (d.remittances.length) t.push("Remittance client");
    if (d.sells.length) t.push("Buyer");
    if (d.buys.length) t.push("Supplier");
    if (d.accounts.length) t.push("Wallet holder");
    if (stats.openDeals > 0) t.push("Open deals");
    if ((accountsQ.data ?? []).length > 3) t.push("Multi-bank");
    return t;
  }, [core.data, stats.openDeals, accountsQ.data]);

  const lastActivity = stats.lastTxn?.date ?? (c?.updated_at ? String(c.updated_at).slice(0, 10) : null);

  const exportCsv = () => {
    const header = ["Date", "Type", "Code", "Description", "Currency", "In", "Out", "Rate", "Profit", "Status"];
    const rows = transactions.map((t) => [
      t.date, t.kindLabel, t.code, (t.description ?? "").replace(/"/g, "'"),
      t.currency ?? "", t.amountIn ?? "", t.amountOut ?? "", t.rate ?? "", t.profit ?? "", t.status ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v ?? "")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(c?.name ?? "customer").replace(/\s+/g, "-")}-statement.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Excel/CSV statement downloaded");
  };

  const toggleActive = async (a: any) => {
    const { error } = await supabase.from("customer_bank_accounts").update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success(a.is_active ? "Marked inactive" : "Reactivated");
    qc.invalidateQueries({ queryKey: ["customer_bank_accounts", id] });
  };
  const setDefault = async (a: any) => {
    const { error } = await supabase.from("customer_bank_accounts").update({ is_default: !a.is_default }).eq("id", a.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customer_bank_accounts", id] });
  };

  return (
    <>
      <PageHeader
        title={c?.name ?? "Customer"}
        description={[c?.phone, `Created ${c?.created_at ? String(c.created_at).slice(0, 10) : "—"}`, lastActivity ? `Last activity ${lastActivity}` : null].filter(Boolean).join(" · ")}
        actions={<Button asChild variant="ghost" size="sm"><Link to="/customers"><ArrowLeft className="h-4 w-4 mr-1" /> All customers</Link></Button>}
      />

      {/* Identity strip */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge variant={c?.deleted_at ? "secondary" : "default"}>{c?.deleted_at ? "Archived" : "Active"}</Badge>
        {c?.phone && <span className="text-sm text-muted-foreground flex items-center gap-1">{c.phone}<CopyButton value={c.phone} label="Phone copied" title="Copy phone" /></span>}
        {tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" onClick={() => navigate({ to: "/trades/new" })}><Plus className="h-4 w-4 mr-1" />New Trade</Button>
        <Button size="sm" variant="secondary" onClick={() => navigate({ to: "/buy" })}>New Buy</Button>
        <Button size="sm" variant="secondary" onClick={() => navigate({ to: "/sell" })}>New Sell</Button>
        <Button size="sm" variant="secondary" onClick={() => navigate({ to: "/remittances/new" })}><ArrowRightLeft className="h-4 w-4 mr-1" />New Remittance</Button>
        <Button size="sm" variant="outline" onClick={() => setTab("notes")}><StickyNote className="h-4 w-4 mr-1" />Add Note</Button>
        <Button size="sm" variant="outline" onClick={() => setTab("documents")}><Upload className="h-4 w-4 mr-1" />Upload Document</Button>
        <Button size="sm" variant="outline" onClick={() => setTab("transactions")}><Landmark className="h-4 w-4 mr-1" />Generate Statement</Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Export PDF</Button>
        <Button size="sm" variant="outline" onClick={exportCsv}><FileSpreadsheet className="h-4 w-4 mr-1" />Export Excel</Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-5">
        <Kpi label="Lifetime volume" lines={stats.volume.length ? stats.volume.map(([cc, v]) => fmt(v, cc)) : ["—"]} />
        <Kpi label="Current balance" lines={stats.balances.length ? stats.balances.map(([cc, v]) => fmt(v, cc)) : ["—"]} />
        <Kpi label="Open deals" lines={[String(stats.openDeals)]} />
        <Kpi label="Completed deals" lines={[String(stats.completedDeals)]} />
        <Kpi label="Pending settlements" lines={[String(stats.pendingSettlements)]} />
        <Kpi label="Last transaction" lines={[stats.lastTxn ? `${stats.lastTxn.date} · ${stats.lastTxn.kindLabel}` : "—"]} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle className="text-base">Personal info</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <RowCopy label="Name" value={c?.name} />
                <RowCopy label="Phone" value={c?.phone} />
                <Row label="Created" value={c?.created_at ? new Date(c.created_at).toLocaleDateString() : null} />
                <Row label="Last activity" value={lastActivity} />
                <Row label="Notes" value={c?.notes} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Bank accounts</CardTitle>
                <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Add account</Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(accountsQ.data ?? []).map((a: any) => (
                    <div key={a.id} className={`rounded-lg border p-3 space-y-2 ${a.is_active ? "" : "opacity-60"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{a.nickname || a.bank_name}</div>
                          <div className="text-xs text-muted-foreground">{a.bank_name} · {a.currency}{a.country ? ` · ${a.country}` : ""}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {a.is_default && <Badge className="text-[10px]">Default</Badge>}
                          {!a.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        </div>
                      </div>
                      <div className="rounded-md bg-muted/40 px-2">
                        <CopyRow label="Account holder" value={a.holder_name} mono={false} />
                        <CopyRow label="IBAN" value={a.iban} />
                        <CopyRow label="Account number" value={a.account_number} />
                        <CopyRow label="Card number" value={a.card_number} />
                        <CopyRow label="SWIFT / BIC" value={a.swift_bic} />
                        <CopyRow label="Sort code" value={a.sort_code} />
                        <CopyRow label="Phone" value={a.phone} mono={false} />
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        <CopyFullDetailsButton account={a} />
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setEditing(a); setFormOpen(true); }}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDefault(a)}>
                          {a.is_default ? <><StarOff className="h-3 w-3 mr-1" />Unset default</> : <><Star className="h-3 w-3 mr-1" />Set default</>}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggleActive(a)}><Power className="h-3 w-3 mr-1" />{a.is_active ? "Deactivate" : "Reactivate"}</Button>
                      </div>
                    </div>
                  ))}
                  {(accountsQ.data ?? []).length === 0 && <div className="text-sm text-muted-foreground col-span-full py-6 text-center">No bank accounts yet. Click <b>Add account</b> to save one.</div>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Wallet balances</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                {stats.balances.length === 0 && <div className="text-muted-foreground text-xs">No wallet activity</div>}
                {stats.balances.map(([cc, v]) => (
                  <div key={cc} className="flex justify-between border-b pb-1 last:border-0">
                    <span>{cc}</span>
                    <span className={`font-mono ${v < 0 ? "text-destructive" : ""}`}>{fmt(v, cc)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Profit contribution</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                {stats.profit.length === 0 && <div className="text-muted-foreground text-xs">No recorded profit</div>}
                {stats.profit.map(([cc, v]) => (
                  <div key={cc} className="flex justify-between border-b pb-1 last:border-0">
                    <span>{cc}</span><span className="font-mono">{fmt(v, cc)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Latest activity</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {transactions.slice(0, 8).map((t) => <TxnLine key={t.kind + t.id} t={t} />)}
                {transactions.length === 0 && <div className="text-muted-foreground text-center py-4">Nothing yet</div>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* DEALS */}
        <TabsContent value="deals" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Deals ({transactions.filter(isDeal).length})</CardTitle></CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="divide-y">
                {transactions.filter(isDeal).map((t) => (
                  <div key={t.kind + t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 sm:px-0 text-sm">
                    <div className="w-full sm:w-auto sm:min-w-[9rem] font-mono text-xs">{t.code}</div>
                    <div className="text-xs text-muted-foreground w-24">{t.date}</div>
                    <Badge variant="outline" className="text-[10px]">{t.kindLabel}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{t.status ?? "—"}</Badge>
                    <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400 break-all">In {t.amountIn != null ? fmt(t.amountIn, t.currencyIn ?? t.currency ?? undefined) : "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground break-all">Out {t.amountOut != null ? fmt(t.amountOut, t.currencyOut ?? t.currency ?? undefined) : "—"}</div>
                    <div className="font-mono text-xs">Rate {t.rate != null ? fmt(t.rate) : "—"}</div>
                    <div className="font-mono text-xs">P/L {t.profit != null ? fmt(t.profit) : "—"}</div>
                    <div className="ml-auto">
                      {t.href && <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs"><a href={t.href}>Open deal<ExternalLink className="h-3 w-3 ml-1" /></a></Button>}
                    </div>
                  </div>
                ))}
                {transactions.filter(isDeal).length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No deals for this customer yet.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TRANSACTIONS */}
        <TabsContent value="transactions" className="mt-4">
          <TransactionsTab transactions={transactions} onExport={exportCsv} />
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Customer documents (IDs, contracts)</CardTitle></CardHeader>
              <CardContent><DocumentsPanel refType="customer" refId={id} compact defaultDocType="id_passport" /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Deal attachments &amp; receipts</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {(core.data?.documents ?? []).map((d: any) => (
                  <button key={d.id} type="button" onClick={() => openDoc(d)} className="w-full text-left flex items-center gap-2 rounded border p-2 text-sm hover:bg-accent">
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{d.file_name}</div>
                      <div className="text-xs text-muted-foreground">{docTypeLabel(d.doc_type)} · {d.ref_type} · {new Date(d.created_at).toLocaleString()}</div>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </button>
                ))}
                {(core.data?.documents ?? []).length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No related documents.</div>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* NOTES */}
        <TabsContent value="notes" className="mt-4">
          <Card><CardContent className="pt-6"><CustomerNotes customerId={id} notes={notes.data ?? []} /></CardContent></Card>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Activity timeline</CardTitle></CardHeader>
            <CardContent>
              <TimelineFeed
                createdAt={c?.created_at}
                transactions={transactions}
                audit={audit.data ?? []}
                notes={notes.data ?? []}
                documents={core.data?.documents ?? []}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CustomerBankAccountForm open={formOpen} onOpenChange={setFormOpen} customerId={id} initial={editing} />
    </>
  );
}

const DEAL_KINDS = ["sell", "buy", "remittance"];
const isDeal = (t: Txn) => DEAL_KINDS.includes(t.kind);

async function openDoc(d: any) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 60);
  if (error || !data) { toast.error(error?.message ?? "Could not open document"); return; }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function TransactionsTab({ transactions, onExport }: { transactions: Txn[]; onExport: () => void }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [ccy, setCcy] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");

  const currencies = useMemo(
    () => [...new Set(transactions.flatMap((t) => [t.currency, t.currencyIn, t.currencyOut]).filter(Boolean))] as string[],
    [transactions],
  );
  const statuses = useMemo(() => [...new Set(transactions.map((t) => t.status).filter(Boolean))] as string[], [transactions]);

  const rows = useMemo(() => transactions.filter((t) => {
    if (kind !== "all" && t.kind !== kind) return false;
    if (ccy !== "all" && ![t.currency, t.currencyIn, t.currencyOut].includes(ccy)) return false;
    if (status !== "all" && t.status !== status) return false;
    if (from && (t.date ?? "") < from) return false;
    if (to && (t.date ?? "") > to) return false;
    const amt = Math.max(t.amountIn ?? 0, t.amountOut ?? 0);
    if (min && amt < Number(min)) return false;
    if (max && amt > Number(max)) return false;
    if (q) {
      const s = q.toLowerCase();
      if (![t.code, t.description, t.kindLabel, t.status, t.currency, t.currencyIn, t.currencyOut].some((v) => v && String(v).toLowerCase().includes(s))) return false;
    }
    return true;
  }), [transactions, kind, ccy, status, from, to, min, max, q]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Ledger ({rows.length})</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onExport}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search code, description, status…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {txnKindOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ccy} onValueChange={setCcy}>
            <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All currencies</SelectItem>
              {currencies.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input inputMode="decimal" placeholder="Min amount" value={min} onChange={(e) => setMin(e.target.value)} />
          <Input inputMode="decimal" placeholder="Max amount" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>

        <div className="divide-y">
          {rows.map((t) => <TxnRow key={t.kind + t.id} t={t} />)}
          {rows.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No transactions match these filters.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function TxnRow({ t }: { t: Txn }) {
  return (
    <div className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-xs text-muted-foreground w-24 shrink-0">{t.date}</span>
      <Badge variant="outline" className="text-[10px]">{t.kindLabel}</Badge>
      <span className="font-mono text-xs">{t.code}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.description}</span>
      {t.amountIn != null && <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 break-all">+{fmt(t.amountIn, (t.currencyIn ?? t.currency) ?? undefined)}</span>}
      {t.amountOut != null && <span className="font-mono text-xs text-destructive break-all">-{fmt(t.amountOut, (t.currencyOut ?? t.currency) ?? undefined)}</span>}
      {t.status && <Badge variant="secondary" className="text-[10px]">{t.status}</Badge>}
      <span className="flex gap-1">
        {t.href && <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs"><a href={t.href}>Deal</a></Button>}
        {t.accountId && <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs"><a href="/accounts">Account</a></Button>}
        {t.ledgerId && <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs"><a href="/statements">Ledger</a></Button>}
        {t.kind === "sell" && <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs"><a href="/inventory">Lots</a></Button>}
      </span>
    </div>
  );
}

function TxnLine({ t }: { t: Txn }) {
  return (
    <div className="flex justify-between items-center border-b py-1 last:border-0 gap-2">
      <span className="truncate"><Badge variant="outline" className="text-[10px] mr-2">{t.kindLabel}</Badge>{t.date}</span>
      <span className="font-mono shrink-0">{fmt(t.amountIn ?? t.amountOut ?? 0, (t.amountIn != null ? t.currencyIn : t.currencyOut) ?? t.currency ?? undefined)}</span>
    </div>
  );
}

function TimelineFeed({ createdAt, transactions, audit, notes, documents }: {
  createdAt?: string | null; transactions: Txn[]; audit: any[]; notes: any[]; documents: any[];
}) {
  const events = useMemo(() => {
    const list: { at: string; title: string; detail?: string }[] = [];
    if (createdAt) list.push({ at: createdAt, title: "Customer created" });
    for (const t of transactions) list.push({ at: t.date ?? "", title: `${t.kindLabel} · ${t.code}`, detail: t.description });
    for (const a of audit) list.push({ at: a.created_at, title: `${a.action} · ${a.entity_type}`, detail: a.reason ?? undefined });
    for (const n of notes) list.push({ at: n.created_at, title: "Note added", detail: n.body });
    for (const d of documents) list.push({ at: d.created_at, title: "Document uploaded", detail: d.file_name });
    return list.filter((e) => e.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 200);
  }, [createdAt, transactions, audit, notes, documents]);

  if (events.length === 0) return <div className="text-sm text-muted-foreground text-center py-8">No activity yet.</div>;

  return (
    <ol className="relative border-l pl-4 space-y-4">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
          <div className="text-sm font-medium">{e.title}</div>
          <div className="text-xs text-muted-foreground">{String(e.at).length > 10 ? new Date(e.at).toLocaleString() : e.at}</div>
          {e.detail && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.detail}</div>}
        </li>
      ))}
    </ol>
  );
}

function Kpi({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 space-y-0.5">
        {lines.slice(0, 3).map((l, i) => (
          <div key={i} title={l} className="font-mono text-xs sm:text-sm font-semibold leading-tight break-all">{l}</div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

function RowCopy({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="flex items-center gap-1 min-w-0">
        <span className="text-right truncate">{value || "—"}</span>
        {value && <CopyButton value={value} label={`${label} copied`} title={`Copy ${label}`} />}
      </span>
    </div>
  );
}
