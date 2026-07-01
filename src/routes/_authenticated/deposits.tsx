import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "@/lib/exchange";
import { SmartLabels } from "@/components/settlement-status-badge";
import { DocumentsPanel } from "@/components/documents-panel";
import { toast } from "sonner";
import { Plus, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/deposits")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["customer_deposits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_deposits")
        .select("*, customer:customers(name), deposit_account:accounts!customer_deposits_deposit_account_id_fkey(name)")
        .is("deleted_at", null).order("entry_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader title="Customer Deposits" description="Money customers place with us with no immediate exchange. Increases their wallet." actions={
        <Link to="/deposits/new">
          <Button size="lg" className="h-12"><Plus className="h-4 w-4 mr-1" /> New deposit</Button>
        </Link>
      } />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Received into</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="font-medium">{r.customer?.name}</TableCell>
                <TableCell>{r.deposit_account?.name}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.amount, r.currency)}</TableCell>
                <TableCell><SmartLabels row={r} /></TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}>Open</Button></TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No deposits yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
      <DepositDetail id={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function DepositDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["deposit", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("customer_deposits").select("*, customer:customers(name)").eq("id", id!).maybeSingle();
      return data;
    },
  });
  const [note, setNote] = useState("");
  useEffect(() => { setNote(q.data?.completion_note ?? ""); }, [q.data]);
  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customer_deposits").update({ settlement_status: "completed", completion_note: note }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deposit completed — wallet credited"); qc.invalidateQueries(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Deposit — {q.data?.customer?.name}</DialogTitle></DialogHeader>
        {q.data && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">{q.data.entry_date} · {fmt(q.data.amount, q.data.currency)}</div>
            <SmartLabels row={q.data} />
            <DocumentsPanel refType="deposit" refId={q.data.id} />
            <div><Label className="text-xs">Confirmation note (required to complete)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Confirmed receipt in bank / cash box…" /></div>
            {q.data.settlement_status !== "completed" && (
              <Button className="w-full" onClick={() => complete.mutate()} disabled={complete.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Mark completed & credit wallet
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}