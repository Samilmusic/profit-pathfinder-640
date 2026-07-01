import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Eye, Pencil, History, XCircle, MoreHorizontal } from "lucide-react";
import { EditReasonDialog } from "@/components/edit-reason-dialog";
import { HistoryDialog } from "@/components/history-dialog";
import { GenericEditDialog, type EditField } from "@/components/generic-edit-dialog";
import { cancelRecord } from "@/lib/audit";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function RecordActions({
  table,
  row,
  fields,
  onView,
  invalidateKeys = [],
  canCancel = true,
}: {
  table: string;
  row: any;
  fields: EditField[];
  onView?: () => void;
  invalidateKeys?: string[];
  canCancel?: boolean;
}) {
  const qc = useQueryClient();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [reason, setReason] = useState("");

  const doCancel = async () => {
    try {
      await cancelRecord(table, row.id, cancelReason);
      toast.success("Cancelled");
      for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      setCancelOpen(false);
      setCancelReason("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onView && (
            <DropdownMenuItem onClick={onView}><Eye className="h-4 w-4 mr-2" /> View</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setReasonOpen(true)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setHistoryOpen(true)}><History className="h-4 w-4 mr-2" /> History</DropdownMenuItem>
          {canCancel && !row.deleted_at && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCancelOpen(true)} className="text-destructive focus:text-destructive">
                <XCircle className="h-4 w-4 mr-2" /> Cancel record
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditReasonDialog
        open={reasonOpen}
        onOpenChange={setReasonOpen}
        title="Reason for edit"
        confirmLabel="Open editor"
        onConfirm={(r) => { setReason(r); setReasonOpen(false); setEditOpen(true); }}
      />
      <GenericEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        table={table}
        row={row}
        fields={fields}
        reason={reason}
        invalidateKeys={invalidateKeys}
      />
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        entityType={table}
        entityId={row?.id ?? null}
      />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this record?</AlertDialogTitle>
            <AlertDialogDescription>
              The record is not deleted — it is marked as cancelled and stays in the audit log. A reason is mandatory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="pt-2">
            <label className="text-xs text-muted-foreground">Reason for cancel</label>
            <textarea
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Duplicate transaction, wrong customer, entered by mistake…"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction disabled={!cancelReason.trim()} onClick={doCancel}>Cancel record</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}