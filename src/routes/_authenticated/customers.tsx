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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { RecordActions } from "@/components/record-actions";

export const Route = createFileRoute("/_authenticated/customers")({ component: CustomersPage });

function CustomersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", account_details: "", notes: "" });

  const q = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Accounts</TableHead><TableHead>Notes</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.phone || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{c.account_details || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{c.notes || "—"}</TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No customers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}