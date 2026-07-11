import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAccounts } from "@/components/account-select";
import { fmt } from "@/lib/exchange";

export const Route = createFileRoute("/_authenticated/statements")({ component: Page });

function Page() {
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState<string>("");

  const q = useQuery({
    queryKey: ["ledger", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ledger_entries").select("*").eq("account_id", accountId).order("entry_date", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    let bal = 0;
    return (q.data ?? []).map((e: any) => {
      const debit = Number(e.debit || 0);
      const credit = Number(e.credit || 0);
      bal += debit - credit;
      return { ...e, debit, credit, running: bal };
    });
  }, [q.data]);

  const acct = (accounts.data ?? []).find((a) => a.id === accountId);

  return (
    <>
      <PageHeader title="Statements" description="Full ledger for any account, per double-entry accounting." />
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="max-w-md">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Pick an account" /></SelectTrigger>
              <SelectContent>
                {(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {a.currency}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Source</TableHead><TableHead className="text-right">In</TableHead><TableHead className="text-right">Out</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="text-sm">{r.description || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">{r.source_type?.replace("_", " ")}</TableCell>
                <TableCell className="text-right font-mono text-accent">{r.debit ? fmt(r.debit, acct?.currency ?? undefined) : ""}</TableCell>
                <TableCell className="text-right font-mono text-destructive">{r.credit ? fmt(r.credit, acct?.currency ?? undefined) : ""}</TableCell>
                <TableCell className="text-right font-mono font-medium">{fmt(r.running, acct?.currency ?? undefined)}</TableCell>
              </TableRow>
            ))}
            {accountId && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No ledger entries.</TableCell></TableRow>}
            {!accountId && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Select an account to view its statement.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}