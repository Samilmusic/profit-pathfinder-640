import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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

  const save = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.from("app_settings" as any)
        .upsert({ key: "profit_recognition_method", value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profit recognition method updated");
      qc.invalidateQueries({ queryKey: ["app_settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  return (
    <>
      <PageHeader title="Settings" description="System-wide accounting preferences." />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Profit recognition method</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose how profit is recognised for AED→IRR→AED style trades.
          </p>
          <RadioGroup value={method} onValueChange={(v) => save.mutate(v)} className="space-y-3">
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
    </>
  );
}