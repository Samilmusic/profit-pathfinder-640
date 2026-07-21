import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { fmt } from "@/lib/exchange";
import { WorkflowStateBadge } from "@/components/remittance-v2/workflow-state-badge";
import { WorkflowTimeline } from "@/components/remittance-v2/workflow-timeline";
import { SettlementEventsList } from "@/components/remittance-v2/settlement-events-list";
import { AllocationsTable } from "@/components/remittance-v2/allocations-table";
import { ProfitComponentsCard } from "@/components/remittance-v2/profit-components-card";
import { DocumentsReadonly } from "@/components/remittance-v2/documents-readonly";

export const Route = createFileRoute("/_authenticated/remittances/$id/v2")({
  component: RemittanceV2DetailPage,
  head: () => ({ meta: [{ title: "Remittance v2 — Exchange Portal" }] }),
  errorComponent: ErrorView,
  notFoundComponent: NotFoundView,
});

const REMITTANCE_COLUMNS =
  "id, doc_no, status, workflow_version, workflow_state, entry_date, customer_id, customer_phone, customer_reference," +
  " transfer_currency, transferred_amount, transfer_date, transfer_method," +
  " beneficiary_name, beneficiary_bank, beneficiary_account_number, beneficiary_iban, beneficiary_card_number, beneficiary_country, beneficiary_notes," +
  " source_account_id, customer_payment_currency, customer_payment_amount, reference_rate, payment_received_account_id, payment_status," +
  " commission_method, commission_fixed_amount, commission_fixed_currency, commission_percentage," +
  " gross_commission_pay_ccy, gross_commission_aed, linked_expenses_aed, net_commission_aed," +
  " payment_destination, third_party_customer_id, third_party_name, linked_buy_id," +
  " settlement_amount, settlement_currency, settlement_date, excess_allocation, excess_allocation_note," +
  " fx_purchase_rate, fx_supplier_customer_id, fx_supplier_name, fx_purchased_amount," +
  " fx_trading_profit_pay_ccy, fx_trading_profit_aed, total_profit_pay_ccy, total_profit_aed," +
  " notes, created_by, created_at, updated_at," +
  " customer:customers!remittances_customer_id_fkey(id, name)," +
  " third_party:customers!remittances_third_party_customer_id_fkey(id, name)," +
  " source:accounts!remittances_source_account_id_fkey(id, name, currency)," +
  " payment:accounts!remittances_payment_received_account_id_fkey(id, name, currency)," +
  " linked_buy:buy_transactions!remittances_linked_buy_id_fkey(id, doc_no, bought_amount, bought_currency, buy_rate, supplier_delivered, supplier_delivered_at)";

