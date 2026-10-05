import { ArrowDown, ArrowRight } from "lucide-react";
import {
  COMPLIANCE_STATEMENTS,
  DISTRIBUTION_CHANNELS,
  GCC_MARKETS,
  SALES_CHANNEL_FLOWS,
  SUPPLIER_MARKET_CHANNELS,
  SUPPLY_CHAIN,
} from "@/lib/site";
import { cn } from "@/lib/utils";
import { Eyebrow, SectionHeading, TextLink } from "./primitives";

const delay = (ms: number) => ({ ["--reveal-delay" as string]: `${ms}ms` });

/* ------------------------------------------------------------------ */
/* From source to market (homepage strip)                              */
/* ------------------------------------------------------------------ */

const SOURCE_TO_MARKET = [
  "International Sourcing",
  "UAE Import",
  "Wholesale & B2B",
  "Online Marketplaces",
  "UAE & Selected GCC Markets",
];

export function SourceToMarketSection() {
  return (
    <section
      className="border-b border-rule bg-white py-20 lg:py-24"
      aria-labelledby="source-to-market"
    >
      <div className="site-container">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-6">
            <SectionHeading
              eyebrow="Route to Market"
              title={<span id="source-to-market">From Source to Market</span>}
            />
          </div>
          <p data-reveal className="text-lg leading-relaxed text-slate-ink lg:col-span-6">
            We don't simply source products. We evaluate how they can be commercially positioned and
            distributed through appropriate channels within our core markets.
          </p>
        </div>

        <ol className="mt-14 grid gap-3 lg:grid-cols-5 lg:gap-0">
          {SOURCE_TO_MARKET.map((step, i) => {
            const last = i === SOURCE_TO_MARKET.length - 1;
            return (
              <li
                key={step}
                data-reveal
                style={delay(i * 110)}
                className="relative flex flex-col lg:flex-row"
              >
                <div
                  className={cn(
                    "flex min-h-20 flex-1 items-center gap-4 px-5 py-5 lg:min-h-36 lg:flex-col lg:items-start lg:justify-between",
                    last ? "bg-navy text-white" : "border border-rule bg-ivory text-navy",
                  )}
                >
                  <span
                    className={cn(
                      "font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em]",
                      last ? "text-gold-soft" : "text-gold",
                    )}
                  >
                    0{i + 1}
                  </span>
                  <span className="text-[0.8rem] leading-snug font-semibold tracking-[0.12em] uppercase">
                    {step}
                  </span>
                </div>
                {!last && (
                  <>
                    <ArrowDown
                      aria-hidden
                      className="mx-auto -mb-1 mt-2 size-4 text-gold lg:hidden"
                      strokeWidth={1.5}
                    />
                    <span
                      aria-hidden
                      className="hidden w-6 shrink-0 items-center justify-center lg:flex"
                    >
                      <ArrowRight className="size-4 text-gold" strokeWidth={1.5} />
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Our route to market — four distribution channels                    */
/* ------------------------------------------------------------------ */

export function RouteToMarketSection({ withLink }: { withLink?: boolean }) {
  return (
    <section className="bg-ivory py-24 lg:py-32" aria-labelledby="route-to-market">
      <div className="site-container">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionHeading
              eyebrow="Our Route to Market"
              title={
                <span id="route-to-market">
                  From International Suppliers
                  <br className="hidden sm:block" /> to the UAE &amp; GCC Market
                </span>
              }
            />
          </div>
          <div
            data-reveal
            className="grid gap-4 text-lg leading-relaxed text-slate-ink lg:col-span-5 lg:pt-12"
          >
            <p>
              Products sourced by AL NOKHBA are purchased for commercial distribution primarily
              within the United Arab Emirates, with selected opportunities across GCC markets.
            </p>
            <p>
              Our route-to-market strategy combines wholesale distribution, B2B sales, established
              commercial relationships and selected online marketplace channels.
            </p>
          </div>
        </div>

        <ol className="mt-14 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {DISTRIBUTION_CHANNELS.map((c, i) => (
            <li
              key={c.title}
              data-reveal
              style={delay((i % 4) * 90)}
              className="group flex flex-col bg-white p-7 transition-colors duration-300 hover:bg-navy"
            >
              <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.2em] text-gold transition-colors group-hover:text-gold-soft">
                {c.no}
              </span>
              <h3 className="mt-10 text-lg font-semibold text-navy uppercase transition-colors group-hover:text-white">
                {c.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-ink transition-colors group-hover:text-white/75">
                {c.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <p data-reveal className="max-w-3xl text-sm leading-relaxed text-slate-ink">
            Online marketplaces are an additional channel for selected consumer-facing products; AL
            NOKHBA's core activity remains wholesale and B2B distribution.
          </p>
          {withLink && (
            <div data-reveal className="shrink-0">
              <TextLink to="/wholesale-procurement" hash="multi-channel">
                Multi-Channel Distribution
              </TextLink>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Based in Dubai. Focused on the UAE. Connected to the GCC.           */
/* ------------------------------------------------------------------ */

export function CoreMarketSection() {
  return (
    <section
      className="relative isolate overflow-hidden bg-navy-deep py-24 text-white lg:py-32"
      aria-labelledby="core-market"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(90deg,oklch(1_0_0/0.03)_0_1px,transparent_1px_120px)]"
      />
      <div className="site-container grid gap-16 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-6">
          <Eyebrow light>Core Market</Eyebrow>
          <h2
            id="core-market"
            data-reveal
            className="mt-6 text-[2rem] leading-[1.08] font-semibold uppercase sm:text-5xl lg:text-[2.2rem] xl:text-[2.45rem]"
          >
            <span className="block xl:whitespace-nowrap">Based in Dubai.</span>
            <span className="block text-white/90 xl:whitespace-nowrap">Focused on the UAE.</span>
            <span className="block text-gold-soft xl:whitespace-nowrap">Connected to the GCC.</span>
          </h2>
          <div
            data-reveal
            className="mt-8 grid max-w-xl gap-4 leading-relaxed text-white/75 sm:text-lg"
          >
            <p>Dubai serves as the operational base of AL NOKHBA's trading activities.</p>
            <p>
              Our primary commercial focus is the United Arab Emirates, where we evaluate products
              for wholesale, B2B and selected marketplace distribution.
            </p>
            <p>
              For suitable products, we may also develop sales opportunities through commercial
              relationships across selected GCC markets.
            </p>
          </div>
        </div>

        <div className="lg:col-span-6">
          {/* Tiered market model */}
          <div data-reveal className="grid gap-px bg-white/10">
            {[
              { k: "Operational Base", v: "Dubai, UAE", accent: false },
              { k: "Primary Market", v: "United Arab Emirates", accent: true },
              { k: "Regional Commercial Focus", v: "Selected GCC Markets", accent: false },
            ].map((t) => (
              <div
                key={t.k}
                className={cn(
                  "flex flex-col gap-1 px-7 py-6 sm:flex-row sm:items-baseline sm:justify-between",
                  t.accent ? "bg-navy-soft" : "bg-navy-deep",
                )}
              >
                <span className="eyebrow text-[0.65rem] text-white/50">{t.k}</span>
                <span
                  className={cn(
                    "font-[family-name:var(--font-display)] text-xl font-semibold",
                    t.accent ? "text-gold-soft" : "text-white",
                  )}
                >
                  {t.v}
                </span>
              </div>
            ))}
          </div>

          <ul className="mt-8 grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-3">
            {GCC_MARKETS.map((m, i) => {
              const primary = i === 0;
              return (
                <li
                  key={m.name}
                  data-reveal
                  style={delay((i % 3) * 80)}
                  className={cn(
                    "flex min-h-24 flex-col justify-between p-5",
                    primary ? "bg-gold text-navy-deep" : "bg-navy-deep",
                  )}
                >
                  <span
                    className={cn(
                      "text-[0.95rem] leading-snug font-semibold",
                      primary ? "" : "text-white",
                    )}
                  >
                    {m.name}
                  </span>
                  <span
                    className={cn(
                      "mt-3 text-[0.68rem] tracking-[0.08em] uppercase",
                      primary ? "text-navy-deep/80" : "text-white/50",
                    )}
                  >
                    {m.role}
                  </span>
                </li>
              );
            })}
          </ul>
          <p data-reveal className="mt-5 text-xs leading-relaxed text-white/50">
            AL NOKHBA's principal operations are based in Dubai. Opportunities in other GCC markets
            are developed with commercial customers and business connections where commercially
            appropriate.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Multi-channel distribution visual                                   */
/* ------------------------------------------------------------------ */

export function MultiChannelSection() {
  return (
    <section
      id="multi-channel"
      className="scroll-mt-24 bg-white py-24 lg:py-32"
      aria-labelledby="multi-channel-title"
    >
      <div className="site-container">
        <SectionHeading
          eyebrow="Sales Channels"
          title={<span id="multi-channel-title">Multi-Channel Distribution</span>}
          intro={
            <p>
              After import into the United Arab Emirates, products can follow several commercial
              routes to market — selected according to the product category and the customers it
              serves.
            </p>
          }
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-12 lg:gap-0">
          {/* Origin */}
          <div
            data-reveal
            className="flex flex-col justify-between bg-navy p-8 text-white lg:col-span-3"
          >
            <div>
              <p className="eyebrow text-gold-soft">Imported into the UAE</p>
              <p className="mt-5 font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold uppercase">
                AL NOKHBA
                <br />
                Dubai
              </p>
            </div>
            <p className="mt-10 text-sm leading-relaxed text-white/65">
              International products purchased and imported for commercial distribution.
            </p>
          </div>

          {/* Flows */}
          <ol className="grid gap-3 lg:col-span-9 lg:gap-px lg:bg-rule lg:pl-px">
            {SALES_CHANNEL_FLOWS.map((f, i) => (
              <li
                key={f.from}
                data-reveal
                style={delay(i * 110)}
                className="group grid grid-cols-1 items-stretch border border-rule bg-white sm:grid-cols-[1fr_auto_1fr] lg:border-0"
              >
                <div className="flex min-h-20 items-center gap-4 px-6 py-5">
                  <span className="hidden h-px w-6 bg-gold lg:block" aria-hidden />
                  <span className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] text-gold">
                    0{i + 1}
                  </span>
                  <span className="text-base font-semibold text-navy">{f.from}</span>
                </div>
                <div aria-hidden className="flex items-center justify-center px-2 sm:px-4">
                  <span className="relative hidden h-px w-24 overflow-hidden bg-navy/15 sm:block lg:w-32">
                    <span className="process-line-x absolute inset-0 bg-gold" />
                  </span>
                  <ArrowRight
                    className="hidden size-4 -translate-x-1 text-gold sm:block"
                    strokeWidth={1.5}
                  />
                  <ArrowDown className="size-4 text-gold sm:hidden" strokeWidth={1.5} />
                </div>
                <div className="flex min-h-20 items-center bg-ivory px-6 py-5 transition-colors duration-300 group-hover:bg-stone">
                  <span className="eyebrow text-[0.7rem] text-navy">{f.to}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p data-reveal className="mt-8 max-w-3xl text-sm leading-relaxed text-slate-ink">
          Selected consumer-facing products may also be distributed through established online
          marketplaces such as Amazon UAE, complementing our core wholesale and B2B activities.
        </p>
        <ComplianceNote className="mt-12" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Supply chain diagram (International Sourcing page)                  */
/* ------------------------------------------------------------------ */

export function SupplyChainSection() {
  return (
    <section className="bg-navy-deep py-24 text-white lg:py-32" aria-labelledby="supply-chain">
      <div className="site-container">
        <SectionHeading
          light
          eyebrow="Supply Chain"
          title={
            <span id="supply-chain">From International Supplier to UAE &amp; GCC Markets</span>
          }
          intro={
            <p>
              Once a purchase is agreed, goods move along a clear path: exported to the United Arab
              Emirates, imported, evaluated for market entry and distributed through our commercial
              channels.
            </p>
          }
        />

        {/* Desktop: horizontal chain */}
        <ol className="mt-16 hidden grid-cols-7 lg:grid">
          {SUPPLY_CHAIN.map((s, i) => {
            const last = i === SUPPLY_CHAIN.length - 1;
            const final = "final" in s && s.final;
            return (
              <li
                key={s.title}
                data-reveal
                style={delay(i * 120)}
                className="relative flex flex-col"
              >
                <div className="flex items-center">
                  <span
                    className={cn(
                      "relative z-10 flex size-12 shrink-0 items-center justify-center border font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.1em]",
                      final
                        ? "border-gold bg-gold text-navy-deep"
                        : "border-white/25 bg-navy-deep text-gold-soft",
                    )}
                  >
                    0{i + 1}
                  </span>
                  {!last && (
                    <span aria-hidden className="relative h-px flex-1 overflow-hidden bg-white/15">
                      <span className="process-line-x absolute inset-0 bg-gold" />
                    </span>
                  )}
                </div>
                <div className="mt-6 pr-5">
                  <p
                    className={cn(
                      "text-[0.85rem] leading-snug font-semibold uppercase tracking-[0.06em]",
                      final ? "text-gold-soft" : "text-white",
                    )}
                  >
                    {s.title}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-white/55">{s.note}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Mobile / tablet: vertical chain */}
        <ol className="mt-12 lg:hidden">
          {SUPPLY_CHAIN.map((s, i) => {
            const last = i === SUPPLY_CHAIN.length - 1;
            const final = "final" in s && s.final;
            return (
              <li key={s.title} data-reveal className="grid grid-cols-[3rem_1fr] gap-5">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex size-12 items-center justify-center border font-[family-name:var(--font-display)] text-xs font-semibold",
                      final
                        ? "border-gold bg-gold text-navy-deep"
                        : "border-white/25 text-gold-soft",
                    )}
                  >
                    0{i + 1}
                  </span>
                  {!last && (
                    <span aria-hidden className="relative w-px flex-1 bg-white/15">
                      <span className="process-line absolute inset-0 bg-gold" />
                    </span>
                  )}
                </div>
                <div className={cn("pt-3", !last && "pb-8")}>
                  <p
                    className={cn(
                      "font-semibold uppercase tracking-[0.06em]",
                      final ? "text-gold-soft" : "text-white",
                    )}
                  >
                    {s.title}
                  </p>
                  <p className="mt-1 text-sm text-white/55">{s.note}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <ComplianceNote light className="mt-16" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Supplier page: Your products. Our market.                            */
/* ------------------------------------------------------------------ */

export function YourProductsOurMarketSection() {
  return (
    <section className="bg-white py-24 lg:py-32" aria-labelledby="your-products">
      <div className="site-container grid gap-14 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-6">
          <SectionHeading
            eyebrow="Market Access"
            title={<span id="your-products">Your Products. Our Market.</span>}
            intro={
              <>
                <p>
                  International suppliers working with AL NOKHBA gain access to a UAE-based
                  wholesale buyer with multiple potential routes to market.
                </p>
                <p className="mt-4">
                  Depending on the product category, our commercial strategy may include wholesale
                  supply, direct B2B sales, established commercial relationships and selected UAE
                  online marketplace channels.
                </p>
              </>
            }
          />
        </div>
        <div className="lg:col-span-6">
          <ul className="grid border-t border-navy/15">
            {SUPPLIER_MARKET_CHANNELS.map((c, i) => (
              <li
                key={c}
                data-reveal
                style={delay(i * 80)}
                className="group flex min-h-20 items-center justify-between gap-6 border-b border-navy/15 py-5"
              >
                <span className="flex items-center gap-5">
                  <span className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] text-gold">
                    0{i + 1}
                  </span>
                  <span className="text-lg font-semibold text-navy">{c}</span>
                </span>
                <span
                  aria-hidden
                  className="h-px w-8 bg-gold transition-all duration-500 group-hover:w-14"
                />
              </li>
            ))}
          </ul>
          <p data-reveal className="mt-6 text-sm leading-relaxed text-slate-ink">
            Primary market: United Arab Emirates. Regional commercial focus: selected GCC markets.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function ComplianceNote({ light, className }: { light?: boolean; className?: string }) {
  return (
    <div
      data-reveal
      className={cn(
        "grid gap-4 border-t pt-8 text-sm leading-relaxed sm:grid-cols-2 sm:gap-10",
        light ? "border-white/15 text-white/65" : "border-rule text-slate-ink",
        className,
      )}
    >
      {COMPLIANCE_STATEMENTS.map((c) => (
        <p key={c} className="flex gap-4">
          <span
            aria-hidden
            className={cn("mt-2 size-1.5 shrink-0 rotate-45", light ? "bg-gold-soft" : "bg-gold")}
          />
          {c}
        </p>
      ))}
    </div>
  );
}
