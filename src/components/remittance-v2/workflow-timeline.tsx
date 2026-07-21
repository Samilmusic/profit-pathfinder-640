import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Circle, CheckCircle2 } from "lucide-react";
import { WorkflowStateBadge } from "./workflow-state-badge";

const TERMINAL = new Set(["closed", "cancelled"]);

export function WorkflowTimeline({ remittanceId }: { remittanceId: string }) {
  const q = useQuery({
    queryKey: ["remittance-v2", "workflow-transitions", remittanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_workflow_transitions")
        .select("id, from_state, to_state, reason, actor, created_at")
        .eq("remittance_id", remittanceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workflow Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : q.isError ? (
          <div className="text-sm text-destructive">Unable to load workflow transitions.</div>
        ) : (q.data?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground">
            No records are available or visible to your role.
          </div>
        ) : (
          <ol className="relative border-l border-border pl-4 space-y-4">
            {q.data!.map((t) => {
              const Icon = TERMINAL.has(String(t.to_state)) ? CheckCircle2 : Circle;
              return (
                <li key={t.id} className="relative">
                  <Icon className="absolute -left-[22px] top-0 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-wrap items-center gap-2">
                    {t.from_state ? (
                      <WorkflowStateBadge state={String(t.from_state)} />
                    ) : (
                      <span className="text-xs text-muted-foreground">initial</span>
                    )}
                    <span className="text-muted-foreground">→</span>
                    <WorkflowStateBadge state={String(t.to_state)} />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(t.created_at as string).toLocaleString()}
                    </span>
                  </div>
                  {t.reason ? <div className="mt-1 text-sm">{t.reason}</div> : null}
                  {t.actor ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      actor: {String(t.actor).slice(0, 8)}…
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
