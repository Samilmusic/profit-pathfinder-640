/**
 * Reporting — Enterprise Audit Explorer (Phase 6 Slice 6)
 * Version: 1.0.0
 *
 * READ-ONLY. Wraps `report_audit_timeline()`, `report_audit_event_detail()`,
 * and `report_audit_actors()`. Admin/manager only (enforced server-side).
 */
import { supabase } from "@/integrations/supabase/client";
import type { ReportMeta } from "@/lib/reports/executive.functions";

export type AuditKind =
  | "workflow"
  | "settlement"
  | "allocation"
  | "reversal"
  | "posting"
  | "profit"
  | "feature_flag"
  | "permission"
  | "entity_change";

export const AUDIT_KINDS: { value: AuditKind; label: string }[] = [
  { value: "workflow", label: "Workflow" },
  { value: "settlement", label: "Settlement" },
  { value: "allocation", label: "Allocation" },
  { value: "reversal", label: "Reversal" },
  { value: "posting", label: "Posting" },
  { value: "profit", label: "Profit" },
  { value: "feature_flag", label: "Feature Flag" },
  { value: "permission", label: "Permission" },
  { value: "entity_change", label: "Entity Change" },
];

export type AuditRow = {
  kind: AuditKind;
  source_table: string;
  source_id: string;
  event_id: string;
  created_at: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  correlation_id: string | null;
};

export type AuditCursor = { ts: string; id: string } | null;

export type AuditTimelineResponse = {
  meta: ReportMeta;
  limit: number;
  rows: AuditRow[];
  has_more: boolean;
  next_cursor: AuditCursor;
};

export type AuditTimelineArgs = {
  limit?: number;
  cursor?: AuditCursor;
  kinds?: AuditKind[] | null;
  actor?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
};

export async function fetchAuditTimeline(
  a: AuditTimelineArgs = {},
): Promise<AuditTimelineResponse> {
  const { data, error } = await supabase.rpc("report_audit_timeline", {
    _limit: a.limit ?? 100,
    _cursor_ts: a.cursor?.ts ?? undefined,
    _cursor_id: a.cursor?.id ?? undefined,
    _kinds: a.kinds && a.kinds.length ? a.kinds : undefined,
    _actor: a.actor ?? undefined,
    _entity_type: a.entity_type ?? undefined,
    _entity_id: a.entity_id ?? undefined,
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
    _search: a.search ?? undefined,
  });
  if (error) throw error;
  return data as unknown as AuditTimelineResponse;
}

export type AuditDetail = {
  found: boolean;
  event?: AuditRow;
  actor?: { id: string; email: string | null; display_name: string | null } | null;
  related?: AuditRow[];
  meta?: ReportMeta;
};

export async function fetchAuditEventDetail(kind: AuditKind, id: string): Promise<AuditDetail> {
  const { data, error } = await supabase.rpc("report_audit_event_detail", {
    _kind: kind,
    _id: id,
  });
  if (error) throw error;
  return data as unknown as AuditDetail;
}

export type AuditActor = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export async function fetchAuditActors(): Promise<AuditActor[]> {
  const { data, error } = await supabase.rpc("report_audit_actors");
  if (error) throw error;
  return (data ?? []) as unknown as AuditActor[];
}

export function buildAuditCsv(rows: AuditRow[], meta: ReportMeta): string {
  const header = [
    "created_at",
    "kind",
    "entity_type",
    "entity_id",
    "action",
    "summary",
    "actor_id",
    "reason",
    "correlation_id",
    "source_table",
    "source_id",
  ];
  const metaLines = [
    `# report=${meta.report_key}`,
    `# version=${meta.report_version}`,
    `# generated_at=${meta.generated_at}`,
    `# data_cutoff=${meta.data_cutoff}`,
    `# generated_by_version=${meta.generated_by_version}`,
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) =>
    [
      r.created_at,
      r.kind,
      r.entity_type,
      r.entity_id,
      r.action,
      r.summary,
      r.actor_id,
      r.reason,
      r.correlation_id,
      r.source_table,
      r.source_id,
    ]
      .map(esc)
      .join(","),
  );
  return [...metaLines, header.join(","), ...body].join("\n");
}

export function downloadAuditCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
