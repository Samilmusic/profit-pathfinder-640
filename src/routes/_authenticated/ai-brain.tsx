import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { BrainChat } from "@/components/ai/brain-chat";
import { DailyReport } from "@/components/ai/daily-report";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-brain")({
  component: BrainPage,
});

function BrainPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Business Brain"
        subtitle="Ask anything about your portal — answers come from real records only."
        icon={Sparkles}
      />
      <DailyReport />
      <BrainChat />
    </div>
  );
}