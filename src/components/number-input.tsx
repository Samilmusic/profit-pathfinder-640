import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { decimalsFor } from "@/lib/exchange";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  currency?: string;
};

/**
 * Mobile-friendly numeric input.
 * - Uses inputMode="decimal" so mobile keyboards show the numeric keypad.
 * - IRR: whole numbers only (no decimals accepted).
 * - Others: allow up to 4 decimals.
 */
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { className, currency, onChange, value, ...rest }, ref,
) {
  const d = decimalsFor(currency);
  return (
    <Input
      ref={ref}
      type="text"
      inputMode={d === 0 ? "numeric" : "decimal"}
      autoComplete="off"
      value={value ?? ""}
      onChange={(e) => {
        let v = e.target.value.replace(/[^\d.,-]/g, "").replace(",", ".");
        // strip extra dots
        const parts = v.split(".");
        if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
        // enforce decimal cap
        if (d === 0) v = v.split(".")[0];
        else {
          const [a, b] = v.split(".");
          if (b !== undefined) v = a + "." + b.slice(0, d);
        }
        e.target.value = v;
        onChange?.(e);
      }}
      className={cn("h-11 text-base", className)}
      {...rest}
    />
  );
});