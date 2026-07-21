import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type RTColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Label used in the mobile card view. Falls back to `header`. */
  mobileLabel?: ReactNode;
  /** Emphasize this cell as the primary header on mobile (top of the card). */
  primary?: boolean;
  /** Hide this column entirely on mobile card view. */
  hideOnMobile?: boolean;
  className?: string;
  headerClassName?: string;
};

type Props<T> = {
  columns: RTColumn<T>[];
  data: T[] | undefined;
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  className?: string;
};

export function ResponsiveTable<T>({
  columns, data, getRowKey, onRowClick, empty, className,
}: Props<T>) {
  const rows = data ?? [];
  const isEmpty = rows.length === 0;

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop / tablet — real table */}
      <div className="hidden md:block">
        <Card>
          <div className="overflow-x-auto scroll-safe">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key} className={c.headerClassName}>{c.header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={getRowKey(row)}
                    className={cn(onRowClick && "cursor-pointer")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.className}>{c.cell(row)}</TableCell>
                    ))}
                  </TableRow>
                ))}
                {isEmpty && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="p-4">{empty}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Mobile — cards */}
      <div className="md:hidden space-y-2">
        {isEmpty && <Card className="p-4">{empty}</Card>}
        {rows.map((row) => {
          const primary = columns.find((c) => c.primary);
          const rest = columns.filter((c) => !c.primary && !c.hideOnMobile);
          return (
            <Card
              key={getRowKey(row)}
              className={cn("p-3 rise-in", onRowClick && "cursor-pointer active:scale-[0.99] transition-transform")}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {primary && (
                <div className="mb-2 text-base font-semibold min-w-0 truncate">
                  {primary.cell(row)}
                </div>
              )}
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide self-center min-w-0 truncate">
                      {c.mobileLabel ?? c.header}
                    </dt>
                    <dd className="min-w-0 text-right break-words">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          );
        })}
      </div>
    </div>
  );
}