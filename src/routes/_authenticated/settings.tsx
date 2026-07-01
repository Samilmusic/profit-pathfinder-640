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
import { triggerMarketRateRefresh, useLatestMarketRates, rateFreshness, findRate } from "@/lib/market-rates";
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
      const { data, error } = await supabase.from("app_settings" as any).select("*");
      if (error) throw error;
      const m: Record<string, string> = {};
      (data ?? []).forEach((r: any) => (m[r.key] = r.value));
      return m;
    },
  });

  const method = q.data?.profit_recognition_method ?? "cycle";
  const mrSource = q.data?.market_rate_source ?? "bonbast";
  const mrRefresh = q.data?.market_rate_refresh_minutes ?? "5";
  const mrFallback = (q.data?.market_rate_manual_fallback ?? "true") === "true";

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase.from("app_settings" as any)
        .upsert({ key, value }, { onConflict: "key" });
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
          <RadioGroup value={method} onValueChange={(v) => save.mutate({ key: "profit_recognition_method", value: v })} className="space-y-3">
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
          <RadioGroup value={mrSource} onValueChange={(v) => save.mutate({ key: "market_rate_source", value: v })} className="space-y-3">
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
              onChange={(e) => save.mutate({ key: "market_rate_refresh_minutes", value: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-medium">Manual fallback</Label>
              <div className="text-xs text-muted-foreground">Keep manual rate entry enabled even when auto source fails.</div>
            </div>
            <Switch
              checked={mrFallback}
              onCheckedChange={(v) => save.mutate({ key: "market_rate_manual_fallback", value: String(v) })}
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
              const row = findRate(latest.data, c);
              const f = rateFreshness(row?.fetched_at);
              return (
                <div key={c} className="text-xs flex items-center justify-between">
                  <span className="font-mono">{c}</span>
                  <span className={f.tone === "ok" ? "text-emerald-600" : f.tone === "warn" ? "text-amber-600" : "text-red-600"}>
                    {f.label}{row?.fetched_at ? ` · ${new Date(row.fetched_at).toLocaleString()}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}