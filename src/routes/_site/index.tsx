import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Mail } from "lucide-react";
import { COMPANY, CONTACT_LINKS, IMAGES, SOURCING_STEPS, seo } from "@/lib/site";
import {
  ButtonAnchor,
  ButtonLink,
  Eyebrow,
  SectionHeading,
  SiteImage,
  TextLink,
} from "@/components/site/primitives";
import { CtaBand, MeetingSection, SectorGrid, UaeMarketSection } from "@/components/site/sections";

export const Route = createFileRoute("/_site/")({
  head: () =>
    seo({
      path: "/",
      title: "AL NOKHBA TRADING | Goods Wholesaler & International Sourcing, Dubai UAE",
      description:
        "AL NOKHBA TRADING is a licensed Dubai goods wholesaler sourcing, purchasing and importing products from international and European suppliers for wholesale distribution in the UAE.",
      ogTitle: "AL NOKHBA TRADING — Global Sourcing. UAE Wholesale.",
      ogDescription:
        "Licensed UAE goods wholesaler and importer connecting international manufacturers, exporters and wholesalers with wholesale opportunities in the United Arab Emirates.",
    }),
  component: HomePage,
});

const TRUST = ["International Sourcing", "Bulk Procurement", "Import", "Wholesale Distribution"];

function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-navy-deep text-white">
        <SiteImage
          image={IMAGES.warehouse}
          priority
          className="absolute inset-0 -z-20"
          imgClassName="opacity-55 scale-[1.02]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-deep via-navy-deep/80 to-navy-deep/25"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-navy-deep to-transparent"
        />

        <div className="site-container flex min-h-[100svh] flex-col justify-center pt-32 pb-20 sm:pt-36 lg:min-h-[52rem]">
          <Eyebrow light className="site-page-in">
            Dubai • United Arab Emirates
          </Eyebrow>
          <h1 className="site-page-in mt-7 text-[2.75rem] leading-[0.98] font-semibold uppercase sm:text-6xl lg:text-[5.5rem]">
            Global Sourcing.
            <br />
            <span className="text-gold-soft">UAE Wholesale.</span>
          </h1>
          <p className="site-page-in mt-8 max-w-2xl text-lg leading-relaxed text-white/90 [animation-delay:120ms] sm:text-xl">
            Connecting international manufacturers, exporters and wholesalers with commercial
            opportunities in the United Arab Emirates.
          </p>
          <p className="site-page-in mt-5 max-w-2xl text-base leading-relaxed text-white/70 [animation-delay:180ms]">
            AL NOKHBA TRADING sources and purchases selected products from international suppliers
            for import and wholesale distribution in the UAE.
          </p>
          <div className="site-page-in mt-10 flex flex-col gap-3 [animation-delay:240ms] sm:flex-row">
            <ButtonLink to="/become-a-supplier" variant="gold">
              Become a Supplier
            </ButtonLink>
            <ButtonAnchor
              href={CONTACT_LINKS.emailProcurement}
              variant="outlineLight"
              icon={<Mail className="size-4" strokeWidth={1.75} />}
            >
              Contact Procurement
            </ButtonAnchor>
          </div>

          <dl className="site-page-in mt-16 grid max-w-3xl gap-x-10 gap-y-3 border-t border-white/15 pt-6 text-sm [animation-delay:320ms] sm:grid-cols-3">
            <div>
              <dt className="eyebrow text-[0.62rem] text-white/50">Licensed Activity</dt>
              <dd className="mt-1 text-white">{COMPANY.activity}</dd>
            </div>
            <div>
              <dt className="eyebrow text-[0.62rem] text-white/50">UAE Trade Licence No.</dt>
              <dd className="mt-1 text-white">{COMPANY.licenceNo}</dd>
            </div>
            <div>
              <dt className="eyebrow text-[0.62rem] text-white/50">Registered in</dt>
              <dd className="mt-1 text-white">Dubai, UAE</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* TRUST BAR */}
      <section aria-label="Core activities" className="border-b border-rule bg-white">
        <ul className="site-container grid grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t, i) => (
            <li
              key={t}
              className={
                "flex min-h-20 items-center justify-center gap-3 px-2 py-6 text-center text-[0.68rem] font-semibold tracking-[0.2em] text-navy uppercase sm:text-[0.74rem] " +
                (i % 2 === 1 ? "border-l border-rule " : "") +
                (i > 1 ? "border-t border-rule lg:border-t-0 " : "") +
                (i === 2 ? "lg:border-l" : "")
              }
            >
              <span aria-hidden className="hidden size-1.5 rotate-45 bg-gold sm:block" />
              {t}
            </li>
          ))}
        </ul>
      </section>

      {/* WHO WE ARE */}
      <section className="bg-ivory py-24 lg:py-36" aria-labelledby="who-we-are">
        <div className="site-container grid gap-14 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-6">
            <SectionHeading
              eyebrow="Who We Are"
              title={
                <span id="who-we-are">A UAE Wholesale Buyer with a Global Sourcing Approach</span>
              }
            />
            <div data-reveal className="mt-8 grid gap-5 text-lg leading-relaxed text-slate-ink">
              <p>
                AL NOKHBA TRADING is a Dubai-based goods wholesaler focused on developing reliable
                international supply channels for the UAE market.
              </p>
              <p>
                We engage directly with manufacturers, exporters, wholesalers and stockists to
                identify products with strong commercial potential and establish sustainable
                purchasing relationships.
              </p>
            </div>
            <div data-reveal className="mt-10">
              <TextLink to="/about">About AL NOKHBA</TextLink>
            </div>
          </div>
          <div className="lg:col-span-6">
            <div data-reveal className="relative">
              <SiteImage
                image={IMAGES.containers}
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="aspect-[5/4] w-full"
              />
              <div className="absolute right-0 bottom-0 left-0 grid grid-cols-2 bg-navy text-white sm:left-auto sm:w-[26rem]">
                {["We Buy", "We Import", "We Wholesale", "We Build Supplier Relationships"].map(
                  (w, i) => (
                    <p
                      key={w}
                      className={
                        "flex min-h-20 items-center px-5 py-4 text-[0.7rem] leading-snug font-semibold tracking-[0.16em] uppercase " +
                        (i % 2 ? "border-l border-white/10 " : "") +
                        (i > 1 ? "border-t border-white/10" : "")
                      }
                    >
                      {w}
                    </p>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT WE SOURCE */}
      <section className="bg-stone py-24 lg:py-32" aria-labelledby="what-we-source">
        <div className="site-container">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Trading Sectors"
              title={<span id="what-we-source">What We Source</span>}
              intro={
                <p>
                  A broad goods wholesale activity covering professional, technical, household and
                  commercial product categories — purchased in wholesale quantities for the UAE
                  market.
                </p>
              }
            />
            <div data-reveal className="shrink-0">
              <TextLink to="/trading-sectors">All Trading Sectors</TextLink>
            </div>
          </div>
          <div className="mt-14">
            <SectorGrid />
          </div>
        </div>
      </section>

      {/* PROCESS PREVIEW */}
      <section className="bg-navy-deep py-24 text-white lg:py-32" aria-labelledby="how-we-source">
        <div className="site-container">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <SectionHeading
                light
                eyebrow="International Sourcing"
                title={<span id="how-we-source">A Structured Procurement Process</span>}
                intro={
                  <p>
                    From supplier identification to UAE import, every opportunity follows a clear
                    commercial process — including product evaluation and, where appropriate, a
                    visit to the supplier's facility.
                  </p>
                }
              />
              <div data-reveal className="mt-10">
                <TextLink to="/international-sourcing" light>
                  View the Sourcing Process
                </TextLink>
              </div>
            </div>
            <ol className="grid gap-px self-start bg-white/10 sm:grid-cols-3 lg:col-span-7">
              {SOURCING_STEPS.map((s, i) => (
                <li
                  key={s.no}
                  data-reveal
                  style={{ ["--reveal-delay" as string]: `${(i % 3) * 70}ms` }}
                  className={
                    "flex min-h-32 flex-col justify-between gap-6 p-6 transition-colors duration-300 " +
                    ("highlight" in s && s.highlight
                      ? "bg-navy-soft"
                      : "bg-navy-deep hover:bg-navy")
                  }
                >
                  <span className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] text-gold-soft">
                    {s.no}
                  </span>
                  <span className="text-[0.95rem] leading-snug font-semibold">{s.title}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <MeetingSection />

      <UaeMarketSection />

      {/* SUPPLIER INVITATION */}
      <section className="relative isolate overflow-hidden bg-navy py-24 text-white lg:py-32">
        <SiteImage
          image={IMAGES.containerShip}
          className="absolute inset-0 -z-20"
          imgClassName="opacity-30"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-navy via-navy/90 to-navy/60"
        />
        <div className="site-container grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <SectionHeading
              light
              eyebrow="For Manufacturers, Exporters & Stockists"
              title="Expand your products into the UAE market"
              intro={
                <p>
                  We welcome enquiries from manufacturers, exporters, wholesalers, brand owners and
                  stockists seeking new wholesale opportunities in the United Arab Emirates.
                </p>
              }
            />
          </div>
          <div data-reveal className="flex flex-col gap-3 lg:col-span-4 lg:items-end">
            <ButtonLink to="/become-a-supplier" hash="supplier-enquiry" variant="gold">
              Submit a Supplier Proposal
            </ButtonLink>
            <Link
              to="/wholesale-procurement"
              className="group inline-flex min-h-11 items-center gap-2 text-sm text-white/75 transition-colors hover:text-white"
            >
              What we look for in suppliers
              <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      <CtaBand eyebrow="Procurement Contact" title="Speak with our procurement team" />
    </>
  );
}
