import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/exchange";
import { Plus, ChevronRight, ChevronDown, Package, MapPin, Wallet } from "lucide-react";
import { RecordActions } from "@/components/record-actions";
import { EDIT_FIELDS } from "@/lib/edit-fields";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts/")({ component: AccountsPage });

type Node = {
  id: string;
  name: string;
  node_type: "box" | "location" | "currency_account";
  parent_id: string | null;
  account_type: string;
  currency: string | null;
  owner: string;
  bank_name: string | null;
  holder_name: string | null;
  is_active: boolean;
  deleted_at: string | null;
  opening_balance: number;
  current_balance?: number;
  children: Node[];
};

function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);

  const dataQ = useQuery({
    queryKey: ["accounts_hierarchy", showArchived],
    queryFn: async () => {
      let q = supabase.from("accounts").select("*").order("name");
      if (!showArchived) q = q.is("deleted_at", null).eq("is_active", true);
      const [a, b, h] = await Promise.all([
        q,
        supabase.from("account_balances").select("*"),
        supabase.from("account_hierarchy_balances" as any).select("*"),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      const balMap = new Map(b.data.map((x: any) => [x.account_id, x.current_balance]));
      const rollup = new Map<string, Record<string, number>>();
      for (const r of (h.data as any[]) ?? []) {
        const bucket = rollup.get(r.account_id) ?? {};
        bucket[r.currency] = Number(r.balance) || 0;
        rollup.set(r.account_id, bucket);
      }
      const rows: Node[] = a.data.map((row: any) => ({
        ...row,
        current_balance: balMap.get(row.id) ?? row.opening_balance,
        children: [],
      }));
      return { rows, rollup };
    },
  });

  const { boxes, ungrouped, rollup } = useMemo(() => {
    const rows = dataQ.data?.rows ?? [];
    const rollup = dataQ.data?.rollup ?? new Map();
    const byId = new Map<string, Node>();
    rows.forEach((r) => byId.set(r.id, r));
    for (const r of rows) {
      if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id)!.children.push(r);
    }
    const boxes = rows.filter((r) => r.node_type === "box");
    // Ungrouped = leaf currency_account with no parent (legacy accounts)
    const ungrouped = rows.filter((r) => r.node_type === "currency_account" && !r.parent_id);
    return { boxes, ungrouped, rollup };
  }, [dataQ.data]);

  return (
    <>
      <PageHeader
        title="Money Containers"
        description="Boxes hold locations. Locations hold currency accounts. Balances roll up automatically."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/accounts/new" search={{ mode: "box" } as any}><Package className="h-4 w-4 mr-1" /> New Box</Link>
            </Button>
            <Button asChild>
              <Link to="/accounts/new"><Plus className="h-4 w-4 mr-1" /> New Account</Link>
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <Button size="sm" variant={showArchived ? "outline" : "default"} onClick={() => setShowArchived(false)}>Active</Button>
        <Button size="sm" variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived(true)}>Include archived</Button>
      </div>

      <div className="space-y-3">
        {boxes.map((box) => <BoxCard key={box.id} node={box} rollup={rollup.get(box.id) ?? {}} />)}

        {ungrouped.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Ungrouped accounts
                <span className="ml-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
                  legacy — move into a Box
                </span>
              </div>
              <div className="divide-y">
                {ungrouped.map((a) => <LeafRow key={a.id} node={a} indent={0} />)}
              </div>
            </CardContent>
          </Card>
        )}

        {boxes.length === 0 && ungrouped.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
            No accounts yet. Start by creating a Box (e.g. <b>Milad Box</b>), then add Locations (Cash, ENBD…) and Currency Accounts under each.
          </CardContent></Card>
        )}
      </div>
    </>
  );
}

