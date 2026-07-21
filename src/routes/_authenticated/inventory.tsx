import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/exchange";
import { fmtProfitIRR, fmtProfitAED } from "@/lib/inventory";
import { LotCostBasisDialog } from "@/components/lot-cost-basis-dialog";
import { ChevronDown, ChevronRight, AlertCircle, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory")({ component: Page });

function Page() {
  const [showDetails, setShowDetails] = useState(false);
  const [filter, setFilter] = useState<"all" | "known" | "unknown" | "capital">("all");

  const summary = useQuery({
    queryKey: ["v_currency_inventory_summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_currency_inventory_summary" as any).select("*").order("currency");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const lots = useQuery({
    queryKey: ["v_lot_detailed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_lot_detailed" as any)
        .select("*")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const lotsLegacy = useQuery({
    queryKey: ["inventory_lots_view"],
    enabled: showDetails,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_lots_view")
        .select("*")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const profit = useQuery({
    queryKey: ["profit_by_lot"],
    enabled: showDetails,
    queryFn: async () => {
      const { data, error } = await supabase.from("profit_by_lot").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const byAccount = useQuery({
    queryKey: ["profit_by_account"],
    enabled: showDetails,
    queryFn: async () => {
      const { data, error } = await supabase.from("profit_by_account" as any).select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const bySource = useQuery({
    queryKey: ["profit_by_source"],
    enabled: showDetails,
    queryFn: async () => {
      const { data, error } = await supabase.from("profit_by_source" as any).select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const allocations = useQuery({
    queryKey: ["sale_allocations_view"],
    enabled: showDetails,
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_allocations_view" as any).select("*").order("entry_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const remaining = useQuery({
    queryKey: ["remaining_by_cost_rate"],
    enabled: showDetails,
    queryFn: async () => {
      const { data, error } = await supabase.from("remaining_by_cost_rate" as any).select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader
        title="Currency Inventory"
        description="Every currency you hold is tracked by lot. Each lot remembers its own cost rate, source and location. Profit is calculated from these lots — not from account balances."
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowDetails(v => !v)}>
            {showDetails ? "Hide details" : "Show details"}
          </Button>
        }
      />

      {/* Cost basis filter */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["all","known","unknown","capital"] as const).map(k => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`text-[11px] px-3 py-1.5 rounded-md border ${filter === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
            {k === "all" ? "All lots" : k === "known" ? "Known cost" : k === "unknown" ? "No cost basis" : "Capital"}
          </button>
        ))}
      </div>

      {/* Currency hero cards */}
      <div className="space-y-4">
        {(summary.data ?? []).map((s: any) => (
          <CurrencyHeroCard
            key={s.currency}
            summary={s}
            lots={(lots.data ?? []).filter((l: any) => l.currency === s.currency && (filter === "all" || l.cost_basis_status === filter) && Number(l.remaining_amount) > 0)}
          />
        ))}
        {summary.isSuccess && (summary.data ?? []).length === 0 && (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">No inventory yet.</div>
        )}
      </div>

      {showDetails && (
      <div className="mt-6">
      <Tabs defaultValue="lots">
        <TabsList>
          <TabsTrigger value="lots">All lots</TabsTrigger>
          <TabsTrigger value="profit">Profit by lot</TabsTrigger>
          <TabsTrigger value="account">By account</TabsTrigger>
          <TabsTrigger value="source">By source</TabsTrigger>
          <TabsTrigger value="allocations">Allocations</TabsTrigger>
          <TabsTrigger value="remaining">Remaining by rate</TabsTrigger>
        </TabsList>

        <TabsContent value="lots">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Original</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Cost rate</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(lotsLegacy.data ?? []).map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.lot_code}</TableCell>
                    <TableCell className="font-medium">{l.currency}</TableCell>
                    <TableCell className="text-xs">{l.account_name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={l.source_description}>{l.source_description || l.source_ref_type}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(l.original_amount, l.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(l.remaining_amount, l.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(l.sold_amount, l.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(l.cost_basis_rate)} {l.cost_basis_currency}/{l.currency}</TableCell>
                    <TableCell className="text-xs">{l.entry_date}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "available" ? "default" : l.status === "partial" ? "secondary" : "outline"}>{l.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {lotsLegacy.data && lotsLegacy.data.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No inventory lots yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="profit">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Lot</TableHead><TableHead>Currency</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Sold</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Profit</TableHead></TableRow></TableHeader>
              <TableBody>
                {(profit.data ?? []).map((r: any) => (
                  <TableRow key={r.lot_id}>
                    <TableCell className="font-mono text-xs">{r.lot_code}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={r.source_description}>{r.source_description}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.sold_amount, r.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.total_cost)} {r.cost_basis_currency}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.total_received)}</TableCell>
                    <TableCell className="text-right font-mono text-accent">{fmt(r.gross_profit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="account">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Account</TableHead><TableHead>Sold ccy</TableHead><TableHead>Recv ccy</TableHead>
                <TableHead className="text-right">Sells</TableHead>
                <TableHead className="text-right">Sold</TableHead><TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Milad</TableHead><TableHead className="text-right">Ali</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(byAccount.data ?? []).map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{r.account_name || "—"}</TableCell>
                    <TableCell>{r.sold_currency}</TableCell>
                    <TableCell>{r.received_currency}</TableCell>
                    <TableCell className="text-right font-mono">{r.sell_count}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.sold_amount, r.sold_currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.received_amount, r.received_currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.total_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-accent">{fmt(r.gross_profit)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.milad_profit)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.ali_profit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="source">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Source</TableHead><TableHead>Person</TableHead><TableHead>Name</TableHead><TableHead>Ccy</TableHead>
                <TableHead className="text-right">Sold</TableHead><TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Received</TableHead><TableHead className="text-right">Profit</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(bySource.data ?? []).map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{r.source_ref_type}</TableCell>
                    <TableCell className="capitalize">{r.source_person}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.source_name || "—"}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.sold_amount, r.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.total_cost)} {r.cost_basis_currency}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.total_received)}</TableCell>
                    <TableCell className="text-right font-mono text-accent">{fmt(r.gross_profit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="allocations">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Lot</TableHead><TableHead>Account</TableHead>
                <TableHead className="text-right">Consumed</TableHead>
                <TableHead className="text-right">Cost rate</TableHead><TableHead className="text-right">Sell rate</TableHead>
                <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(allocations.data ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.entry_date}</TableCell>
                    <TableCell className="font-mono text-xs">{r.lot_code}</TableCell>
                    <TableCell className="text-xs">{r.account_name || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.amount_consumed, r.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.cost_rate)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.sell_rate)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.cost_amount)} {r.cost_basis_currency}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.received_amount)} {r.received_currency}</TableCell>
                    <TableCell className="text-right font-mono text-accent">{r.gross_profit == null ? "—" : `${fmt(r.gross_profit)} ${r.cost_basis_currency}`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="remaining">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Currency</TableHead><TableHead>Account</TableHead>
                <TableHead className="text-right">Cost rate</TableHead><TableHead className="text-right">Lots</TableHead>
                <TableHead className="text-right">Remaining</TableHead><TableHead className="text-right">Remaining cost</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(remaining.data ?? []).map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.currency}</TableCell>
                    <TableCell className="text-xs">{r.account_name || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.cost_basis_rate)} {r.cost_basis_currency}/{r.currency}</TableCell>
                    <TableCell className="text-right font-mono">{r.lot_count}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.remaining_amount, r.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.remaining_cost)} {r.cost_basis_currency}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      </div>
      )}
    </>
  );
}

function CurrencyHeroCard({ summary: s, lots }: { summary: any; lots: any[] }) {
  const [expanded, setExpanded] = useState(true);
  const isIRR = s.currency === "IRR";

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-4 md:p-5 flex flex-wrap items-baseline justify-between gap-3 border-b bg-gradient-to-b from-muted/30 to-transparent">
          <div className="flex items-center gap-3">
            <button onClick={() => setExpanded(v => !v)} className="p-1 -ml-1 hover:bg-muted rounded">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className="text-2xl font-bold tracking-tight">{s.currency}</div>
            <Badge variant="outline" className="text-[10px]">{s.lot_count} lots</Badge>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Available</div>
            <div className="text-2xl font-mono tabular-nums">{fmt(s.available_amount, s.currency)}</div>
          </div>
        </div>

        {/* Summary grid */}
        <div className="p-4 md:p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 border-b">
          <Metric label="Known cost" value={fmt(s.known_cost_amount, s.currency)} sub={s.currency} />
          <Metric label="Unknown cost" value={fmt(s.unknown_cost_amount, s.currency)} sub={s.currency} tone={Number(s.unknown_cost_amount) > 0 ? "warn" : undefined} />
          <Metric label="Capital" value={fmt(s.capital_amount, s.currency)} sub={s.currency} />
          {!isIRR && (
            <Metric label="Weighted avg cost" value={s.weighted_avg_cost_rate ? fmt(s.weighted_avg_cost_rate) : "—"} sub={s.cost_basis_currency ? `${s.cost_basis_currency}/${s.currency}` : ""} />
          )}
          {!isIRR && <Metric label="Market buy" value={s.market_buy ? fmt(s.market_buy) : "—"} sub={s.market_buy ? "IRR" : ""} />}
          {!isIRR && <Metric label="Market sell" value={s.market_sell ? fmt(s.market_sell) : "—"} sub={s.market_sell ? "IRR" : ""} />}
          {isIRR && (
            <div className="md:col-span-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Settlement cash — no floating P/L.
            </div>
          )}
        </div>

        {/* Unrealized P/L */}
        {!isIRR && s.market_sell && (
          <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 border-b bg-muted/10">
            <Metric label="Estimated value" value={s.estimated_value_irr ? fmt(s.estimated_value_irr) : "—"} sub="IRR" strong />
            <Metric
              label="Unrealized P/L on known lots"
              value={fmtProfitIRR(s.unrealized_profit_irr)}
              sub="IRR"
              strong
              tone={Number(s.unrealized_profit_irr ?? 0) >= 0 ? "ok" : "danger"}
            />
            <Metric
              label="≈ in AED"
              value={fmtProfitAED(s.unrealized_profit_aed)}
              sub="AED"
              tone={Number(s.unrealized_profit_aed ?? 0) >= 0 ? "ok" : "danger"}
            />
          </div>
        )}

        {/* Lots list */}
        {expanded && (
          <div className="divide-y">
            {lots.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No lots match the current filter.</div>
            )}
            {lots.map((l: any) => (
              <LotRow key={l.id} lot={l} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LotRow({ lot: l }: { lot: any }) {
  const st = l.cost_basis_status as "known" | "unknown" | "capital";
  return (
    <div className="p-3 md:p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="min-w-[140px]">
        <div className="font-mono text-xs">{l.lot_code}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l.status}</div>
      </div>
      <div className="min-w-[140px]">
        <div className="text-[10px] uppercase text-muted-foreground">Available</div>
        <div className="font-mono text-sm">{fmt(l.remaining_amount, l.currency)} <span className="text-muted-foreground text-[10px]">/ {fmt(l.original_amount, l.currency)}</span></div>
      </div>
      <div className="min-w-[140px]">
        <div className="text-[10px] uppercase text-muted-foreground">Cost rate</div>
        {st === "known" && Number(l.cost_basis_rate) > 0 ? (
          <div className="font-mono text-sm">{fmt(l.cost_basis_rate)} <span className="text-muted-foreground text-[10px]">{l.cost_basis_currency}/{l.currency}</span></div>
        ) : st === "capital" ? (
          <Badge variant="outline">Capital — no P/L</Badge>
        ) : (
          <div className="flex items-center gap-1.5 text-destructive text-xs"><AlertCircle className="h-3.5 w-3.5" /> Not recorded</div>
        )}
      </div>
      <div className="min-w-[160px] flex-1">
        <div className="text-[10px] uppercase text-muted-foreground">Location</div>
        <div className="text-xs truncate">{l.account_path || l.account_name || "—"}</div>
      </div>
      <div className="min-w-[110px]">
        <div className="text-[10px] uppercase text-muted-foreground">Age</div>
        <div className="text-xs">{l.age_days} days</div>
      </div>
      {st === "known" && l.market_sell_rate && (
        <div className="min-w-[140px]">
          <div className="text-[10px] uppercase text-muted-foreground">Unrealized P/L</div>
          <div className={`font-mono text-sm ${Number(l.unrealized_pl) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            {fmtProfitIRR(l.unrealized_pl)} {l.cost_basis_currency}
          </div>
        </div>
      )}
      {st !== "known" && (
        <div className="flex items-center gap-2 ml-auto">
          <LotCostBasisDialog
            lotId={l.id}
            lotCode={l.lot_code}
            currency={l.currency}
            mode="assign"
            trigger={<Button variant="outline" size="sm">Assign cost</Button>}
          />
          {st === "unknown" && (
            <LotCostBasisDialog
              lotId={l.id}
              lotCode={l.lot_code}
              currency={l.currency}
              mode="capital"
              trigger={<Button variant="ghost" size="sm">Mark capital</Button>}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub, tone, strong }: { label: string; value: string; sub?: string; tone?: "ok" | "danger" | "warn"; strong?: boolean }) {
  const color = tone === "ok" ? "text-emerald-600 dark:text-emerald-400"
              : tone === "danger" ? "text-destructive"
              : tone === "warn" ? "text-amber-600 dark:text-amber-400"
              : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono tabular-nums ${strong ? "text-lg font-semibold" : "text-sm"} ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
