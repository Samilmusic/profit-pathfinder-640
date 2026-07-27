import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pin, PinOff, Save, Trash2, Pencil, X } from "lucide-react";

export function CustomerNotes({ customerId, notes }: { customerId: string; notes: any[] }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["customer_notes", customerId] });

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("customer_notes")
        .insert({ customer_id: customerId, body: body.trim(), created_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { setBody(""); refresh(); toast.success("Note added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (patch: { id: string; values: any }) => {
      const { error } = await (supabase as any).from("customer_notes").update(patch.values).eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => { setEditingId(null); refresh(); toast.success("Note updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("customer_notes")
        .update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Note removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 space-y-2 bg-secondary/30">
        <Textarea rows={3} placeholder="Internal note about this customer…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex justify-end">
          <Button size="sm" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
            <Save className="h-4 w-4 mr-1" /> Add note
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {notes.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No notes yet.</div>}
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span>{new Date(n.created_at).toLocaleString()}</span>
              {n.updated_at && n.updated_at !== n.created_at && <Badge variant="outline" className="text-[10px]">edited {new Date(n.updated_at).toLocaleString()}</Badge>}
              {n.pinned && <Badge className="text-[10px]">Pinned</Badge>}
            </div>
            {editingId === n.id ? (
              <>
                <Textarea rows={3} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4 mr-1" />Cancel</Button>
                  <Button size="sm" onClick={() => update.mutate({ id: n.id, values: { body: editBody } })}><Save className="h-4 w-4 mr-1" />Save</Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm whitespace-pre-wrap">{n.body}</div>
                <div className="flex gap-1 flex-wrap">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingId(n.id); setEditBody(n.body); }}>
                    <Pencil className="h-3 w-3 mr-1" />Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => update.mutate({ id: n.id, values: { pinned: !n.pinned } })}>
                    {n.pinned ? <><PinOff className="h-3 w-3 mr-1" />Unpin</> : <><Pin className="h-3 w-3 mr-1" />Pin</>}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => remove.mutate(n.id)}>
                    <Trash2 className="h-3 w-3 mr-1" />Delete
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}