function RemittanceV2DetailPage() {
  const { id } = Route.useParams();

  const q = useQuery({
    queryKey: ["remittance-v2", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittances")
        .select(REMITTANCE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const flags = useQuery({
    queryKey: ["remittance-v2", "flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_feature_flags")
        .select("key, enabled")
        .in("key", ["remittance_v2_enabled", "allocation_layer_posting"]);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const r of data ?? []) map[r.key as string] = !!r.enabled;
      return map;
    },
  });

  const expenses = useQuery({
    queryKey: ["remittance-v2", "expenses", id],
    enabled: !!q.data && (q.data as any).workflow_version === "v2",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_expenses")
        .select("id, label, amount, currency, amount_aed, notes, created_at")
        .eq("remittance_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (q.isLoading) return <LoadingView />;
  if (q.isError) return <ErrorView error={q.error as Error} />;
  if (!q.data) return <NotFoundView />;

  const r = q.data as any;
  const isV2 = r.workflow_version === "v2";
  const v2Enabled = !!flags.data?.remittance_v2_enabled;
  const postingEnabled = !!flags.data?.allocation_layer_posting;

  if (!isV2) {
    return (
      <div className="mx-auto max-w-3xl p-4 space-y-4">
        <BackLink />
        <Card>
          <CardHeader><CardTitle>Legacy remittance</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This remittance uses the legacy workflow. The v2 read-only view is only available for records created under the v2 workflow.
            </p>
            <Button asChild size="sm">
              <Link to="/remittances/$id" params={{ id }}>Open legacy detail</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BackLink />
        <div className="ml-2 flex items-center gap-2">
          <Badge variant="outline">v2</Badge>
          <WorkflowStateBadge state={r.workflow_state} />
          <span className="font-mono text-sm">{r.doc_no ?? String(r.id).slice(0, 8)}</span>
        </div>
      </div>

      {!v2Enabled ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
          v2 workflow is currently disabled. This page is a read-only preview.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Parties & Routing</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Customer" v={r.customer?.name ?? "—"} />
            <Row k="Third-party" v={r.third_party?.name ?? r.third_party_name ?? "—"} />
            <Row k="Payment destination" v={r.payment_destination ?? "—"} />
            <Row k="Source account" v={r.source ? `${r.source.name} (${r.source.currency})` : "—"} />
            <Row k="Payment received account" v={r.payment ? `${r.payment.name} (${r.payment.currency})` : "—"} />
            <Row k="Linked buy" v={r.linked_buy ? `${r.linked_buy.doc_no ?? String(r.linked_buy.id).slice(0, 8)} · ${fmt(r.linked_buy.bought_amount)} ${r.linked_buy.bought_currency ?? ""}` : "—"} />
            <Row k="FX supplier" v={r.fx_supplier_name ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Amounts</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Transfer" v={`${fmt(r.transferred_amount)} ${r.transfer_currency ?? ""}`} />
            <Row k="Customer payment" v={`${fmt(r.customer_payment_amount)} ${r.customer_payment_currency ?? ""}`} />
            <Row k="Reference rate" v={r.reference_rate != null ? fmt(r.reference_rate) : "—"} />
            <Row k="Settlement" v={r.settlement_amount != null ? `${fmt(r.settlement_amount)} ${r.settlement_currency ?? ""}` : "—"} />
            <Row k="FX purchase rate" v={r.fx_purchase_rate != null ? fmt(r.fx_purchase_rate) : "—"} />
            <Row k="FX purchased amount" v={r.fx_purchased_amount != null ? fmt(r.fx_purchased_amount) : "—"} />
            <Row k="Gross commission (AED)" v={r.gross_commission_aed != null ? fmt(r.gross_commission_aed) : "—"} />
            <Row k="Linked expenses (AED)" v={r.linked_expenses_aed != null ? fmt(r.linked_expenses_aed) : "—"} />
            <Row k="Net commission (AED)" v={r.net_commission_aed != null ? fmt(r.net_commission_aed) : "—"} />
            <Row k="FX trading profit (AED)" v={r.fx_trading_profit_aed != null ? fmt(r.fx_trading_profit_aed) : "—"} />
            <Row k="Total profit (AED)" v={r.total_profit_aed != null ? fmt(r.total_profit_aed) : "—"} />
          </CardContent>
        </Card>
      </div>

      <ProfitComponentsCard remittanceId={id} allocationPostingEnabled={postingEnabled} />
      <AllocationsTable remittanceId={id} />
      <WorkflowTimeline remittanceId={id} />
      <SettlementEventsList remittanceId={id} />

      <Card>
        <CardHeader><CardTitle className="text-base">Linked Expenses</CardTitle></CardHeader>
        <CardContent>
          {expenses.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : expenses.isError ? (
            <div className="text-sm text-destructive">Unable to load expenses.</div>
          ) : (expenses.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">No records are available or visible to your role.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {expenses.data!.map((e) => (
                <li key={e.id} className="flex items-center justify-between border-b py-1">
                  <span>{e.label}</span>
                  <span className="font-mono">{fmt(e.amount)} {e.currency} <span className="text-muted-foreground">({fmt(e.amount_aed)} AED)</span></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DocumentsReadonly remittanceId={id} />

      {r.notes ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{r.notes}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild size="sm" variant="ghost">
      <Link to="/remittances">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Link>
    </Button>
  );
}

function LoadingView() {
  return (
    <div className="mx-auto max-w-6xl p-4 space-y-3">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="h-32 animate-pulse rounded bg-muted" />
      <div className="h-32 animate-pulse rounded bg-muted" />
    </div>
  );
}

function NotFoundView() {
  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <BackLink />
      <Card>
        <CardHeader><CardTitle>Remittance not found</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No records are available or visible to your role.
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorView({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <BackLink />
      <Card>
        <CardHeader><CardTitle>Unable to load remittance</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-destructive">{error?.message ?? "Unknown error"}</p>
          <Button size="sm" onClick={() => router.invalidate()}>Retry</Button>
        </CardContent>
      </Card>
    </div>
  );
}
