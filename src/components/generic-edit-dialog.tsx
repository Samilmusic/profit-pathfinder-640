import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { withEditReason } from "@/lib/audit";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export type EditField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select";
  step?: string;
  options?: { value: string; label: string }[];
};

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
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Reason: <span className="text-foreground font-medium">{reason}</span>
        </p>
        <div className="grid md:grid-cols-2 gap-3 pt-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
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
          <Button onClick={save} disabled={busy}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}