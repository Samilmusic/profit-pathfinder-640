import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { triggerMarketRateRefresh, useLatestMarketRates, rateFreshness, pickDisplayRate, useMarketRateFetches } from "@/lib/market-rates";
import { MARKET_CURRENCIES } from "@/lib/market-currencies";
import { useState } from "react";
import { fmt } from "@/lib/exchange";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings" as any).select("*").limit(1).maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Record<string, any>;
    },
  });

  const method: string = q.data?.profit_recognition_method ?? "cycle";
  const mrSource: string = q.data?.market_rate_source ?? "bonbast";
  const mrRefresh: number = q.data?.market_rate_refresh_minutes ?? 5;
  const mrFallback: boolean = q.data?.market_rate_manual_fallback ?? true;

  const save = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await supabase.from("app_settings" as any)
        .upsert({ id: true, ...patch }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Setting updated");
      qc.invalidateQueries({ queryKey: ["app_settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const latest = useLatestMarketRates();
  const refresh = useMutation({
    mutationFn: triggerMarketRateRefresh,
    onSuccess: () => { toast.success("Market rates refreshed"); qc.invalidateQueries({ queryKey: ["market_rates_latest"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Refresh failed"),
  });

  return (
    <>
      <PageHeader title="Settings" description="System-wide accounting preferences." />
      <Card className="max-w-2xl mb-6">
        <CardHeader><CardTitle>Profit recognition method</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose how profit is recognised for AED→IRR→AED style trades.
          </p>
          <RadioGroup value={method} onValueChange={(v) => save.mutate({ profit_recognition_method: v })} className="space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/40">
              <RadioGroupItem value="cycle" id="m-cycle" className="mt-1" />
              <div>
                <Label htmlFor="m-cycle" className="font-medium cursor-pointer">Cycle profit (recommended)</Label>
                <div className="text-xs text-muted-foreground mt-1">
                  Profit is only realised when capital returns to its initial currency (e.g. AED→IRR→AED).
                  Sells create an open Trade Cycle; profit becomes final on buyback.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/40">
              <RadioGroupItem value="instant" id="m-instant" className="mt-1" />
              <div>
                <Label htmlFor="m-instant" className="font-medium cursor-pointer">Instant trading profit</Label>
                <div className="text-xs text-muted-foreground mt-1">
                  Every sell realises profit immediately using FIFO cost vs sell rate. No cycle is opened.
                </div>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Market Rate Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reference rates shown in the dashboard and forms. Transaction rates always remain manually editable.
          </p>
          <RadioGroup value={mrSource} onValueChange={(v) => save.mutate({ market_rate_source: v })} className="space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/40">
              <RadioGroupItem value="bonbast" id="mr-bonbast" className="mt-1" />
              <div>
                <Label htmlFor="mr-bonbast" className="font-medium cursor-pointer">Bonbast (default)</Label>
                <div className="text-xs text-muted-foreground mt-1">Scraped every 5 minutes from bonbast.com — AED & USD versus IRR.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/40">
              <RadioGroupItem value="manual" id="mr-manual" className="mt-1" />
              <div>
                <Label htmlFor="mr-manual" className="font-medium cursor-pointer">Manual only</Label>
                <div className="text-xs text-muted-foreground mt-1">Disable auto reference — always type the rate yourself.</div>
              </div>
            </label>
          </RadioGroup>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-medium">Refresh interval</Label>
              <div className="text-xs text-muted-foreground">Server cron currently runs every 5 minutes.</div>
            </div>
            <Input
              type="number"
              min={1}
              className="w-24 h-9"
              value={mrRefresh}
              onChange={(e) => save.mutate({ market_rate_refresh_minutes: Number(e.target.value) || 5 })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-medium">Manual fallback</Label>
              <div className="text-xs text-muted-foreground">Keep manual rate entry enabled even when auto source fails.</div>
            </div>
            <Switch
              checked={mrFallback}
              onCheckedChange={(v) => save.mutate({ market_rate_manual_fallback: v })}
            />
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Current status</Label>
              <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} />
                Refresh now
              </Button>
            </div>
            {MARKET_CURRENCIES.map((cfg) => {
              const c = cfg.code;
              const bonbastRow = latest.data?.find((r) => r.currency === c && r.source === "bonbast");
              const f = rateFreshness(bonbastRow?.fetched_at);
              return (
                <div key={c} className="text-xs flex items-center justify-between">
                  <span className="font-mono">{cfg.flag} {c} · bonbast</span>
                  <span className={f.tone === "ok" ? "text-emerald-600" : f.tone === "warn" ? "text-amber-600" : "text-red-600"}>
                    {f.label}{bonbastRow?.fetched_at ? ` · ${new Date(bonbastRow.fetched_at).toLocaleString()}` : ""}
                    {bonbastRow?.error_message ? ` · ${bonbastRow.error_message}` : ""}
                  </span>
                </div>
              );
            })}
            <div className="text-[11px] text-muted-foreground pt-1 border-t">
              Display fallback: bonbast if fresh, otherwise manual (if set), otherwise last bonbast value.
            </div>
          </div>

          <FetchStatsBlock refreshMinutes={mrRefresh} />
        </CardContent>
      </Card>

      <ManualRatesCard />
      <AlertThresholdsCard />
      <RecalculateCard />
    </>
  );
}

function RecalculateCard() {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_recalculate_balances");
      if (error) throw error;
      return data as { lots_removed: number; ledger_entries_removed: number };
    },
    onSuccess: (r) => {
      toast.success(`Recalculated — removed ${r?.lots_removed ?? 0} orphan lot(s), ${r?.ledger_entries_removed ?? 0} ledger entries.`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Recalculate failed"),
  });
  return (
    <Card className="max-w-2xl mt-6">
      <CardHeader><CardTitle>Admin — Recalculate balances</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Purge inventory lots and ledger entries left behind by cancelled or deleted
          brought-in / buy records, then rebuild account balances and inventory from
          valid data only. Financial history is preserved (soft-deleted rows remain in
          the audit log).
        </p>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? "Recalculating…" : "Recalculate balances"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AlertThresholdsCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["app_settings_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings" as any)
        .select("alert_drop_pct_15min,alert_rise_pct_15min,alert_volatility_pct_1h,alert_stale_minutes,alert_near_cost_pct")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Record<string, any>;
    },
  });
  const save = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await supabase.from("app_settings" as any).upsert({ id: true, ...patch }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert threshold saved");
      qc.invalidateQueries({ queryKey: ["app_settings_alerts"] });
      qc.invalidateQueries({ queryKey: ["alert_thresholds"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const rows: Array<{ key: string; label: string; hint: string; suffix: string; step: number; def: number }> = [
    { key: "alert_drop_pct_15min", label: "Rate drop alert", hint: "Notify when a currency drops this % in 15 minutes.", suffix: "%", step: 0.1, def: 0.5 },
    { key: "alert_rise_pct_15min", label: "Rate rise alert", hint: "Notify when a currency rises this % in 15 minutes.", suffix: "%", step: 0.1, def: 0.5 },
    { key: "alert_volatility_pct_1h", label: "High volatility", hint: "Notify when |Δ| ≥ this % over 1 hour.", suffix: "%", step: 0.1, def: 1 },
    { key: "alert_stale_minutes", label: "Stale rate threshold", hint: "Minutes without a fresh fetch before flagging stale.", suffix: "min", step: 1, def: 15 },
    { key: "alert_near_cost_pct", label: "Near-cost warning", hint: "Warn when market is within this % of average inventory cost.", suffix: "%", step: 0.1, def: 0.3 },
  ];

  return (
    <Card className="max-w-2xl mb-6">
      <CardHeader><CardTitle>Market alert thresholds</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between rounded-lg border p-3 gap-3">
            <div className="min-w-0">
              <Label className="font-medium">{r.label}</Label>
              <div className="text-xs text-muted-foreground">{r.hint}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Input
                type="number"
                step={r.step}
                className="w-24 h-9 font-mono text-right"
                defaultValue={q.data?.[r.key] ?? r.def}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) save.mutate({ [r.key]: v });
                }}
              />
              <span className="text-xs text-muted-foreground">{r.suffix}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FetchStatsBlock({ refreshMinutes }: { refreshMinutes: number }) {
  const q = useMarketRateFetches(10);
  const last = q.data?.[0];
  const nextAt = last?.started_at
    ? new Date(new Date(last.started_at).getTime() + (refreshMinutes || 5) * 60_000)
    : null;
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <Label className="font-medium">Auto-refresh log</Label>
      {!last ? (
        <div className="text-xs text-muted-foreground">No fetches recorded yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Last fetch</div>
            <div className="font-mono">{new Date(last.started_at).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Duration</div>
            <div className="font-mono">{last.duration_ms != null ? `${last.duration_ms} ms` : "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Result</div>
            <div className="font-mono">
              <span className="text-emerald-600">{last.success_count} ok</span>
              {" · "}
              <span className={last.failed_count > 0 ? "text-red-600" : "text-muted-foreground"}>
                {last.failed_count} failed
              </span>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <div className="text-[10px] uppercase text-muted-foreground">Next scheduled</div>
            <div className="font-mono">{nextAt ? nextAt.toLocaleString() : "—"}</div>
          </div>
          {last.error_message && (
            <div className="col-span-2 sm:col-span-3 text-[11px] text-red-600 break-all">
              {last.error_message}
            </div>
          )}
        </div>
      )}
      {q.data && q.data.length > 1 && (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">Recent history</summary>
          <div className="mt-1 space-y-1">
            {q.data.slice(1).map((f) => (
              <div key={f.id} className="flex justify-between font-mono">
                <span>{new Date(f.started_at).toLocaleString()}</span>
                <span>
                  {f.success_count} ok · {f.failed_count} failed
                  {f.duration_ms != null ? ` · ${f.duration_ms}ms` : ""}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ManualRatesCard() {
  const qc = useQueryClient();
  const latest = useLatestMarketRates();

  const save = useMutation({
    mutationFn: async ({ currency, buy, sell }: { currency: string; buy: number; sell: number }) => {
      const mid = (buy + sell) / 2;
      const { error } = await supabase.from("market_rates" as any).insert({
        source: "manual",
        currency,
        buy_rate: buy,
        sell_rate: sell,
        mid_rate: mid,
        status: "ok",
        raw_response: { entered_by: "admin" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manual rate saved");
      qc.invalidateQueries({ queryKey: ["market_rates_latest"] });
      qc.invalidateQueries({ queryKey: ["market_rate_history"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  return (
    <Card className="max-w-2xl mt-6">
      <CardHeader>
        <CardTitle>Admin Manual Rates (fallback)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Set manual AED/USD rates against IRR. These are used automatically whenever bonbast is unavailable or stale.
        </p>
        {(["AED","USD"] as const).map((c) => {
          const existing = latest.data?.find((r) => r.currency === c && r.source === "manual");
          return <ManualRateRow key={c} currency={c} existing={existing} onSave={(buy, sell) => save.mutate({ currency: c, buy, sell })} saving={save.isPending} />;
        })}
      </CardContent>
    </Card>
  );
}

function ManualRateRow({
  currency,
  existing,
  onSave,
  saving,
}: {
  currency: string;
  existing: any;
  onSave: (buy: number, sell: number) => void;
  saving: boolean;
}) {
  const [buy, setBuy] = useState<string>(existing?.buy_rate?.toString() ?? "");
  const [sell, setSell] = useState<string>(existing?.sell_rate?.toString() ?? "");
  const disabled = !buy || !sell || Number(buy) <= 0 || Number(sell) <= 0 || saving;
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="font-medium">{currency} / IRR</Label>
        {existing?.fetched_at && (
          <span className="text-[10px] text-muted-foreground">
            Last saved {new Date(existing.fetched_at).toLocaleString()} — buy {fmt(existing.buy_rate)} · sell {fmt(existing.sell_rate)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 items-end">
        <div>
          <Label className="text-[11px] text-muted-foreground">Buy rate</Label>
          <Input type="number" inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="e.g. 48150" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Sell rate</Label>
          <Input type="number" inputMode="decimal" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="e.g. 48200" />
        </div>
        <Button size="sm" disabled={disabled} onClick={() => onSave(Number(buy), Number(sell))}>
          Save {currency}
        </Button>
      </div>
    </div>
  );
}