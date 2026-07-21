import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/migration-status")({
  component: MigrationStatusPage,
});

function MigrationStatusPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: uid,
        _role: "admin",
      });
      if (!cancelled) setIsAdmin(!error && data === true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flagsQ = useQuery({
    enabled: isAdmin === true,
    queryKey: ["migration_status", "flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_feature_flags")
        .select("key,enabled,updated_at")
        .in("key", ["remittance_v2_enabled", "allocation_layer_posting"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const batchesQ = useQuery({
    enabled: isAdmin === true,
    queryKey: ["migration_status", "batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_migration_batches")
        .select(
          "id,started_at,finished_at,note,total_scanned,total_shadow_inserted,total_skipped,total_errors,created_by",
        )
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const auditQ = useQuery({
    enabled: isAdmin === true,
    queryKey: ["migration_status", "audit_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_migration_audit")
        .select("diff_category");
      if (error) throw error;
      const rows = data ?? [];
      const byCategory: Record<string, number> = {};
      for (const r of rows as Array<{ diff_category: string | null }>) {
        const c = r.diff_category ?? "uncategorized";
        byCategory[c] = (byCategory[c] ?? 0) + 1;
      }
      return { total: rows.length, byCategory };
    },
  });

  if (isAdmin === null) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Checking permissions…</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <PageHeader title="Migration Status" description="Admin only." />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Access restricted. This page is available to administrators only.
          </CardContent>
        </Card>
      </div>
    );
  }

  const flags = flagsQ.data ?? [];
  const flagMap = new Map(flags.map((f: any) => [f.key, f]));
  const v2Flag = flagMap.get("remittance_v2_enabled");
  const postingFlag = flagMap.get("allocation_layer_posting");

  const audit = auditQ.data;
  const totalAudit = audit?.total ?? 0;
  const migrated = totalAudit;
  const approved = audit?.byCategory["matched"] ?? 0;
  const blocked =
    (audit?.byCategory["over_allocated"] ?? 0) +
    (audit?.byCategory["missing_buy"] ?? 0);
  const batchErrors = (batchesQ.data ?? []).reduce(
    (sum: number, b: any) => sum + (b.total_errors ?? 0),
    0,
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Migration Status"
        description="Read-only view of the remittance allocation-layer migration."
      />

      {/* Feature flags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FlagRow label="remittance_v2_enabled" flag={v2Flag} />
          <FlagRow label="allocation_layer_posting" flag={postingFlag} />
          <p className="text-xs text-muted-foreground">
            Flags are managed by administrators. This page does not change them.
          </p>
        </CardContent>
      </Card>

      {/* Counters */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Migrated rows" value={migrated} />
        <Stat label="Approved" value={approved} />
        <Stat label="Blocked" value={blocked} />
        <Stat label="Batch errors" value={batchErrors} />
        <Stat
          label="Batches"
          value={batchesQ.data?.length ?? 0}
          hint="last 20 shown"
        />
      </div>

      {/* Empty state / audit rows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Migration audit</CardTitle>
        </CardHeader>
        <CardContent>
          {auditQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : totalAudit === 0 ? (
            <div className="text-sm text-muted-foreground">
              No legacy remittances require migration.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(audit!.byCategory).map(([k, v]) => (
                  <Badge key={k} variant="secondary">
                    {k}: {v}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled title="Enabled in Phase 4">
                  Approve
                </Button>
                <Button size="sm" variant="outline" disabled title="Enabled in Phase 4">
                  Block
                </Button>
                <Button size="sm" variant="outline" disabled title="Enabled in Phase 4">
                  Amend
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Approve / Block / Amend actions become active in Phase 4.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent batches</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {batchesQ.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : (batchesQ.data?.length ?? 0) === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No batches yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead className="text-right">Scanned</TableHead>
                  <TableHead className="text-right">Shadow inserted</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchesQ.data!.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {b.started_at ? new Date(b.started_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {b.finished_at ? new Date(b.finished_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">{b.total_scanned ?? 0}</TableCell>
                    <TableCell className="text-right">
                      {b.total_shadow_inserted ?? 0}
                    </TableCell>
                    <TableCell className="text-right">{b.total_skipped ?? 0}</TableCell>
                    <TableCell className="text-right">{b.total_errors ?? 0}</TableCell>
                    <TableCell className="max-w-[24ch] truncate text-xs text-muted-foreground">
                      {b.note ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FlagRow({
  label,
  flag,
}: {
  label: string;
  flag: { key: string; enabled: boolean; updated_at?: string } | undefined;
}) {
  const enabled = flag?.enabled === true;
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <div className="font-mono text-xs">{label}</div>
        {flag?.updated_at ? (
          <div className="text-xs text-muted-foreground">
            Updated {new Date(flag.updated_at).toLocaleString()}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Not set</div>
        )}
      </div>
      <Badge variant={enabled ? "default" : "secondary"}>
        {enabled ? "ON" : "OFF"}
      </Badge>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? (
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {hint}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}