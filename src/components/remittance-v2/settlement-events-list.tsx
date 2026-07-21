import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SettlementEventsList({ remittanceId }: { remittanceId: string }) {
  const q = useQuery({
    queryKey: ["remittance-v2", "settlement-events", remittanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_settlement_events")
        .select("id, event_type, payload, actor, created_at")
        .eq("remittance_id", remittanceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Settlement Events</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : q.isError ? (
          <div className="text-sm text-destructive">Unable to load settlement events.</div>
        ) : (q.data?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground">No records are available or visible to your role.</div>
        ) : (
          <ul className="space-y-2">
            {q.data!.map((e) => (
              <li key={e.id} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{String(e.event_type)}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(e.created_at as string).toLocaleString()}</span>
                </div>
                {e.payload ? (
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(e.payload, null, 2)}</pre>
                ) : null}
                {e.actor ? <div className="mt-1 text-xs text-muted-foreground">actor: {String(e.actor).slice(0, 8)}…</div> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
