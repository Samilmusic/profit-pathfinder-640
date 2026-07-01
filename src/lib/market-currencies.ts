// Central config for live market rates.
// Adding a new currency here automatically extends the fetcher + dashboard,
// as long as bonbast exposes `<code>1` (sell) and `<code>2` (buy) fields.
export type MarketCurrency = {
  code: string;
  flag: string;
  label: string;
  /** false = try to parse but do not surface a warning if missing (still saved when present) */
  primary: boolean;
};

export const MARKET_CURRENCIES: MarketCurrency[] = [
  { code: "AED", flag: "🇦🇪", label: "UAE Dirham", primary: true },
  { code: "USD", flag: "🇺🇸", label: "US Dollar", primary: true },
  { code: "EUR", flag: "🇪🇺", label: "Euro", primary: true },
  { code: "GBP", flag: "🇬🇧", label: "British Pound", primary: true },
  { code: "TRY", flag: "🇹🇷", label: "Turkish Lira", primary: false },
  { code: "CAD", flag: "🇨🇦", label: "Canadian Dollar", primary: false },
  { code: "AUD", flag: "🇦🇺", label: "Australian Dollar", primary: false },
  { code: "CHF", flag: "🇨🇭", label: "Swiss Franc", primary: false },
];

/** Bonbast field mapping: lowercased code + `1` (sell) and `2` (buy). */
export function bonbastFieldsFor(code: string): { sellField: string; buyField: string } {
  const k = code.toLowerCase();
  return { sellField: `${k}1`, buyField: `${k}2` };
}

export function currencyMeta(code: string): MarketCurrency {
  return (
    MARKET_CURRENCIES.find((c) => c.code.toUpperCase() === code.toUpperCase()) ?? {
      code,
      flag: "🏳️",
      label: code,
      primary: false,
    }
  );
}