import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/deposits")({ component: DepositsLayout });

function DepositsLayout() {
  return <Outlet />;
}