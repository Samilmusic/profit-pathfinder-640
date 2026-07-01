import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { BrainChat } from "./brain-chat";

export function AskBusinessButton() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50 rounded-full shadow-xl h-14 pl-4 pr-5 gap-2 card-lift"
        >
          <Sparkles className="h-5 w-5" />
          <span className="font-medium">Ask Business</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-4">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Business Brain</SheetTitle>
        </SheetHeader>
        <BrainChat compact />
      </SheetContent>
    </Sheet>
  );
}