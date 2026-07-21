import { Badge } from "@/components/ui/badge";

const TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  funds_received: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  settlement_pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  allocating: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  ready_to_close: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  closed: "bg-emerald-600 text-white",
  cancelled: "bg-destructive/15 text-destructive",
};

export function WorkflowStateBadge({ state }: { state: string | null | undefined }) {
  const s = state ?? "draft";
  return (
    <Badge className={TONE[s] ?? "bg-muted text-muted-foreground"}>{s.replace(/_/g, " ")}</Badge>
  );
}
