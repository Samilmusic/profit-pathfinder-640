import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/trades")({ component: TradesLayout });

function TradesLayout() {
  return <Outlet />;
}