import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminRecalculateBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Verify caller is admin using the user-scoped client (RLS + is_admin)
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "is_admin",
      { _user_id: context.userId },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("admin_recalculate_balances");
    if (error) throw new Error(error.message);
    return data as { lots_removed: number; ledger_entries_removed: number };
  });