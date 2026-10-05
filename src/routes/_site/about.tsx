import { createFileRoute } from "@tanstack/react-router";
import { COMPANY, IMAGES, seo } from "@/lib/site";
import { PageHero, SectionHeading, SiteImage, TextLink } from "@/components/site/primitives";
import { CtaBand } from "@/components/site/sections";

export const Route = createFileRoute("/_site/about")({
  head: () =>
    seo({
      path: "/about",
      title: "About AL NOKHBA TRADING | Licensed Goods Wholesaler in Dubai, UAE",
      description:
        "AL NOKHBA AL MASIYA GOODS WHOLESALERS L.L.C is a Dubai-based company licensed for Goods Wholesalers activities, focused on international sourcing and wholesale procurement for the UAE.",
      ogTitle: "About AL NOKHBA TRADING — Built for International Trade",
      ogDescription:
        "A Dubai-licensed goods wholesaler focused on international sourcing, wholesale procurement and reliable supplier relationships.",
    }),
  component: AboutPage,
});

const APPROACH = [
  {
    title: "Commercially Focused",
    body: "Every sourcing decision starts with commercial suitability: products, pricing and quantities that work for wholesale trade in the UAE.",
  },
  {
    title: "Internationally Connected",
    body: "We engage directly with manufacturers, exporters, wholesalers and stockists in established international markets, including Europe.",
  },
  {
    title: "Supplier Oriented",
    body: "Clear communication, structured evaluation and direct dialogue with suppliers — including meetings and facility visits where appropriate.",
  },
  {
    title: "Long-Term Thinking",
    body: "Our objective is not a single transaction but a reliable, continuing purchasing channel with each supplier we select.",
  },
];

function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Company"
        title="Built for International Trade"
        image={IMAGES.containerShip}
        lead={<p>A Dubai-based goods wholesaler sourcing internationally for the UAE market.</p>}
      />

      <section className="bg-ivory py-24 lg:py-32">
        <div className="site-container grid gap-14 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-7">
            <SectionHeading
              eyebrow="Who We Are"
              title="AL NOKHBA AL MASIYA GOODS WHOLESALERS L.L.C"
            />
            <div data-reveal className="mt-8 grid gap-5 text-lg leading-relaxed text-slate-ink">
              <p>
                AL NOKHBA AL MASIYA GOODS WHOLESALERS L.L.C is a Dubai-based company licensed for
                Goods Wholesalers activities in the United Arab Emirates.
              </p>
              <p>
                Operating under the AL NOKHBA TRADING brand, the company focuses on international
                sourcing, wholesale procurement and the development of reliable supplier
                relationships.
              </p>
              <p>
                Our approach is straightforward: identify commercially suitable products, engage
                directly with suppliers, evaluate the opportunity and establish a reliable
                purchasing channel for the UAE market.
              </p>
            </div>
          </div>

          <aside
            data-reveal
            className="self-start border border-rule bg-white lg:col-span-5"
            aria-label="Company registration"
          >
            <p className="eyebrow border-b border-rule px-7 py-5 text-gold">Company Registration</p>
            <dl className="divide-y divide-rule text-sm">
              {[
                ["Legal Name", COMPANY.legalName],
                ["Trading Name", COMPANY.brand],
                ["Licensed Activity", COMPANY.activity],
                ["UAE Trade Licence No.", COMPANY.licenceNo],
                [
                  "Registered Address",
                  `${COMPANY.addressLine1}, ${COMPANY.city}, ${COMPANY.country}`,
                ],
                ["Website", COMPANY.domain],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-1 px-7 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
                  <dt className="text-slate-ink">{k}</dt>
                  <dd className="font-semibold break-words text-navy">{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <section className="bg-white py-24 lg:py-32" aria-labelledby="our-approach">
        <div className="site-container">
          <SectionHeading
            eyebrow="Our Approach"
            title={<span id="our-approach">How We Work with Suppliers</span>}
          />
          <ol className="mt-14 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {APPROACH.map((a, i) => (
              <li
                key={a.title}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}
                className="group flex flex-col bg-white p-8 transition-colors duration-300 hover:bg-ivory"
              >
                <span className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] text-gold">
                  0{i + 1}
                </span>
                <h3 className="mt-8 text-xl font-semibold text-navy uppercase">{a.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-slate-ink">{a.body}</p>
                <span
                  aria-hidden
                  className="mt-8 h-px w-10 bg-gold transition-all duration-500 group-hover:w-16"
                />
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-stone py-24 lg:py-32">
        <div className="site-container grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div data-reveal className="lg:col-span-6">
            <SiteImage
              image={IMAGES.warehouseAisle}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[4/3] w-full"
            />
          </div>
          <div className="lg:col-span-6">
            <SectionHeading
              eyebrow="Physical Goods"
              title="Wholesale trade in real products"
              intro={
                <p>
                  Our activity is the purchase and wholesale of physical goods: professional
                  cleaning and hygiene, hardware and technical supplies, industrial and maintenance
                  products, building and renovation supplies, home and interior products,
                  hospitality and catering supplies and other non-food consumer goods.
                </p>
              }
            />
            <div data-reveal className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
              <TextLink to="/trading-sectors">Trading Sectors</TextLink>
              <TextLink to="/international-sourcing">Sourcing Process</TextLink>
            </div>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
