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
import { triggerMarketRateRefresh, useLatestMarketRates, rateFreshness, pickDisplayRate } from "@/lib/market-rates";
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
            {(["AED","USD"] as const).map((c) => {
              const { row } = pickDisplayRate(latest.data, c);
              const bonbastRow = latest.data?.find((r) => r.currency === c && r.source === "bonbast");
              const f = rateFreshness(bonbastRow?.fetched_at);
              return (
                <div key={c} className="text-xs flex items-center justify-between">
                  <span className="font-mono">{c} · bonbast</span>
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
        </CardContent>
      </Card>

      <ManualRatesCard />
    </>
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