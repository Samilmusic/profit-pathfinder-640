import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/roles")({ component: Page });

const ROLES = ["admin", "partner", "accountant", "manager", "operator", "viewer"] as const;

function Page() {
  const qc = useQueryClient();

  const usersQ = useQuery({
    queryKey: ["profiles_roles"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      const rolesByUser = new Map<string, string[]>();
      r.data.forEach((x: any) => {
        const list = rolesByUser.get(x.user_id) ?? [];
        list.push(x.role);
        rolesByUser.set(x.user_id, list);
      });
      return p.data.map((u: any) => ({ ...u, roles: rolesByUser.get(u.id) ?? [] }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: string }) => {
      await supabase.from("user_roles").delete().eq("user_id", user_id);
      const { error } = await supabase.from("user_roles").insert({ user_id, role: role as any });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["profiles_roles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Roles" description="Assign one role per user. Admins can change any role." />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Current roles</TableHead><TableHead className="w-52">Set role</TableHead></TableRow></TableHeader>
          <TableBody>
            {(usersQ.data ?? []).map((u: any) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.display_name || u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell><div className="flex gap-1 flex-wrap">{u.roles.map((r: string) => <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>)}</div></TableCell>
                <TableCell>
                  <Select value={u.roles[0] ?? ""} onValueChange={(role) => setRole.mutate({ user_id: u.id, role })}>
                    <SelectTrigger><SelectValue placeholder="Assign" /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {usersQ.data && usersQ.data.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground">No users yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}