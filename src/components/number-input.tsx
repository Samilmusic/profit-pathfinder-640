import { forwardRef, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { decimalsFor, formatMoney, parseMoneyInput, formatRate } from "@/lib/exchange";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  currency?: string;
  /** Raw numeric string (no separators). */
  value?: string | number | null;
  /**
   * Fires with a synthetic event whose `target.value` is the RAW numeric
   * string (no thousands separators). This preserves compatibility with
   * every existing caller that does `Number(e.target.value)`.
   */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Use up to 6 decimals (for exchange rates). */
  rate?: boolean;
};

/**
 * Mobile-friendly numeric input with automatic thousands separators.
 * - Displays "1,000,000" while the underlying value stays "1000000".
 * - IRR: whole numbers only. Others: up to 4 decimals (or 6 when `rate`).
 * - inputMode="decimal" for the iOS numeric keypad.
 */
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { className, currency, onChange, value, rate, onFocus, onBlur, ...rest }, ref,
) {
  const d = rate ? 6 : decimalsFor(currency);
  const format = (v: string | number | null | undefined) =>
    rate ? formatRate(v) : formatMoney(v, currency);

  const rawValue = value === null || value === undefined ? "" : String(value);
  const [display, setDisplay] = useState<string>(() => format(rawValue));
  const focusedRef = useRef(false);

  // Keep display in sync when the raw value changes externally (and not
  // during active typing).
  useEffect(() => {
    if (focusedRef.current) return;
    setDisplay(format(rawValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawValue, currency, rate]);

  return (
    <Input
      ref={ref}
      type="text"
      inputMode={d === 0 ? "numeric" : "decimal"}
      autoComplete="off"
      value={display}
      onFocus={(e) => { focusedRef.current = true; onFocus?.(e); }}
      onBlur={(e) => {
        focusedRef.current = false;
        setDisplay(format(parseMoneyInput(e.target.value)));
        onBlur?.(e);
      }}
      onChange={(e) => {
        const el = e.target;
        const before = el.value;
        const caret = el.selectionStart ?? before.length;
        // separators to the left of the caret (before formatting)
        const sepBefore = (before.slice(0, caret).match(/,/g) || []).length;

        const raw = parseMoneyInput(before);
        // cap decimals
        let capped = raw;
        if (capped.includes(".")) {
          const [a, b] = capped.split(".");
          capped = d === 0 ? a : a + "." + b.slice(0, d);
        } else if (d === 0) {
          capped = capped.replace(/\./g, "");
        }
        const formatted = format(capped);
        setDisplay(formatted);

        // Restore caret position, adjusted for added/removed separators.
        const sepAfter = (formatted.slice(0, caret).match(/,/g) || []).length;
        const newCaret = Math.max(0, caret + (sepAfter - sepBefore));
        requestAnimationFrame(() => {
          try { el.setSelectionRange(newCaret, newCaret); } catch { /* ignore */ }
        });

        // Dispatch onChange with the RAW value so callers see clean numbers.
        const syntheticTarget = Object.create(el, {
          value: { value: capped, writable: true, configurable: true },
        }) as HTMLInputElement;
        const synthetic = { ...e, target: syntheticTarget, currentTarget: syntheticTarget };
        onChange?.(synthetic as unknown as React.ChangeEvent<HTMLInputElement>);
      }}
      className={cn("h-11 text-base", className)}
      {...rest}
    />
  );
});