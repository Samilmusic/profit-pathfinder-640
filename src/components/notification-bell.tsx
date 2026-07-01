import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMarketNotifications, useMarketRateDeltas, useInventoryExposure, useAlertThresholds, rateFreshness } from "@/lib/market-rates";
import { cn } from "@/lib/utils";

/**
 * Header notification bell.
 * Combines stored notifications with derived live market alerts
 * (stale rates, sharp movements, below-cost inventory) so the operator
 * always sees them even when no row has been persisted yet.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const notifQ = useMarketNotifications(30);
  const deltasQ = useMarketRateDeltas();
  const exposureQ = useInventoryExposure();
  const thresholdsQ = useAlertThresholds();

  const derived = useMemo(() => {
    const t = thresholdsQ.data;
    if (!t) return [] as Array<{ id: string; title: string; severity: "warn" | "danger" }>;
    const out: Array<{ id: string; title: string; severity: "warn" | "danger" }> = [];
    for (const d of deltasQ.data ?? []) {
      const fresh = rateFreshness(d.fetched_at);
      if (fresh.minutes > t.alert_stale_minutes)
        out.push({ id: `stale-${d.currency}`, title: `${d.currency} rate is stale`, severity: "warn" });
      if (d.pct_15m != null && d.pct_15m <= -t.alert_drop_pct_15min)
        out.push({ id: `drop-${d.currency}`, title: `${d.currency} dropped ${d.pct_15m.toFixed(2)}% (15m)`, severity: "danger" });
      if (d.pct_15m != null && d.pct_15m >= t.alert_rise_pct_15min)
        out.push({ id: `rise-${d.currency}`, title: `${d.currency} rising ${d.pct_15m.toFixed(2)}% (15m)`, severity: "warn" });
    }
    for (const e of exposureQ.data ?? []) {
      if (e.market_mid == null || e.avg_cost <= 0) continue;
      const pct = ((e.market_mid - e.avg_cost) / e.avg_cost) * 100;
      if (pct <= 0) out.push({ id: `below-${e.currency}`, title: `${e.currency} below cost`, severity: "danger" });
      else if (pct <= t.alert_near_cost_pct)
        out.push({ id: `near-${e.currency}`, title: `${e.currency} near cost (+${pct.toFixed(2)}%)`, severity: "warn" });
    }
    return out;
  }, [deltasQ.data, exposureQ.data, thresholdsQ.data]);

  const unreadStored = (notifQ.data ?? []).filter((n) => !n.read_at).length;
  const totalAlerts = derived.length + unreadStored;

  const markAllRead = useMutation({
    mutationFn: async () => {
      const ids = (notifQ.data ?? []).filter((n) => !n.read_at).map((n) => n.id);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("market_notifications" as any)
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["market_notifications"] }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0">
          <Bell className="h-4 w-4" />
          {totalAlerts > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold grid place-items-center text-white",
                derived.some((d) => d.severity === "danger") ? "bg-red-500" : "bg-amber-500",
              )}
            >
              {totalAlerts > 99 ? "99+" : totalAlerts}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="font-semibold text-sm">Notifications</div>
          {unreadStored > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => markAllRead.mutate()}>
              <CheckCheck className="h-3 w-3 mr-1" /> Mark read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          <div className="p-2 space-y-1.5">
            {derived.length === 0 && (notifQ.data ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">All clear — no active alerts.</div>
            )}
            {derived.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "rounded-md border p-2 text-xs",
                  a.severity === "danger" ? "bg-red-500/10 border-red-500/30" : "bg-amber-500/10 border-amber-500/30",
                )}
              >
                <div className="font-medium">{a.title}</div>
                <div className="text-[10px] text-muted-foreground">Live market check</div>
              </div>
            ))}
            {(notifQ.data ?? []).map((n) => (
              <div
                key={n.id}
                className={cn(
                  "rounded-md border p-2 text-xs",
                  !n.read_at && "bg-primary/5 border-primary/20",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{n.title}</div>
                  {!n.read_at && (
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      new
                    </Badge>
                  )}
                </div>
                {n.body && <div className="text-muted-foreground mt-0.5">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="p-2 border-t">
          <Button asChild size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => setOpen(false)}>
            <Link to="/market-intelligence">Open Market Intelligence</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}