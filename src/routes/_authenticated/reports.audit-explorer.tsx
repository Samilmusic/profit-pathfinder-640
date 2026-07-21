import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download, Printer, RefreshCw, Search, ShieldCheck, Loader2 } from "lucide-react";
import {
  AUDIT_KINDS,
  buildAuditCsv,
  downloadAuditCsv,
  fetchAuditActors,
  fetchAuditEventDetail,
  fetchAuditTimeline,
  type AuditDetail,
  type AuditKind,
  type AuditRow,
} from "@/lib/reports/audit.functions";

export const Route = createFileRoute("/_authenticated/reports/audit-explorer")({
  head: () => ({
    meta: [
      { title: "Audit Explorer — Reports" },
      {
        name: "description",
        content:
          "Read-only chronological timeline of workflow, settlement, allocation, posting, and permission events.",
      },
    ],
  }),
  component: AuditExplorerPage,
});

const kindColor: Record<AuditKind, string> = {
  workflow: "bg-blue-50 text-blue-700 border-blue-200",
  settlement: "bg-violet-50 text-violet-700 border-violet-200",
  allocation: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reversal: "bg-red-50 text-red-700 border-red-200",
  posting: "bg-amber-50 text-amber-800 border-amber-200",
  profit: "bg-teal-50 text-teal-700 border-teal-200",
  feature_flag: "bg-slate-50 text-slate-700 border-slate-200",
  permission: "bg-rose-50 text-rose-700 border-rose-200",
  entity_change: "bg-gray-50 text-gray-700 border-gray-200",
};

