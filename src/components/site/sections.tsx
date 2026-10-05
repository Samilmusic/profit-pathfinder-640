import { Link } from "@tanstack/react-router";
import { Mail, MessageCircle } from "lucide-react";
import { CONTACT_LINKS, IMAGES, SECTORS, SUPPLY_CRITERIA, type Sector } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ButtonAnchor, ButtonLink, SectionHeading, SiteImage } from "./primitives";

/* ------------------------------------------------------------------ */

export function SectorCard({ sector, index }: { sector: Sector; index: number }) {
  return (
    <Link
      to="/trading-sectors"
      hash={sector.slug}
      data-reveal
      style={{ ["--reveal-delay" as string]: `${(index % 4) * 80}ms` }}
      className="group flex flex-col bg-white transition-shadow duration-500 hover:shadow-[0_24px_48px_-28px_oklch(0.2_0.04_255/0.45)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <SiteImage
          image={sector.image}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="absolute inset-0"
          imgClassName="transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-navy-deep/60 via-transparent to-transparent"
        />
        <span className="absolute bottom-4 left-5 font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.2em] text-white">
          {sector.no}
        </span>
      </div>
      <div className="flex flex-1 flex-col border-x border-b border-rule p-6">
        <h3 className="text-lg leading-snug font-semibold text-navy">{sector.shortTitle}</h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-ink">{sector.description}</p>
        <span
          aria-hidden
          className="mt-6 h-px w-10 bg-gold transition-all duration-500 group-hover:w-20"
        />
      </div>
    </Link>
  );
}

export function SectorGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {SECTORS.map((s, i) => (
        <SectorCard key={s.slug} sector={s} index={i} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function UaeMarketSection() {
  const areas = [
    { title: "Import", body: "International goods sourced and imported into the UAE." },
    { title: "Wholesale", body: "Products supplied through commercial wholesale channels." },
    {
      title: "Partnerships",
      body: "Long-term supplier relationships developed with international businesses.",
    },
  ];
  return (
    <section className="bg-stone py-24 lg:py-32" aria-labelledby="uae-market">
      <div className="site-container grid gap-14 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeading
            eyebrow="Why the UAE"
            title={<span id="uae-market">Access the UAE Market</span>}
            intro={
              <>
                <p>
                  The United Arab Emirates is an established international trading and logistics
                  market, connecting businesses across the Middle East with international markets.
                </p>
                <p className="mt-4">
                  AL NOKHBA evaluates international products for potential wholesale opportunities
                  within the UAE.
                </p>
              </>
            }
          />
        </div>
        <div className="lg:col-span-7">
          <ol className="grid border-t border-navy/15">
            {areas.map((a, i) => (
              <li
                key={a.title}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 100}ms` }}
                className="grid grid-cols-[3rem_1fr] gap-4 border-b border-navy/15 py-8 sm:grid-cols-[5rem_12rem_1fr] sm:items-baseline"
              >
                <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.2em] text-gold">
                  0{i + 1}
                </span>
                <h3 className="text-xl font-semibold tracking-wide text-navy uppercase">
                  {a.title}
                </h3>
                <p className="col-start-2 text-slate-ink sm:col-start-auto">{a.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function StockAvailabilitySection({ className }: { className?: string }) {
  return (
    <section
      className={cn("bg-navy py-24 text-white lg:py-32", className)}
      aria-labelledby="stock-availability"
    >
      <div className="site-container grid gap-14 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeading
            light
            eyebrow="Stock & Lead Times"
            title={<span id="stock-availability">Ready for Commercial Opportunities</span>}
            intro={
              <>
                <p>
                  We value suppliers with established product ranges, reliable stock availability
                  and practical lead times.
                </p>
                <p className="mt-4">
                  For new sourcing opportunities, our procurement team generally prioritizes
                  products that can be sampled, evaluated and supplied within commercially
                  reasonable timelines.
                </p>
                <p className="mt-4 text-white/60">
                  We also welcome manufacturers able to produce to order within practical
                  timeframes.
                </p>
              </>
            }
          />
        </div>
        <div className="lg:col-span-7">
          <ul className="grid gap-px bg-white/10 sm:grid-cols-2">
            {SUPPLY_CRITERIA.map((c, i) => (
              <li
                key={c}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${(i % 2) * 80}ms` }}
                className="flex min-h-24 items-center gap-5 bg-navy px-6 py-6 transition-colors duration-300 hover:bg-navy-soft"
              >
                <span className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] text-gold-soft">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-base font-medium text-white">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function CtaBand({
  eyebrow = "Supplier Enquiries",
  title = "Discuss a wholesale supply opportunity",
  body = "Share your catalogue, wholesale price list, stock availability, MOQ and export terms. Our procurement team reviews every supplier proposal.",
}: {
  eyebrow?: string;
  title?: string;
  body?: string;
}) {
  return (
    <section className="bg-ivory py-24 lg:py-28">
      <div className="site-container">
        <div className="grid gap-10 border-t border-navy/15 pt-14 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <SectionHeading eyebrow={eyebrow} title={title} intro={<p>{body}</p>} />
          </div>
          <div
            data-reveal
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:col-span-5 lg:justify-end"
          >
            <ButtonLink to="/become-a-supplier" hash="supplier-enquiry" variant="dark">
              Become a Supplier
            </ButtonLink>
            <ButtonAnchor
              href={CONTACT_LINKS.emailProcurement}
              variant="outlineDark"
              icon={<Mail className="size-4" strokeWidth={1.75} />}
            >
              Contact Procurement
            </ButtonAnchor>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function MeetingSection() {
  return (
    <section className="bg-white py-24 lg:py-32" aria-labelledby="meet-procurement">
      <div className="site-container grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
        <div data-reveal className="relative lg:col-span-6">
          <SiteImage
            image={{
              ...IMAGES.factory,
              alt: "Supplier manufacturing facility visited during product evaluation",
            }}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="aspect-[4/3] w-full"
          />
          <div
            aria-hidden
            className="absolute -bottom-4 -left-4 hidden h-24 w-24 border-b border-l border-gold sm:block"
          />
        </div>
        <div className="lg:col-span-6">
          <SectionHeading
            eyebrow="Business Meetings"
            title={<span id="meet-procurement">Meet Our Procurement Team</span>}
            intro={
              <>
                <p>
                  Product evaluation and supplier relationships are important parts of our
                  procurement process.
                </p>
                <p className="mt-4">
                  Where appropriate, AL NOKHBA management may arrange meetings with prospective
                  suppliers and visit their office, showroom, warehouse or manufacturing facility
                  before completing significant purchasing arrangements.
                </p>
              </>
            }
          />
          <div data-reveal className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ButtonAnchor href={CONTACT_LINKS.emailMeeting} variant="dark" arrow>
              Arrange a Business Meeting
            </ButtonAnchor>
            <ButtonAnchor
              href={CONTACT_LINKS.whatsapp}
              variant="outlineDark"
              external
              icon={<MessageCircle className="size-4" strokeWidth={1.75} />}
            >
              WhatsApp
            </ButtonAnchor>
          </div>
        </div>
      </div>
    </section>
  );
}
