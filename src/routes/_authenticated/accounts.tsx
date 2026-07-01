import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/exchange";
import { Plus } from "lucide-react";
import { RecordActions } from "@/components/record-actions";

export const Route = createFileRoute("/_authenticated/accounts")({ component: AccountsPage });

function AccountsPage() {
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

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Banks, cash boxes, and wallets. Balances update live from the ledger."
        actions={
          <Link to="/accounts/new">
            <Button><Plus className="h-4 w-4 mr-1" /> New account</Button>
          </Link>
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