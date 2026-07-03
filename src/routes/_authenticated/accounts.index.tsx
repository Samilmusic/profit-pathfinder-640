import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt } from "@/lib/exchange";
import { Plus } from "lucide-react";
import { RecordActions } from "@/components/record-actions";
import { EDIT_FIELDS } from "@/lib/edit-fields";

export const Route = createFileRoute("/_authenticated/accounts/")({ component: AccountsPage });

function AccountsPage() {
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [currency, setCurrency] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");

  const accountsQ = useQuery({
    queryKey: ["accounts_full", status],
    queryFn: async () => {
      let q = supabase.from("accounts").select("*").order("created_at", { ascending: false });
      if (status === "active") q = q.is("deleted_at", null).eq("is_active", true);
      else if (status === "archived") q = q.or("deleted_at.not.is.null,is_active.eq.false");
      const [a, b] = await Promise.all([
        q,
        supabase.from("account_balances").select("*"),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      const balMap = new Map(b.data.map((x: any) => [x.account_id, x.current_balance]));
      return a.data.map((row: any) => ({ ...row, current_balance: balMap.get(row.id) ?? row.opening_balance }));
    },
  });

  const rows = useMemo(() => {
    const all = accountsQ.data ?? [];
    return all.filter((a: any) =>
      (currency === "all" || a.currency === currency) &&
      (type === "all" || a.account_type === type) &&
      (owner === "all" || a.owner === owner),
    );
  }, [accountsQ.data, currency, type, owner]);

  const currencies = Array.from(new Set((accountsQ.data ?? []).map((a: any) => a.currency))).sort();
  const types = Array.from(new Set((accountsQ.data ?? []).map((a: any) => a.account_type))).sort();
  const owners = Array.from(new Set((accountsQ.data ?? []).map((a: any) => a.owner))).sort();

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Banks, cash boxes, and wallets. Balances update live from the ledger."
        actions={
          <Button asChild>
            <Link to="/accounts/new"><Plus className="h-4 w-4 mr-1" /> New account</Link>
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <FilterSelect label="Status" value={status} onChange={(v) => setStatus(v as any)}
          options={[{v:"active",l:"Active only"},{v:"archived",l:"Archived"},{v:"all",l:"All"}]} />
        <FilterSelect label="Currency" value={currency} onChange={setCurrency}
          options={[{v:"all",l:"All currencies"}, ...currencies.map((c: string) => ({v:c,l:c}))]} />
        <FilterSelect label="Type" value={type} onChange={setType}
          options={[{v:"all",l:"All types"}, ...types.map((c: string) => ({v:c,l:c.replace("_"," ")}))]} />
        <FilterSelect label="Owner" value={owner} onChange={setOwner}
          options={[{v:"all",l:"All owners"}, ...owners.map((c: string) => ({v:c,l:c}))]} />
      </div>
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="secondary">{a.account_type.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="capitalize">{a.owner}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{[a.bank_name, a.holder_name].filter(Boolean).join(" · ")}</TableCell>
                  <TableCell>
                    {a.deleted_at || !a.is_active
                      ? <Badge variant="outline" className="text-muted-foreground">Archived</Badge>
                      : <Badge variant="outline" className="border-emerald-200 text-emerald-700">Active</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmt(a.current_balance, a.currency)}</TableCell>
                  <TableCell className="text-right">
                    <RecordActions
                      table="accounts"
                      row={a}
                      invalidateKeys={["accounts", "accounts_full"]}
                      fields={EDIT_FIELDS.accounts}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No accounts match these filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[160px] capitalize"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v} className="capitalize">{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}