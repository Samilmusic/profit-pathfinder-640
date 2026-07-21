import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function DocumentsReadonly({ remittanceId }: { remittanceId: string }) {
  const q = useQuery({
    queryKey: ["remittance-v2", "documents", remittanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, doc_type, file_name, storage_path, mime_type, size_bytes, notes, created_at")
        .eq("ref_type", "remittance")
        .eq("ref_id", remittanceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function openDoc(storage_path: string) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(storage_path, 600);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Unable to open document");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : q.isError ? (
          <div className="text-sm text-destructive">Unable to load documents.</div>
        ) : (q.data?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground">No records are available or visible to your role.</div>
        ) : (
          <ul className="space-y-2">
            {q.data!.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{d.file_name ?? "(unnamed)"}</div>
                  <div className="text-xs text-muted-foreground">{String(d.doc_type)} · {new Date(d.created_at as string).toLocaleString()}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => openDoc(d.storage_path as string)}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
