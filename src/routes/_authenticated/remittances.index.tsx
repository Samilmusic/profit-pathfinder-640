import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmt } from "@/lib/exchange";
import { Plus, Send, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/remittances/")({
  component: RemittanceListPage,
  head: () => ({
    meta: [
      { title: "Remittances — Exchange Portal" },
      { name: "description", content: "Customer money transfer services with commission profit tracking." },
    ],
  }),
});

const STATUS_COLOR: Record<string, string> = {
  open: "bg-slate-500/15 text-slate-300",
  waiting_customer_payment: "bg-amber-500/15 text-amber-400",
  payment_received: "bg-blue-500/15 text-blue-400",
  waiting_transfer: "bg-amber-500/15 text-amber-400",
  transfer_completed: "bg-emerald-500/15 text-emerald-400",
  waiting_transfer_proof: "bg-amber-500/15 text-amber-400",
  ready_to_close: "bg-blue-500/15 text-blue-400",
  closed: "bg-emerald-600/20 text-emerald-400",
  cancelled: "bg-rose-500/15 text-rose-400",
};

function RemittanceListPage() {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["remittances_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittances")
        .select("id,doc_no,status,entry_date,transfer_currency,transferred_amount,customer_payment_currency,customer_payment_amount,gross_commission_aed,net_commission_aed,beneficiary_name,customer_id,customers(name)")
        .order("entry_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = (data ?? []).filter((r: any) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (r.doc_no || "").toLowerCase().includes(s)
      || (r.beneficiary_name || "").toLowerCase().includes(s)
      || (r.customers?.name || "").toLowerCase().includes(s);
  });

  return (
    <div className="p-4 md:p-6 space-y-4 pb-24 md:pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" /> Remittances
          </h1>
          <p className="text-sm text-muted-foreground">Money transfer service — commission profit only.</p>
        </div>
        <Button asChild>
          <Link to="/remittances/new"><Plus className="h-4 w-4 mr-1" /> New Remittance</Link>
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search doc / beneficiary / customer…" className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden md:grid grid-cols-[130px_120px_1fr_170px_170px_140px_100px] gap-3 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b">
            <div>Code</div>
            <div>Date</div>
            <div>Customer / Beneficiary</div>
            <div>Transferred</div>
            <div>Customer Paid</div>
            <div className="text-right">Commission (AED)</div>
            <div>Status</div>
          </div>
          {rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No remittances yet.</div>
          )}
          {rows.map((r: any) => (
            <Link
              key={r.id}
              to="/remittances/$id" params={{ id: r.id }}
              className="block border-b last:border-b-0 hover:bg-accent/40 transition"
            >
              <div className="md:grid md:grid-cols-[130px_120px_1fr_170px_170px_140px_100px] gap-3 px-4 py-3 text-sm">
                <div className="font-mono text-xs">{r.doc_no || r.id.slice(0, 8)}</div>
                <div className="text-muted-foreground">{r.entry_date}</div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.customers?.name || "—"}</div>
                  <div className="truncate text-xs text-muted-foreground">→ {r.beneficiary_name || "—"}</div>
                </div>
                <div>{fmt(r.transferred_amount, r.transfer_currency)}</div>
                <div>{fmt(r.customer_payment_amount, r.customer_payment_currency)}</div>
                <div className="text-right font-semibold text-emerald-400">{fmt(r.net_commission_aed, "AED")}</div>
                <div>
                  <Badge className={STATUS_COLOR[r.status] ?? ""} variant="secondary">
                    {String(r.status).replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}