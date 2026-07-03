import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Section that is collapsed by default on mobile and always open on md+.
 * Use to break long forms into digestible chunks on phones.
 */
export function CollapsibleSection({
  title, subtitle, icon, defaultOpen = false, alwaysOpen = false, children, className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  alwaysOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [openMobile, setOpenMobile] = useState(defaultOpen);
  return (
    <Card className={cn("overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpenMobile((o) => !o)}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-3 text-left",
          "md:cursor-default",
        )}
        aria-expanded={alwaysOpen || openMobile}
      >
        {icon && <span className="shrink-0 text-primary">{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
        </div>
        {!alwaysOpen && (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform md:hidden",
              openMobile && "rotate-180",
            )}
          />
        )}
      </button>
      <div
        className={cn(
          "px-4 pb-4 border-t",
          alwaysOpen ? "block" : openMobile ? "block" : "hidden md:block",
        )}
      >
        {children}
      </div>
    </Card>
  );
}