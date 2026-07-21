import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/**
 * Reads the current server value of the `remittance_v2_enabled` feature flag.
 * This gate governs UI visibility only. The server RPC (`_assert_flag`) is
 * the authoritative check — if the flag flips after the page loads, the RPC
 * will still reject the submission.
 */
export function useRemittanceV2FlagEnabled() {
  return useQuery({
    queryKey: ["remittance-v2", "flag", "remittance_v2_enabled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_feature_flags")
        .select("enabled")
        .eq("key", "remittance_v2_enabled")
        .maybeSingle();
      if (error) throw error;
      return !!data?.enabled;
    },
    staleTime: 30_000,
  });
}

export function FlagGate({ children }: { children: React.ReactNode }) {
  const q = useRemittanceV2FlagEnabled();
  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="mx-auto max-w-3xl p-4 space-y-4">
        <Button asChild size="sm" variant="ghost">
          <Link to="/remittances">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>v2 workflow disabled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              The v2 remittance workflow is currently turned off. New records must be created
              through the existing remittance form.
            </p>
            <Button asChild size="sm">
              <Link to="/remittances/new">Open legacy form</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
