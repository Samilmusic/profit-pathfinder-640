import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  runRemittanceV2Reconciliation,
  type ReconCheck,
} from "@/lib/remittance-v2-recon.functions";
import { toast } from "sonner";

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
    return <div className="p-6 text-sm text-muted-foreground">Checking permissions…</div>;
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

  type FlagRow = { key: string; enabled: boolean; updated_at?: string };
  type BatchRow = {
    id: string;
    started_at?: string | null;
    finished_at?: string | null;
    note?: string | null;
    total_scanned?: number | null;
    total_shadow_inserted?: number | null;
    total_skipped?: number | null;
    total_errors?: number | null;
  };
  const flags = (flagsQ.data ?? []) as FlagRow[];
  const flagMap = new Map(flags.map((f) => [f.key, f] as const));
  const v2Flag = flagMap.get("remittance_v2_enabled");
  const postingFlag = flagMap.get("allocation_layer_posting");

  const audit = auditQ.data;
  const totalAudit = audit?.total ?? 0;
  const migrated = totalAudit;
  const approved = audit?.byCategory["matched"] ?? 0;
  const blocked =
    (audit?.byCategory["over_allocated"] ?? 0) + (audit?.byCategory["missing_buy"] ?? 0);
  const batchesData = (batchesQ.data ?? []) as unknown as BatchRow[];
  const batchErrors = batchesData.reduce(
    (sum, b) => sum + (b.total_errors ?? 0),
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

      {/* Reconciliation */}
      <ReconciliationPanel />

      {/* Counters */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Migrated rows" value={migrated} />
        <Stat label="Approved" value={approved} />
        <Stat label="Blocked" value={blocked} />
        <Stat label="Batch errors" value={batchErrors} />
        <Stat label="Batches" value={batches.length} hint="last 20 shown" />
      </div>

      {/* Audit + batches unchanged */}
      <LegacyAuditAndBatches
        auditLoading={auditLoading}
        batchesLoading={batchesLoading}
        batches={batchesData}
        totalAudit={totalAudit}
        audit={audit}
      />
    </div>
  );
}

function ReconciliationPanel() {
  const [results, setResults] = useState<ReconCheck[] | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const runMutation = useMutation({
    mutationFn: runRemittanceV2Reconciliation,
    onSuccess: (data) => {
      setResults(data);
      setLastRunAt(new Date());
      const failed = data.filter((c) => !c.passed).length;
      if (failed === 0) toast.success("Reconciliation passed all checks");
      else toast.warning(`Reconciliation completed — ${failed} check(s) failed`);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Reconciliation failed");
    },
  });

  const failedCritical = (results ?? []).filter(
    (c) => !c.passed && c.severity === "critical",
  ).length;
  const failedWarning = (results ?? []).filter((c) => !c.passed && c.severity === "warning").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Reconciliation suite</CardTitle>
          <div className="flex items-center gap-2">
            {lastRunAt ? (
              <span className="text-xs text-muted-foreground">
                Last run {lastRunAt.toLocaleString()}
              </span>
            ) : null}
            <Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
              {runMutation.isPending ? "Running…" : "Run reconciliation"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {results === null ? (
          <p className="text-sm text-muted-foreground">
            Reconciliation has not been run in this session. Nightly automation is optional — you
            can run the full suite on demand at any time.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={failedCritical === 0 ? "default" : "destructive"}>
                Critical failures: {failedCritical}
              </Badge>
              <Badge variant={failedWarning === 0 ? "default" : "secondary"}>
                Warnings: {failedWarning}
              </Badge>
              <Badge variant="secondary">Total checks: {results.length}</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Check</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((c) => (
                    <TableRow key={c.check_id}>
                      <TableCell className="tabular-nums text-xs">{c.check_id}</TableCell>
                      <TableCell className="font-mono text-xs">{c.check_name}</TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground">
                        {c.severity}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            c.passed
                              ? "default"
                              : c.severity === "critical"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {c.passed ? "PASS" : "FAIL"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{c.delta}</TableCell>
                      <TableCell className="max-w-[36ch] truncate text-xs text-muted-foreground">
                        <code>{JSON.stringify(c.details)}</code>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              This suite is also executable directly as
              <code className="mx-1">select * from public.remittance_v2_reconcile();</code>
              (admin session required). Nightly scheduling via pg_cron is optional and not required
              for the system to operate.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type LegacyBatchRow = {
  id: string;
  started_at?: string | null;
  finished_at?: string | null;
  note?: string | null;
  total_scanned?: number | null;
  total_shadow_inserted?: number | null;
  total_skipped?: number | null;
  total_errors?: number | null;
};

function LegacyAuditAndBatches({
  auditLoading,
  batchesLoading,
  batches,
  totalAudit,
  audit,
}: {
  auditLoading: boolean;
  batchesLoading: boolean;
  batches: LegacyBatchRow[];
  totalAudit: number;
  audit: { total: number; byCategory: Record<string, number> } | undefined;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Migration audit</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
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
              <p className="text-xs text-muted-foreground">
                Legacy adoption is intentionally not exposed here. It is a separate administrative
                migration project, run after production stabilization.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent batches</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {batchesLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : (batches.length) === 0 ? (
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
                {batches.map((b: LegacyBatchRow) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {b.started_at ? new Date(b.started_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {b.finished_at ? new Date(b.finished_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">{b.total_scanned ?? 0}</TableCell>
                    <TableCell className="text-right">{b.total_shadow_inserted ?? 0}</TableCell>
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
    </>
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
      <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "ON" : "OFF"}</Badge>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
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
