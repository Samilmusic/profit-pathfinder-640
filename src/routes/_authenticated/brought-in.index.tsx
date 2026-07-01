import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt, CURRENCIES } from "@/lib/exchange";
import { Plus } from "lucide-react";
import { RecordActions } from "@/components/record-actions";

export const Route = createFileRoute("/_authenticated/brought-in/")({ component: Page });

function Page() {
  const q = useQuery({
    queryKey: ["brought_in"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brought_in_money")
        .select("*, deposit_account:accounts!brought_in_money_deposit_account_id_fkey(name), final_account:accounts!brought_in_money_final_deposit_account_id_fkey(name)")
        .is("deleted_at", null).order("entry_date", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader
        title="Brought-In Money"
        description="Capital or funds brought in by Milad, Ali, customers, or others."
        actions={
          <Button asChild>
            <Link to="/brought-in/new"><Plus className="h-4 w-4 mr-1" /> Add brought-in</Link>
          </Button>
        }
      />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>By</TableHead><TableHead>Source</TableHead>
            <TableHead>Reason</TableHead><TableHead>Source acct</TableHead>
            <TableHead className="text-right">Original</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead className="text-right">Converted</TableHead>
            <TableHead>Final acct</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="capitalize">{r.brought_by}</TableCell>
                <TableCell>{r.source_name || "—"}</TableCell>
                <TableCell className="capitalize text-sm text-muted-foreground">{r.reason.replace("_", " ")}</TableCell>
                <TableCell>{r.deposit_account?.name}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.amount, r.currency)}</TableCell>
                <TableCell className="font-mono text-sm">{r.convert_enabled ? r.conversion_rate : "—"}</TableCell>
                <TableCell className="text-right font-mono">{r.convert_enabled ? fmt(r.converted_amount, r.converted_currency) : "—"}</TableCell>
                <TableCell>{r.convert_enabled ? r.final_account?.name : "—"}</TableCell>
                <TableCell className="text-right">
                  <RecordActions
                    table="brought_in_money"
                    row={r}
                    invalidateKeys={["brought_in"]}
                    fields={[
                      { key: "entry_date", label: "Date", type: "date" },
                      { key: "amount", label: "Amount", type: "number", step: "0.01" },
                      { key: "currency", label: "Currency", type: "select", options: CURRENCIES.map((c: string) => ({ value: c, label: c })) },
                      { key: "source_name", label: "Source name" },
                      { key: "notes", label: "Notes", type: "textarea" },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">Nothing brought in yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}