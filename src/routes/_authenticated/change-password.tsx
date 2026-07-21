import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/change-password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters.");
    if (pw !== pw2) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      const { data: userRes, error: uerr } = await supabase.auth.getUser();
      if (uerr || !userRes.user) throw uerr ?? new Error("Not signed in");
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      const { error: perr } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", userRes.user.id);
      if (perr) throw perr;
      toast.success("Password updated");
      navigate({ to: "/dashboard", replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update password";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Set a new password"
        description="For security, please choose a new password before continuing."
      />
      <Card className="max-w-md">
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Updating..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}