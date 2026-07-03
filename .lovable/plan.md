# Responsive Overhaul — Full App Audit

Goal: make every page work natively on iPhone / Android / iPad / small laptops without breaking desktop. Fix the Sell page scroll bug first, then apply the same pattern across the app.

## Approach

Rather than editing every page individually with bespoke CSS (slow, inconsistent, easy to regress), I will:

1. **Fix the root causes in shared layout** — `AppShell`, `Dialog`, `Table`, `Card`, `PageHeader`, `styles.css`. Most "not responsive" symptoms in this codebase come from a few shared containers with `overflow-hidden`, fixed heights, or desktop-only paddings.
2. **Introduce 3 small primitives** used across pages:
   - `<ResponsiveTable>` — renders `<table>` on `md+`, stacked cards on mobile from the same column config.
   - `<StickyActionBar>` — bottom-anchored action bar with iOS safe-area padding; becomes inline on `md+`.
   - `<CollapsibleSection>` — collapsed by default on mobile, always-open on desktop. Used for Sell/Buy/Brought-In form sections and AI Score.
3. **Fix the Sell page** end-to-end as the reference implementation, then propagate the same patterns to Buy, Brought-In, Quick Sell, Transfers, Expenses, Dashboard, Command Center, AI Brain, Market Intel, and list pages.

## Concrete changes

### Global / shared
- `src/styles.css`
  - Add `--sat-bottom: env(safe-area-inset-bottom)` and `--sat-top` tokens; apply to sticky bars and mobile bottom nav (already partially there).
  - Add `.no-scroll-lock` utility, `.table-as-cards` responsive utility, `.text-fit` (clamped font-size with `clamp()`), `.stack-md` (grid-cols-1 md:grid-cols-2), `.stack-lg` (up to 3 cols).
  - Ensure `html, body { overflow-x: hidden }` is NOT set to `hidden` on any vertical axis; remove any leftover `overflow: hidden` on `#root`.
- `src/components/app-shell.tsx`
  - Verify `<main>` uses `min-h-0` and no `overflow-hidden`; add extra `pb-[calc(6rem+env(safe-area-inset-bottom))]` on mobile so sticky bars never cover content.
  - Header: shrink padding on mobile, hide search label, keep bell + search compact.
- `src/components/ui/dialog.tsx`
  - Content: `max-h-[100dvh]`, `overflow-y-auto`, `w-[calc(100vw-1rem)]`, `sm:max-w-lg`, padding scales down on mobile, rounded-none on <sm for full-sheet feel on phones. Body scroll not locked by nested overflow.
- `src/components/ui/table.tsx` — keep as-is but wrapper switches to `overflow-x-auto` only on `md+`; on mobile it's the caller's job to render cards (via ResponsiveTable).
- `src/components/page-header.tsx` — allow title to wrap, actions stack full-width on mobile.

### New primitives
- `src/components/responsive-table.tsx`
  - Props: `columns: { key, header, cell, mobileLabel?, primary? }[]`, `data`, `getRowKey`, `onRowClick?`, `emptyState?`.
  - `md+`: renders `<Table>`. `<md`: renders a list of Cards with label/value rows.
- `src/components/sticky-action-bar.tsx`
  - Fixed bottom on mobile with safe-area padding, background blur, top border; static/inline on `md+`. Children are the action buttons.
- `src/components/collapsible-section.tsx`
  - Wraps a Card with a header button that toggles open/closed on mobile; `alwaysOpen` prop or `md+` breakpoint forces open on tablet/desktop.

### Sell page (`src/routes/_authenticated/sell.tsx`) — reference fix
- Remove any `h-screen` / `overflow-hidden` from the form container.
- Wrap the form in a normal flow div, no fixed heights.
- Split form into `CollapsibleSection`s: Customer, Currency & Rate, Market, Accounts, AI Score (collapsed by default), Documents, Notes.
- Actions moved into `<StickyActionBar>` containing "Save Open Deal" and "Close Deal".
- Existing list view swapped to `<ResponsiveTable>` (already has an EmptyState).
- AI Score card: pass `defaultOpen={false}` on mobile; compact summary row visible when collapsed.

### Buy / Brought-In / Quick Sell / Transfers / Expenses
- Same section-collapse + sticky action bar treatment.
- Lists → `ResponsiveTable`.

### Dashboard (`dashboard.tsx`)
- Grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` for KPI cards.
- Bonbast/Inventory/Quick actions blocks each get `min-w-0` and `truncate` on numbers; large amounts use `.text-fit`.
- Recent Activity table → `ResponsiveTable`.

### Command Center, Market Intelligence, AI Brain
- Convert multi-column grids to `grid-cols-1 md:grid-cols-2` where they currently force wider columns.
- Chat input area: sticky bottom with safe-area on mobile.

### List pages (accounts, customers, inventory, statements, audit, pending-settlements, held-by-person, wallets, deposits, payment-orders, trust, ali-investor, trades, daily-closing, roles, settings)
- Swap tables to `ResponsiveTable`.
- Filter bars: `flex flex-wrap gap-2`, each control `min-w-0 flex-1 md:flex-none`.

### Detail pages (`sells.$id`, `customers.$id`, `trades.$id`)
- Header stacks on mobile per the responsive-layout rule (grid-cols-[minmax(0,1fr)_auto]).
- Side panels drop under main content on mobile.

### Auth page (`auth.tsx`)
- Fix the hydration mismatch showing in runtime errors (the `<div>` vs `<Suspense>` mismatch) by ensuring the outer wrapper is identical on server and client — remove any conditional wrapper.

## Out of scope
- No accounting logic, no schema changes, no new business rules.
- No changes to Supabase policies, server functions, or AI logic.
- No visual rebrand — same tokens, same colors, only layout/spacing/scroll behavior.

## Verification
- Screenshot Sell, Dashboard, Command Center, AI Brain, one list, one dialog at 360, 480, 768, 1024, 1280 via Playwright.
- Confirm: no horizontal scroll on any viewport, sticky action bars visible above safe area, dialogs scroll internally, tables become cards on mobile.

Reply "go" to execute, or tell me what to adjust (e.g., skip a page, keep tables horizontal on mobile, different breakpoints).
