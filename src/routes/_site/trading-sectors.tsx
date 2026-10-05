import { createFileRoute } from "@tanstack/react-router";
import { IMAGES, SECTORS, seo } from "@/lib/site";
import { PageHero, SiteImage } from "@/components/site/primitives";
import { CtaBand } from "@/components/site/sections";

export const Route = createFileRoute("/_site/trading-sectors")({
  head: () =>
    seo({
      path: "/trading-sectors",
      title: "Trading Sectors | General Wholesale Trading Dubai — AL NOKHBA TRADING",
      description:
        "Cleaning & hygiene, hardware, industrial, building, home & interior, hospitality and non-food consumer goods: the product sectors AL NOKHBA TRADING sources for wholesale in the UAE.",
      ogTitle: "Trading Sectors — AL NOKHBA TRADING",
      ogDescription:
        "Broad goods wholesale sectors sourced from international suppliers for wholesale distribution in the United Arab Emirates.",
    }),
  component: SectorsPage,
});

function SectorsPage() {
  return (
    <>
      <PageHero
        eyebrow="Trading Sectors"
        title="Broad Sectors. Commercial Focus."
        image={IMAGES.warehouseAisle}
        lead={
          <p>
            As a licensed goods wholesaler, AL NOKHBA sources across a broad range of non-food
            product categories. Our focus is on commercially viable products that can be purchased
            in wholesale quantities and supplied efficiently to the UAE market.
          </p>
        }
      />

      <nav
        aria-label="Sectors"
        className="sticky top-[4.5rem] z-30 hidden border-b border-rule bg-ivory/95 backdrop-blur lg:block"
      >
        <ul className="site-container flex gap-6 overflow-x-auto py-4 text-[0.68rem] font-semibold tracking-[0.16em] whitespace-nowrap text-slate-ink uppercase">
          {SECTORS.map((s) => (
            <li key={s.slug}>
              <a href={`#${s.slug}`} className="transition-colors hover:text-navy">
                <span className="text-gold">{s.no}</span> {s.shortTitle}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section className="bg-ivory py-16 lg:py-24">
        <div className="site-container grid gap-6 lg:gap-0">
          {SECTORS.map((s, i) => (
            <article
              key={s.slug}
              id={s.slug}
              className="grid scroll-mt-40 border-rule bg-white lg:grid-cols-12 lg:border-b lg:bg-transparent lg:py-14 lg:first:pt-0"
            >
              <div
                data-reveal
                className={
                  "group relative overflow-hidden lg:col-span-5 " +
                  (i % 2 ? "lg:order-2 lg:col-start-8" : "")
                }
              >
                <SiteImage
                  image={s.image}
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="aspect-[16/10] w-full"
                  imgClassName="transition-transform duration-[1200ms] group-hover:scale-[1.04]"
                />
              </div>
              <div
                data-reveal
                className={
                  "flex flex-col justify-center p-7 sm:p-10 lg:col-span-6 lg:p-0 " +
                  (i % 2 ? "lg:order-1 lg:col-start-1" : "lg:col-start-7")
                }
              >
                <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.2em] text-gold">
                  {s.no}
                </span>
                <h2 className="mt-4 text-2xl leading-tight font-semibold text-navy uppercase sm:text-3xl">
                  {s.title}
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-slate-ink">{s.description}</p>
                <ul className="mt-7 flex flex-wrap gap-2">
                  {s.examples.map((e) => (
                    <li
                      key={e}
                      className="border border-rule bg-ivory px-3 py-1.5 text-xs font-medium text-charcoal lg:bg-white"
                    >
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-navy py-20 text-white">
        <div className="site-container max-w-4xl">
          <p data-reveal className="text-xl leading-relaxed text-white/85 sm:text-2xl">
            Our sectors are intentionally broad. AL NOKHBA evaluates each opportunity on its
            commercial merits — product quality, wholesale pricing, availability and suitability for
            the UAE market — rather than limiting its activity to a single industry.
          </p>
        </div>
      </section>

      <CtaBand
        title="Supplying one of these sectors?"
        body="Send us your catalogue, product list and wholesale terms. We review proposals from manufacturers, exporters, wholesalers and stockists across all of our trading sectors."
      />
    </>
  );
}
