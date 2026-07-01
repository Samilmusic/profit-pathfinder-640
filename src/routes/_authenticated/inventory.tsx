import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt } from "@/lib/exchange";

export const Route = createFileRoute("/_authenticated/inventory")({ component: Page });

function Page() {
  const summary = useQuery({
    queryKey: ["currency_inventory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currency_inventory").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lots = useQuery({
    queryKey: ["inventory_lots_view"],
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
    queryFn: async () => {
      const { data, error } = await supabase.from("profit_by_lot").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const byAccount = useQuery({
    queryKey: ["profit_by_account"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profit_by_account" as any).select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const bySource = useQuery({
    queryKey: ["profit_by_source"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profit_by_source" as any).select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const allocations = useQuery({
    queryKey: ["sale_allocations_view"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_allocations_view" as any).select("*").order("entry_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const remaining = useQuery({
    queryKey: ["remaining_by_cost_rate"],
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
        description="Inventory lots track cost basis from brought-in conversions and buys. FIFO is used at sell time."
      />
      <Tabs defaultValue="lots">
        <TabsList>
          <TabsTrigger value="lots">Lots</TabsTrigger>
          <TabsTrigger value="summary">Summary by currency</TabsTrigger>
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
                {(lots.data ?? []).map((l: any) => (
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
                {lots.data && lots.data.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No inventory lots yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="summary">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Currency</TableHead><TableHead className="text-right">Total owned</TableHead><TableHead className="text-right">Avg buy rate</TableHead><TableHead className="text-right">Total cost</TableHead><TableHead>Last buy</TableHead><TableHead>Last sell</TableHead></TableRow></TableHeader>
              <TableBody>
                {(summary.data ?? []).map((r: any) => (
                  <TableRow key={r.currency}>
                    <TableCell className="font-medium">{r.currency}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.total_amount)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.avg_buy_rate)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.total_cost)}</TableCell>
                    <TableCell>{r.last_buy_date || "—"}</TableCell>
                    <TableCell>{r.last_sell_date || "—"}</TableCell>
                  </TableRow>
                ))}
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
    </>
  );
}
