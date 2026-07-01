import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { withEditReason } from "@/lib/audit";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

export type EditField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "boolean" | "account" | "customer" | "trade_cycle";
  step?: string;
  options?: { value: string; label: string }[];
  filterCurrency?: string; // for account picker — narrow by currency (reads a sibling field key)
  optional?: boolean; // allow clearing to null
};

function useOptionSource(kind: "account" | "customer" | "trade_cycle") {
  return useQuery({
    queryKey: ["edit-options", kind],
    staleTime: 60_000,
    queryFn: async () => {
      if (kind === "account") {
        const { data, error } = await supabase.from("accounts")
          .select("id,name,currency,account_type,is_active").is("deleted_at", null).order("name");
        if (error) throw error; return data ?? [];
      }
      if (kind === "customer") {
        const { data, error } = await supabase.from("customers")
          .select("id,name").is("deleted_at", null).order("name");
        if (error) throw error; return data ?? [];
      }
      const { data, error } = await supabase.from("trade_cycles")
        .select("id,code,title,status").is("deleted_at", null).order("entry_date", { ascending: false }).limit(200);
      if (error) throw error; return data ?? [];
    },
  });
}

export function GenericEditDialog({
  open,
  onOpenChange,
  table,
  row,
  fields,
  reason,
  invalidateKeys = [],
  title = "Edit record",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  table: string;
  row: any | null;
  fields: EditField[];
  reason: string;
  invalidateKeys?: string[];
  title?: string;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const accounts = useOptionSource("account");
  const customers = useOptionSource("customer");
  const cycles = useOptionSource("trade_cycle");

  useEffect(() => {
    if (row) {
      const initial: Record<string, any> = {};
      for (const f of fields) initial[f.key] = row[f.key] ?? "";
      setValues(initial);
    }
  }, [row, fields]);

  const save = async () => {
    if (!row) return;
    setBusy(true);
    try {
      // sanitize numbers/dates
      const patch: Record<string, any> = {};
      for (const f of fields) {
        let v = values[f.key];
        if (v === "" || v === undefined) v = null;
        else if (f.type === "number" && v !== null) v = Number(v);
        else if (f.type === "boolean") v = !!v;
        patch[f.key] = v;
      }
      await withEditReason(reason, async () => {
        const { error } = await supabase.from(table as any).update(patch).eq("id", row.id);
        if (error) throw error;
      });
      toast.success("Saved");
      for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Reason: <span className="text-foreground font-medium">{reason}</span>
        </p>
        <div className="flex gap-2 items-start rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-xs">
            This edit will affect accounting balances, inventory lots, trade cycles and reports.
            The previous values are preserved in the audit log.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-3 pt-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              ) : f.type === "boolean" ? (
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={!!values[f.key]} onCheckedChange={(v) => setValues({ ...values, [f.key]: v })} />
                  <span className="text-xs text-muted-foreground">{values[f.key] ? "Yes" : "No"}</span>
                </div>
              ) : f.type === "account" ? (
                <Select
                  value={String(values[f.key] ?? "__none")}
                  onValueChange={(v) => setValues({ ...values, [f.key]: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="— select account —" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {f.optional && <SelectItem value="__none">— none —</SelectItem>}
                    {(accounts.data ?? [])
                      .filter((a: any) => !f.filterCurrency || !values[f.filterCurrency] || a.currency === values[f.filterCurrency])
                      .map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} · {a.currency}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : f.type === "customer" ? (
                <Select
                  value={String(values[f.key] ?? "__none")}
                  onValueChange={(v) => setValues({ ...values, [f.key]: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="— select customer —" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none">— none —</SelectItem>
                    {(customers.data ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "trade_cycle" ? (
                <Select
                  value={String(values[f.key] ?? "__none")}
                  onValueChange={(v) => setValues({ ...values, [f.key]: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="— link a cycle —" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none">— none —</SelectItem>
                    {(cycles.data ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.code || c.title || c.id.slice(0,8)} · {c.status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "select" ? (
                <Select value={String(values[f.key] ?? "")} onValueChange={(v) => setValues({ ...values, [f.key]: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  step={f.step}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}