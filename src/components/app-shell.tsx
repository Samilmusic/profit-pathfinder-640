import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Wallet,
  Users,
  ArrowDownToLine,
  ShoppingCart,
  TrendingUp,
  Receipt,
  ArrowLeftRight,
  BookOpen,
  Coins,
  CalendarCheck,
  LogOut,
  Menu,
  X,
  Shield,
  ClipboardList,
  HandCoins,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/brought-in", label: "Brought In", icon: ArrowDownToLine },
  { to: "/buy", label: "Buy", icon: ShoppingCart },
  { to: "/sell", label: "Sell", icon: TrendingUp },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/pending-settlements", label: "Pending Settlements", icon: ClipboardList },
  { to: "/held-by-person", label: "Held by Person", icon: HandCoins },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/inventory", label: "Inventory", icon: Coins },
  { to: "/statements", label: "Statements", icon: BookOpen },
  { to: "/daily-closing", label: "Daily Closing", icon: CalendarCheck },
  { to: "/roles", label: "Roles", icon: Shield },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar - desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform md:translate-x-0 md:relative md:z-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-lg grid place-items-center bg-sidebar-primary text-sidebar-primary-foreground">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-sm">Exchange Portal</div>
            <div className="text-[11px] text-sidebar-foreground/60">Milad &amp; Ali</div>
          </div>
          <button className="ml-auto md:hidden text-sidebar-foreground/70" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="text-xs text-sidebar-foreground/60 px-2 pb-2 truncate">{email}</div>
          <Button variant="ghost" onClick={handleSignOut} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-card px-4 flex items-center gap-3 md:hidden sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="text-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <div className="font-semibold">Exchange Portal</div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}