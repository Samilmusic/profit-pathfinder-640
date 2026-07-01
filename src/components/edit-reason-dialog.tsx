import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EDIT_REASONS } from "@/lib/audit";

export function EditReasonDialog({
  open,
  onOpenChange,
  title = "Reason for edit",
  confirmLabel = "Continue",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [choice, setChoice] = useState("Wrong amount");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const reason = choice === "Other" ? detail.trim() : `${choice}${detail ? ` — ${detail}` : ""}`;
  const disabled = busy || (choice === "Other" && !detail.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Financial records are audited. A reason is mandatory and will be saved permanently.
        </p>
        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs">Reason</Label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EDIT_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{choice === "Other" ? "Describe the reason" : "Additional detail (optional)"}</Label>
            <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Back</Button>
          <Button
            disabled={disabled}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(reason); } finally { setBusy(false); }
            }}
          >{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}