function AuditExplorerPage() {
  const [kinds, setKinds] = useState<AuditKind[]>([]);
  const [actor, setActor] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const actorsQ = useQuery({
    queryKey: ["audit-actors"],
    queryFn: fetchAuditActors,
    staleTime: 60_000,
  });

  const args = useMemo(
    () => ({
      kinds: kinds.length ? kinds : null,
      actor: actor || null,
      entity_type: entityType.trim() || null,
      entity_id: entityId.trim() || null,
      from: from ? new Date(from).toISOString() : null,
      to: to ? new Date(to).toISOString() : null,
      search: search || null,
    }),
    [kinds, actor, entityType, entityId, from, to, search],
  );

  const timelineQ = useInfiniteQuery({
    queryKey: ["audit-timeline", args],
    initialPageParam: null as { ts: string; id: string } | null,
    queryFn: ({ pageParam }) => fetchAuditTimeline({ ...args, limit: 100, cursor: pageParam }),
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    staleTime: 15_000,
  });

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && timelineQ.hasNextPage && !timelineQ.isFetchingNextPage) {
        timelineQ.fetchNextPage();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [timelineQ]);

  const rows = useMemo<AuditRow[]>(
    () => timelineQ.data?.pages.flatMap((p) => p.rows) ?? [],
    [timelineQ.data],
  );
  const meta = timelineQ.data?.pages[0]?.meta;

  function toggleKind(k: AuditKind) {
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  function resetFilters() {
    setKinds([]);
    setActor(null);
    setEntityType("");
    setEntityId("");
    setFrom("");
    setTo("");
    setSearchInput("");
    setSearch("");
  }

  function exportCsv() {
    if (!meta) return;
    const csv = buildAuditCsv(rows, meta);
    downloadAuditCsv(`audit-timeline-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Audit Explorer"
        description="Read-only chronological timeline. Immutable. Admin/manager only."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Immutable
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => timelineQ.refetch()}
              disabled={timelineQ.isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${timelineQ.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {AUDIT_KINDS.map((k) => {
              const on = kinds.includes(k.value);
              return (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => toggleKind(k.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    on
                      ? kindColor[k.value]
                      : "bg-background text-muted-foreground border-input hover:bg-muted"
                  }`}
                >
                  {k.label}
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Actor</Label>
              <Select
                value={actor ?? "any"}
                onValueChange={(v) => setActor(v === "any" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any user</SelectItem>
                  {actorsQ.data?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.display_name || a.email || a.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Entity type</Label>
              <Input
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                placeholder="e.g. remittance"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Entity ID</Label>
              <Input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="uuid"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Search</Label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(searchInput.trim());
                }}
                className="flex gap-1"
              >
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Summary / reason / payload"
                />
                <Button type="submit" size="icon" variant="outline">
                  <Search className="h-4 w-4" />
                </Button>
              </form>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="sm:col-span-2 lg:col-span-2 flex items-end">
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Timeline
            <span className="text-xs text-muted-foreground font-normal">
              {rows.length} event{rows.length === 1 ? "" : "s"} loaded
              {meta ? ` · v${meta.report_version}` : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {timelineQ.isError && (
            <div className="p-6 text-sm text-red-600">
              {(timelineQ.error as Error)?.message ?? "Failed to load timeline"}
            </div>
          )}
          {!timelineQ.isError && rows.length === 0 && !timelineQ.isLoading && (
            <div className="p-8 text-sm text-muted-foreground text-center">
              No events match the current filters.
            </div>
          )}
          <ul className="divide-y">
            {rows.map((r) => (
              <li
                key={r.event_id}
                className="p-4 hover:bg-muted/50 cursor-pointer"
                onClick={() => setSelected(r)}
              >
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className={`${kindColor[r.kind]} shrink-0`}>
                    {r.kind}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.summary}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                      <span>
                        {r.entity_type}
                        {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}
                      </span>
                      {r.actor_id && <span>actor: {r.actor_id.slice(0, 8)}</span>}
                      {r.reason && <span className="italic truncate max-w-xs">“{r.reason}”</span>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div ref={sentinelRef} className="p-4 text-center text-xs text-muted-foreground">
            {timelineQ.isFetchingNextPage ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading more…
              </span>
            ) : timelineQ.hasNextPage ? (
              "Scroll for more"
            ) : rows.length > 0 ? (
              "End of timeline"
            ) : timelineQ.isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <EventDetailDialog row={selected} onOpenChange={(o) => !o && setSelected(null)} />

      <p className="text-xs text-muted-foreground">
        Known limitations: login events and Postgres-level auth are stored in Supabase analytics
        logs and are not part of this timeline. Reconciliation runs are non-mutating and only
        surface here if they produce audit rows.
      </p>
    </div>
  );
}

function EventDetailDialog({
  row,
  onOpenChange,
}: {
  row: AuditRow | null;
  onOpenChange: (o: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ["audit-detail", row?.kind, row?.source_id],
    queryFn: () => fetchAuditEventDetail(row!.kind, row!.source_id),
    enabled: !!row,
    staleTime: 60_000,
  });

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {row && (
              <Badge variant="outline" className={kindColor[row.kind]}>
                {row.kind}
              </Badge>
            )}
            <span className="truncate">{row?.summary}</span>
          </DialogTitle>
          <DialogDescription>
            {row && new Date(row.created_at).toLocaleString()} · {row?.entity_type}
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline" /> Loading…
          </div>
        ) : q.data?.found ? (
          <DetailBody detail={q.data} />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Event not found.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ detail }: { detail: AuditDetail }) {
  const e = detail.event!;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Timestamp" value={new Date(e.created_at).toLocaleString()} />
        <Field
          label="Actor"
          value={detail.actor?.display_name || detail.actor?.email || e.actor_id || "system"}
        />
        <Field label="Entity" value={`${e.entity_type} · ${e.entity_id ?? "—"}`} mono />
        <Field label="Action" value={e.action} />
        <Field label="Correlation ID" value={e.correlation_id ?? "—"} mono />
        <Field label="Reason" value={e.reason ?? "—"} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Before</div>
          <pre className="rounded border bg-muted/40 p-2 text-xs overflow-auto max-h-64">
            {e.before ? JSON.stringify(e.before, null, 2) : "—"}
          </pre>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">After</div>
          <pre className="rounded border bg-muted/40 p-2 text-xs overflow-auto max-h-64">
            {e.after ? JSON.stringify(e.after, null, 2) : "—"}
          </pre>
        </div>
      </div>
      {detail.related && detail.related.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Related records ({detail.related.length})
          </div>
          <ul className="divide-y border rounded">
            {detail.related.map((r) => (
              <li key={r.event_id} className="p-2 text-xs flex gap-2">
                <Badge variant="outline" className={`${kindColor[r.kind]} shrink-0`}>
                  {r.kind}
                </Badge>
                <span className="flex-1 truncate">{r.summary}</span>
                <span className="text-muted-foreground shrink-0">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`${mono ? "font-mono text-xs" : "text-sm"} break-all`}>{value}</div>
    </div>
  );
}
