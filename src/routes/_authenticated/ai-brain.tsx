import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { BrainChat } from "@/components/ai/brain-chat";
import { DailyReport } from "@/components/ai/daily-report";

export const Route = createFileRoute("/_authenticated/ai-brain")({
  component: BrainPage,
});

function BrainPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Business Brain"
        description="Ask anything about your portal — answers come from real records only."
      />
      <DailyReport />
      <BrainChat />
    </div>
  );
}