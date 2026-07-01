import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateDailyReport } from "@/lib/ai/brain.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DailyReport() {
  const run = useServerFn(generateDailyReport);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  async function generate() {
    setLoading(true);
    try { setReport(await run()); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <Card className="glass">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-primary" /> Daily AI CEO Report</CardTitle>
        <Button onClick={generate} disabled={loading} size="sm">
          {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Generating…</> : "Generate Today Report"}
        </Button>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        {!report && <p className="text-muted-foreground">Click Generate to build a data-grounded daily brief.</p>}
        {report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {(report.brief.balances?.balances ?? []).slice(0, 4).map((b: any) => (
                <div key={b.currency} className="rounded-lg border p-2">
                  <div className="text-muted-foreground">{b.currency} inventory</div>
                  <div className="font-mono font-semibold">{b.total.toLocaleString()}</div>
                </div>
              ))}
              <div className="rounded-lg border p-2">
                <div className="text-muted-foreground">Realized profit today</div>
                <div className="font-mono font-semibold">{report.brief.profit?.realized_profit ?? 0}</div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-muted-foreground">Pending receipts</div>
                <div className="font-mono font-semibold">{report.brief.pending?.pending?.length ?? 0}</div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-muted-foreground">Open cycles</div>
                <div className="font-mono font-semibold">{report.brief.profit?.open_cycle_count ?? 0}</div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-muted-foreground">Cash with people</div>
                <div className="font-mono font-semibold">{report.brief.cashWith?.holders?.length ?? 0}</div>
              </div>
            </div>
            {report.narrative && (
              <div className="whitespace-pre-wrap text-sm p-3 rounded-lg bg-muted/50 border">{report.narrative}</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}