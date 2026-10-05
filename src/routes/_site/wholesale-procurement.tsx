import { createFileRoute } from "@tanstack/react-router";
import { IMAGES, PROCUREMENT_CAPABILITIES, seo } from "@/lib/site";
import { ButtonLink, PageHero, SectionHeading, SiteImage } from "@/components/site/primitives";
import { CtaBand, StockAvailabilitySection, UaeMarketSection } from "@/components/site/sections";

export const Route = createFileRoute("/_site/wholesale-procurement")({
  head: () =>
    seo({
      path: "/wholesale-procurement",
      title: "Wholesale Procurement UAE | Bulk Procurement Dubai — AL NOKHBA TRADING",
      description:
        "AL NOKHBA TRADING purchases products from qualified international suppliers for import and wholesale trading in the UAE: bulk, pallet and container-scale procurement, sample review and import coordination.",
      ogTitle: "Wholesale Procurement — Purchasing for the UAE Market",
      ogDescription:
        "Bulk procurement, stock-based purchasing, container and pallet orders and import coordination for wholesale trading in the United Arab Emirates.",
    }),
  component: ProcurementPage,
});

function ProcurementPage() {
  return (
    <>
      <PageHero
        eyebrow="Wholesale Procurement"
        title="Purchasing for the UAE Market"
        image={IMAGES.warehouse}
        lead={
          <p>
            AL NOKHBA purchases products from qualified international suppliers for import and
            wholesale trading in the United Arab Emirates.
          </p>
        }
      >
        <ButtonLink to="/become-a-supplier" hash="supplier-enquiry" variant="gold">
          Become a Supplier
        </ButtonLink>
      </PageHero>

      <section className="bg-ivory py-24 lg:py-32" aria-labelledby="capabilities">
        <div className="site-container">
          <SectionHeading
            eyebrow="Procurement Capabilities"
            title={<span id="capabilities">How we purchase</span>}
            intro={
              <p>
                Direct B2B purchasing for wholesale trade — structured around commercial quantities,
                evaluated suppliers and coordinated international shipments.
              </p>
            }
          />
          <ul className="mt-14 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {PROCUREMENT_CAPABILITIES.map((c, i) => (
              <li
                key={c.title}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${(i % 4) * 80}ms` }}
                className="group relative flex min-h-64 flex-col bg-white p-7 transition-colors duration-300 hover:bg-navy"
              >
                <span className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] text-gold transition-colors group-hover:text-gold-soft">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-auto pt-10 text-lg font-semibold text-navy uppercase transition-colors group-hover:text-white">
                  {c.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-ink transition-colors group-hover:text-white/75">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <StockAvailabilitySection />

      <section className="bg-white py-24 lg:py-32">
        <div className="site-container grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-6">
            <SectionHeading
              eyebrow="Order Formats"
              title="Pallets, consolidated shipments and containers"
              intro={
                <>
                  <p>
                    Depending on the product category, procurement can include palletised goods,
                    consolidated shipments and container-scale orders.
                  </p>
                  <p className="mt-4">
                    Commercial terms — including quantities, Incoterms, payment conditions and
                    supply schedules — are agreed directly with each supplier before a purchase
                    order is issued.
                  </p>
                </>
              }
            />
          </div>
          <div data-reveal className="grid grid-cols-2 gap-4 lg:col-span-6">
            <SiteImage
              image={IMAGES.warehouseAisle}
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="aspect-[3/4] w-full"
            />
            <SiteImage
              image={IMAGES.containers}
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="mt-12 aspect-[3/4] w-full"
            />
          </div>
        </div>
      </section>

      <UaeMarketSection />
      <CtaBand />
    </>
  );
}