function BoxCard({ node, rollup }: { node: Node; rollup: Record<string, number> }) {
  const [open, setOpen] = useState(true);
  const currencies = Object.keys(rollup).sort();
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-3 bg-gradient-to-r from-primary/5 to-transparent hover:bg-accent/40 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <Package className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{node.name}</div>
          <div className="text-[11px] text-muted-foreground">Box · {node.children.length} location{node.children.length === 1 ? "" : "s"}</div>
        </div>
        <div className="hidden sm:flex flex-wrap justify-end gap-2 max-w-[60%]">
          {currencies.slice(0, 4).map((c) => (
            <div key={c} className="text-right">
              <div className="text-[10px] text-muted-foreground">{c}</div>
              <div className="font-mono text-sm font-medium">{fmt(rollup[c], c)}</div>
            </div>
          ))}
        </div>
        <RecordActionsWrap node={node} />
      </button>
      {open && (
        <div className="border-t bg-muted/20">
          {/* Mobile rollup */}
          {currencies.length > 0 && (
            <div className="sm:hidden flex flex-wrap gap-x-4 gap-y-1 p-3 border-b bg-background">
              {currencies.map((c) => (
                <div key={c}>
                  <span className="text-[10px] text-muted-foreground mr-1">{c}</span>
                  <span className="font-mono text-sm font-medium">{fmt(rollup[c], c)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="p-2 space-y-1">
            {node.children.length === 0 && (
              <div className="text-xs text-muted-foreground px-2 py-3">
                No locations yet. <Link to="/accounts/new" search={{ mode: "location", parent: node.id } as any} className="text-primary hover:underline">Add a location</Link> (Cash, ENBD, Wio…).
              </div>
            )}
            {node.children.map((loc) => <LocationRow key={loc.id} node={loc} boxId={node.id} />)}
            <div className="pt-1 flex flex-wrap gap-2 px-2 pb-1">
              <Button size="sm" variant="ghost" asChild>
                <Link to="/accounts/new" search={{ mode: "location", parent: node.id } as any}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add location
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function LocationRow({ node, boxId }: { node: Node; boxId: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border bg-background">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-2.5 hover:bg-accent/40 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{node.name}</div>
          <div className="text-[10px] text-muted-foreground">
            Location · {node.children.length} currency{node.children.length === 1 ? "" : " accounts"}
            {node.bank_name && <> · {node.bank_name}</>}
          </div>
        </div>
        <RecordActionsWrap node={node} />
      </button>
      {open && (
        <div className="border-t divide-y">
          {node.children.length === 0 && (
            <div className="text-xs text-muted-foreground px-3 py-2">
              No currency accounts. <Link to="/accounts/new" search={{ parent: node.id } as any} className="text-primary hover:underline">Add currency</Link>.
            </div>
          )}
          {node.children.map((leaf) => <LeafRow key={leaf.id} node={leaf} indent={1} />)}
          <div className="px-3 py-1.5">
            <Button size="sm" variant="ghost" asChild className="h-7 text-xs">
              <Link to="/accounts/new" search={{ parent: node.id, box: boxId } as any}>
                <Plus className="h-3 w-3 mr-1" /> Add currency
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function LeafRow({ node, indent }: { node: Node; indent: number }) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2", indent > 0 && "pl-9")}>
      <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">
          <span className="font-medium">{node.currency}</span>
          <span className="text-muted-foreground ml-2 text-xs">{node.name}</span>
        </div>
        <div className="text-[10px] text-muted-foreground capitalize">
          {node.account_type.replace("_", " ")} · {node.owner}
          {node.deleted_at || !node.is_active ? <Badge variant="outline" className="ml-2 text-[9px] py-0">Archived</Badge> : null}
        </div>
      </div>
      <div className="font-mono text-sm font-medium text-right">{fmt(node.current_balance ?? 0, node.currency ?? undefined)}</div>
      <RecordActionsWrap node={node} />
    </div>
  );
}

function RecordActionsWrap({ node }: { node: Node }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
      <RecordActions
        table="accounts"
        row={node as any}
        invalidateKeys={["accounts", "accounts_hierarchy", "accounts_full"]}
        fields={EDIT_FIELDS.accounts}
      />
    </div>
  );
}