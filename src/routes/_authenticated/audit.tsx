import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [q, setQ] = useState("");

  const eventsQ = useQuery({
    queryKey: ["audit_events"],
    queryFn: async () => (await supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });

  const events = (eventsQ.data ?? []).filter((e: any) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return e.entity_type.toLowerCase().includes(s) || e.entity_id.toLowerCase().includes(s) || e.action.toLowerCase().includes(s);
  });

  return (
    <>
      <PageHeader title="Audit Log" description="Every change to financial data. Nothing is lost — deleted rows leave a permanent record." />

      <div className="mb-4">
        <Input placeholder="Search by table, action, or id…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
      </div>

      <div className="space-y-2">
        {events.length === 0 && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No audit events yet.</CardContent></Card>
        )}
        {events.map((e: any) => (
          <Card key={e.id} className="backdrop-blur bg-card/80" style={{ boxShadow: "var(--shadow-soft)" }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Badge variant={e.action === "delete" ? "destructive" : e.action === "insert" ? "default" : "secondary"} className="capitalize">
                  {e.action}
                </Badge>
                <span className="font-medium text-foreground">{e.entity_type}</span>
                <span className="font-mono">{e.entity_id.slice(0, 8)}</span>
                <span className="ml-auto">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              {e.action === "update" ? (
                <Diff old={e.old_value} next={e.new_value} />
              ) : (
                <pre className="text-[11px] font-mono bg-muted/40 rounded p-2 max-h-40 overflow-auto">
                  {JSON.stringify(e.new_value ?? e.old_value, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function Diff({ old: oldVal, next }: { old: any; next: any }) {
  const keys = new Set<string>([...Object.keys(oldVal ?? {}), ...Object.keys(next ?? {})]);
  const changes: { k: string; a: any; b: any }[] = [];
  keys.forEach((k) => {
    const a = oldVal?.[k], b = next?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ k, a, b });
  });
  if (changes.length === 0) return <p className="text-xs text-muted-foreground">No visible changes.</p>;
  return (
    <div className="space-y-1 text-xs font-mono">
      {changes.map((c) => (
        <div key={c.k} className="grid grid-cols-[120px_1fr_1fr] gap-2 border-b border-border/50 pb-1">
          <span className="text-muted-foreground">{c.k}</span>
          <span className="text-destructive line-through truncate">{String(c.a ?? "—")}</span>
          <span className="text-emerald-700 truncate">{String(c.b ?? "—")}</span>
        </div>
      ))}
    </div>
  );
}