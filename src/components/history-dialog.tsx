import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export function HistoryDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: string;
  entityId: string | null;
}) {
  const q = useQuery({
    enabled: !!entityId && open,
    queryKey: ["audit", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_events")
        .select("*").eq("entity_type", entityType).eq("entity_id", entityId!).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit history</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-3">
            {(q.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No history yet.</p>
            )}
            {(q.data ?? []).map((e: any, i: number) => (
              <div key={e.id} className="rounded-md border border-border/60 p-3 bg-card/60">
                <div className="flex items-center gap-2 text-xs mb-2">
                  <Badge variant={e.action === "delete" ? "destructive" : e.action === "insert" ? "default" : "secondary"} className="capitalize">
                    {i === 0 ? "Original" : `v${i + 1} · ${e.action}`}
                  </Badge>
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                  {e.actor_id && <span className="text-muted-foreground font-mono">{String(e.actor_id).slice(0, 8)}</span>}
                </div>
                {e.reason && <p className="text-xs mb-2"><span className="text-muted-foreground">Reason: </span>{e.reason}</p>}
                {e.device && <p className="text-[10px] text-muted-foreground mb-2 truncate">{e.device}</p>}
                {e.action === "update" ? (
                  <Diff old={e.old_value} next={e.new_value} />
                ) : (
                  <pre className="text-[11px] font-mono bg-muted/40 rounded p-2 max-h-40 overflow-auto">
                    {JSON.stringify(e.new_value ?? e.old_value, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Diff({ old: oldVal, next }: { old: any; next: any }) {
  const keys = new Set<string>([...Object.keys(oldVal ?? {}), ...Object.keys(next ?? {})]);
  const rows: { k: string; a: any; b: any }[] = [];
  keys.forEach((k) => {
    if (["updated_at", "created_at"].includes(k)) return;
    const a = oldVal?.[k], b = next?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) rows.push({ k, a, b });
  });
  if (!rows.length) return <p className="text-xs text-muted-foreground">No field changes.</p>;
  return (
    <div className="space-y-1 text-xs font-mono">
      {rows.map((r) => (
        <div key={r.k} className="grid grid-cols-[130px_1fr_1fr] gap-2 border-b border-border/40 pb-1">
          <span className="text-muted-foreground">{r.k}</span>
          <span className="text-destructive line-through truncate">{fmtVal(r.a)}</span>
          <span className="text-emerald-700 truncate">{fmtVal(r.b)}</span>
        </div>
      ))}
    </div>
  );
}

function fmtVal(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}