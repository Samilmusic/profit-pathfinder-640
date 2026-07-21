import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode, type ComponentType } from "react";
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
  Zap,
  Landmark,
  ArrowUpFromLine,
  Send,
  ShieldCheck,
  Radar,
  History,
  Target,
  BarChart3,
  ChevronDown,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { Briefcase } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GlobalSearchTrigger } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }> };
type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean; defaultOpen?: boolean };

const navGroups: NavGroup[] = [
  {
    label: "Dashboard",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Trading",
    items: [
      { to: "/deals", label: "Deal Center", icon: Briefcase },
      { to: "/remittances", label: "Remittances", icon: Send },
      { to: "/pending-settlements", label: "Pending Settlements", icon: ClipboardList },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/accounts", label: "Accounts", icon: Wallet },
      { to: "/held-by-person", label: "Cash with People", icon: HandCoins },
      { to: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Treasury",
    items: [
      { to: "/inventory", label: "Inventory", icon: Coins },
      { to: "/brought-in", label: "Brought In", icon: ArrowDownToLine },
      { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
      { to: "/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/ai-brain", label: "AI Business Brain", icon: Sparkles },
      { to: "/command-center", label: "Command Center", icon: Target },
      { to: "/market-intelligence", label: "Market Intel", icon: BarChart3 },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/reports", label: "Business Intelligence", icon: BarChart3 },
      { to: "/profits", label: "Profits", icon: TrendingUp },
      { to: "/statements", label: "Statements", icon: BookOpen },
      { to: "/daily-closing", label: "Daily Closing", icon: CalendarCheck },
      { to: "/audit", label: "Audit Log", icon: History },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/roles", label: "Roles", icon: Shield },
      { to: "/migration-status", label: "Migration Status", icon: ClipboardList },
      { to: "/settings", label: "Settings", icon: Shield },
    ],
  },
  {
    label: "Advanced",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/quick-sell", label: "Quick Sell", icon: Zap },
      { to: "/buy", label: "Buy", icon: ShoppingCart },
      { to: "/sell", label: "Sell", icon: TrendingUp },
      { to: "/trades", label: "Trade Cycles", icon: Repeat },
      { to: "/wallets", label: "Customer Wallets", icon: Landmark },
      { to: "/deposits", label: "Deposits", icon: ArrowUpFromLine },
      { to: "/payment-orders", label: "Payment Orders", icon: Send },
      { to: "/trust", label: "Trust vs Company", icon: ShieldCheck },
      { to: "/ali-investor", label: "Ali — Investor", icon: Radar },
    ],
  },
];

const mobileNav = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/deals", label: "Deals", icon: Briefcase },
  { to: "/ai-brain", label: "AI Brain", icon: Sparkles },
] as const;

const mobileMore: NavItem[] = [
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/inventory", label: "Inventory", icon: Coins },
  { to: "/pending-settlements", label: "Pending Settlements", icon: ClipboardList },
  { to: "/held-by-person", label: "Cash with People", icon: HandCoins },
  { to: "/brought-in", label: "Brought In", icon: ArrowDownToLine },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/statements", label: "Statements", icon: BookOpen },
  { to: "/daily-closing", label: "Daily Closing", icon: CalendarCheck },
  { to: "/audit", label: "Audit Log", icon: History },
  { to: "/command-center", label: "Command Center", icon: Target },
  { to: "/market-intelligence", label: "Market Intel", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Shield },
  { to: "/roles", label: "Roles", icon: Shield },
];

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
        <div className="px-3 pt-3">
          <Link
            to="/trades/new"
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus className="h-4 w-4" /> New Trade
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {navGroups.map((group) => (
            <NavGroupBlock key={group.label} group={group} pathname={pathname} />
          ))}
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
        <header className="h-14 border-b bg-card px-4 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="text-foreground md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="font-semibold md:hidden">Exchange Portal</div>
          <div className="flex-1" />
          <NotificationBell />
          <GlobalSearchTrigger />
        </header>
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">{children}</main>

        {/* Floating "New Trade" FAB (hidden on the new-trade page itself) */}
        {!pathname.startsWith("/trades/new") && (
          <Link
            to="/trades/new"
            className={cn(
              "fixed z-40 shadow-lg rounded-full bg-primary text-primary-foreground font-semibold",
              "flex items-center gap-2 px-5 py-3 text-sm hover:opacity-95 transition-opacity",
              // desktop: bottom-right
              "md:bottom-6 md:right-6",
              // mobile: bottom-center above bottom nav
              "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0",
            )}
            aria-label="New Trade"
          >
            <Plus className="h-4 w-4" /> New Trade
          </Link>
        )}

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-card border-t md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="grid grid-cols-4">
            {mobileNav.map((item) => {
              const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to}
                  className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]",
                    active ? "text-primary font-semibold" : "text-muted-foreground")}>
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <MobileMoreSheet pathname={pathname} />
          </div>
        </nav>
      </div>
    </div>
  );
}

function NavGroupBlock({ group, pathname }: { group: NavGroup; pathname: string }) {
  const anyActive = group.items.some((i) => pathname.startsWith(i.to));
  const [open, setOpen] = useState<boolean>(group.collapsible ? (group.defaultOpen ?? anyActive) : true);
  const collapsible = !!group.collapsible;
  return (
    <div>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
        >
          <span>{group.label}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "" : "-rotate-90")} />
        </button>
      ) : (
        <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          {group.label}
        </div>
      )}
      {open && (
        <div className="space-y-0.5">
          {group.items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
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
        </div>
      )}
    </div>
  );
}

function MobileMoreSheet({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground">
          <MoreHorizontal className="h-5 w-5" />
          <span>More</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader><SheetTitle>More</SheetTitle></SheetHeader>
        <div className="grid grid-cols-3 gap-2 pt-4">
          {mobileMore.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs text-center",
                  active ? "border-primary text-primary font-semibold" : "hover:bg-muted",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}