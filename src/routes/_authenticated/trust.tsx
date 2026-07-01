import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/exchange";
import { ShieldCheck, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trust")({ component: Page });

function Page() {
  const q = useQuery({
    queryKey: ["company_vs_customer_funds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_vs_customer_funds").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const scQ = useQuery({
    queryKey: ["service_charge_daily"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_charge_daily").select("*").order("entry_date", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const company = (q.data ?? []).filter((r: any) => r.bucket === "company");
  const customer = (q.data ?? []).filter((r: any) => r.bucket === "customer");

  return (
    <>
      <PageHeader title="Trust vs Company Funds" description="Customer money is kept separate from company assets." />
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Company assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {company.length === 0 && <div className="text-muted-foreground text-xs">No company balances yet.</div>}
            {company.map((r: any) => (
              <div key={r.currency} className="flex justify-between"><span className="text-muted-foreground">{r.currency}</span><span className="font-mono">{fmt(r.balance, r.currency)}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-primary/40" style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">Customer trust funds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {customer.length === 0 && <div className="text-muted-foreground text-xs">No customer balances yet.</div>}
            {customer.map((r: any) => (
              <div key={r.currency} className="flex justify-between"><span className="text-muted-foreground">{r.currency}</span><span className="font-mono">{fmt(r.balance, r.currency)}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Service charges — last 30 days</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {(scQ.data ?? []).length === 0 && <div className="text-muted-foreground text-xs">No service charges yet.</div>}
          {(scQ.data ?? []).map((r: any, i: number) => (
            <div key={i} className="flex justify-between border-b last:border-0 py-1">
              <span>{r.entry_date} · {r.currency}</span>
              <span className="font-mono">{fmt(r.total, r.currency)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}