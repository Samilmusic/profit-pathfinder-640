import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Gauge,
  TrendingUp,
  Send,
  Package,
  Wallet,
  Users,
  Activity,
  History,
  ShieldCheck,
  Download,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import type { ComponentType } from "react";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "Reports — Business Intelligence" },
      { name: "description", content: "Executive and operational reports for the exchange." },
    ],
  }),
  component: ReportsHub,
});

type Card = {
  to: string;
  label: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
  status: "ready" | "coming";
};

const cards: Card[] = [
  { to: "/reports/executive",       label: "Executive Dashboard", desc: "Profit, remittance state, inventory value.",           icon: Gauge,       status: "ready" },
  { to: "/reports/operations",      label: "Operational KPIs",    desc: "Live queue, operator workload, processing times.",     icon: Activity,    status: "ready" },
  { to: "/reports/data-quality",    label: "Data Quality",        desc: "Read-only classification of every financial row.",     icon: ShieldAlert, status: "ready" },
  { to: "/reports/profits",         label: "Profit Analytics",    desc: "Charts by day/week/month, breakdowns by dimension.",   icon: TrendingUp,  status: "ready" },
  { to: "/reports/remittances",     label: "Remittance Analytics",desc: "Lifecycle durations, completion rates, trends.",       icon: Send,        status: "coming" },
  { to: "/reports/inventory",       label: "Inventory Dashboard", desc: "FIFO lots, remaining, age, turnover, unrealized market P&L.", icon: Package,     status: "ready" },
  { to: "/reports/treasury",        label: "Treasury & Cash",     desc: "Position, flow, forecast, exposure, bank analytics.",  icon: Wallet,      status: "ready" },
  { to: "/reports/counterparties",  label: "Customers & Suppliers",desc: "Profiles, lifetime volume, profit, rankings.",         icon: Users,       status: "ready" },
  { to: "/reports/audit-explorer",  label: "Audit Explorer",      desc: "Searchable timeline of transitions and events.",       icon: History,     status: "ready" },
  { to: "/reports/reconciliation",  label: "Reconciliation",      desc: "Visual results history from the financial contract.",  icon: ShieldCheck, status: "coming" },
  { to: "/reports/exports",         label: "Exports",             desc: "PDF / Excel / CSV of any report.",                     icon: Download,    status: "coming" },
];

function ReportsHub() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reports"
        description="Read-only business intelligence. All numbers are server-authoritative."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const disabled = c.status !== "ready";
          const body = (
            <Card className={disabled ? "opacity-60" : "hover:border-primary/50 transition-colors"}>
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div className="rounded-md border p-2">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    {c.label}
                    {disabled ? (
                      <Badge variant="outline" className="text-[10px]">Coming</Badge>
                    ) : (
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">{c.desc}</CardContent>
            </Card>
          );
          return disabled ? (
            <div key={c.to}>{body}</div>
          ) : (
            <Link key={c.to} to={c.to}>{body}</Link>
          );
        })}
      </div>
    </div>
  );
}