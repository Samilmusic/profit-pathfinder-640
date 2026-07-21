import { createFileRoute } from "@tanstack/react-router";
import { FlagGate } from "@/components/remittance-v2/flag-gate";
import { RemittanceV2CreateForm } from "@/components/remittance-v2/create-form";

export const Route = createFileRoute("/_authenticated/remittances/new-v2")({
  component: NewRemittanceV2Page,
  head: () => ({ meta: [{ title: "New Remittance (v2) — Exchange Portal" }] }),
});

function NewRemittanceV2Page() {
  return (
    <FlagGate>
      <RemittanceV2CreateForm />
    </FlagGate>
  );
}