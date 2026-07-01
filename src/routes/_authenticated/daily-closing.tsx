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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "@/lib/exchange";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/daily-closing")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [actuals, setActuals] = useState<Record<string, string>>({});

  const bal = useQuery({
    queryKey: ["account_balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const closings = useQuery({
    queryKey: ["daily_closings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_closings").select("*").order("closing_date", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const close = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const account_snapshots = (bal.data ?? []).map((b: any) => ({
        account_id: b.account_id, name: b.name, currency: b.currency,
        expected: Number(b.current_balance), actual: Number(actuals[b.account_id] ?? b.current_balance),
      }));
      const { error } = await supabase.from("daily_closings").insert({
        closing_date: date, account_snapshots, notes, closed_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Day closed"); qc.invalidateQueries({ queryKey: ["daily_closings"] }); setNotes(""); setActuals({}); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Daily Closing"
        description="Reconcile counted balances vs system balances at end of day."
        actions={<Button onClick={() => close.mutate()} disabled={close.isPending}>Close day</Button>}
      />
      <Card className="mb-4"><CardContent className="p-4 grid md:grid-cols-2 gap-3">
        <div><Label>Closing date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </CardContent></Card>

      <Card className="mb-6"><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Expected</TableHead><TableHead className="text-right">Actual counted</TableHead><TableHead className="text-right">Difference</TableHead></TableRow></TableHeader>
          <TableBody>
            {(bal.data ?? []).map((b: any) => {
              const actual = actuals[b.account_id] !== undefined ? Number(actuals[b.account_id]) : Number(b.current_balance);
              const diff = actual - Number(b.current_balance);
              return (
                <TableRow key={b.account_id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.currency}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(b.current_balance, b.currency)}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" step="0.01" className="w-40 ml-auto font-mono text-right"
                      value={actuals[b.account_id] ?? String(b.current_balance)}
                      onChange={(e) => setActuals({ ...actuals, [b.account_id]: e.target.value })} />
                  </TableCell>
                  <TableCell className={"text-right font-mono " + (diff === 0 ? "" : diff > 0 ? "text-accent" : "text-destructive")}>{fmt(diff, b.currency)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      <PageHeader title="Recent closings" />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Notes</TableHead><TableHead>Locked</TableHead></TableRow></TableHeader>
          <TableBody>
            {(closings.data ?? []).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell>{c.closing_date}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.notes || "—"}</TableCell>
                <TableCell>{c.is_locked ? "Yes" : "No"}</TableCell>
              </TableRow>
            ))}
            {closings.data && closings.data.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground">No closings yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}