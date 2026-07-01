import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DOC_TYPES, docTypeLabel, type DocType } from "@/lib/settlement";
import { toast } from "sonner";
import { Paperclip, Upload, ExternalLink, Trash2, Camera } from "lucide-react";

export type RefType = "buy" | "sell" | "expense" | "transfer" | "brought_in" | "customer" | "account" | "deposit" | "payment_order" | "trade_movement" | "trade_cycle" | "other";

export function DocumentsPanel({
  refType,
  refId,
  compact,
}: {
  refType: RefType;
  refId: string | null | undefined;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocType>("payment_receipt");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  const q = useQuery({
    queryKey: ["documents", refType, refId],
    enabled: !!refId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("ref_type", refType)
        .eq("ref_id", refId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (doc: any) => {
      await supabase.storage.from("documents").remove([doc.storage_path]);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", refType, refId] });
      qc.invalidateQueries({ queryKey: ["action_center"] });
      toast.success("Document removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleUpload(file: File) {
    if (!refId) {
      toast.error("Save the record first, then attach documents.");
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${refType}/${refId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("documents").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (up.error) throw up.error;
      const { error } = await supabase.from("documents").insert({
        doc_type: docType,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        ref_type: refType,
        ref_id: refId,
        uploaded_by: u.user?.id,
        notes: notes || null,
      });
      if (error) throw error;
      setNotes("");
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["documents", refType, refId] });
      qc.invalidateQueries({ queryKey: ["action_center"] });
      toast.success("Document attached");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function open(doc: any) {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 600);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4" /> Documents
          <span className="text-xs text-muted-foreground">({q.data?.length ?? 0})</span>
        </div>
      )}
      <div className="rounded-md border p-3 space-y-2 bg-secondary/30">
        <div className="grid md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Document type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button type="button" variant="secondary" className="w-full" disabled={uploading}
            onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> {uploading ? "Uploading…" : "Choose file / gallery"}
          </Button>
          <Button type="button" variant="secondary" className="w-full sm:hidden" disabled={uploading}
            onClick={() => cameraRef.current?.click()}>
            <Camera className="h-4 w-4 mr-2" /> Take photo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </div>
      </div>
      <div className="space-y-1">
        {(q.data ?? []).map((d: any) => (
          <div key={d.id} className="flex items-center gap-2 rounded border p-2 text-sm">
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{d.file_name}</div>
              <div className="text-xs text-muted-foreground">
                {docTypeLabel(d.doc_type)} · {new Date(d.created_at).toLocaleString()}
                {d.notes ? ` · ${d.notes}` : ""}
              </div>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={() => open(d)} title="Open">
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => del.mutate(d)} title="Delete">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {q.data && q.data.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-3">No documents attached yet.</div>
        )}
      </div>
    </div>
  );
}