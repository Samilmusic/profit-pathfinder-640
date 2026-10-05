import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { COMPANY, CONTACT_LINKS, IMAGES, SUPPLIER_TYPES, WHAT_WE_LOOK_FOR, seo } from "@/lib/site";
import { ButtonLink, PageHero, SectionHeading } from "@/components/site/primitives";
import { MeetingSection } from "@/components/site/sections";
import { SupplierForm } from "@/components/site/supplier-form";

export const Route = createFileRoute("/_site/become-a-supplier")({
  head: () =>
    seo({
      path: "/become-a-supplier",
      title: "Become a Supplier | European Products Importer UAE — AL NOKHBA TRADING",
      description:
        "Manufacturers, exporters, wholesalers, brand owners and stockists: submit your supplier proposal, catalogue and wholesale terms to AL NOKHBA TRADING, a licensed UAE goods wholesaler and importer.",
      ogTitle: "Become a Supplier — Expand Your Products into the UAE Market",
      ogDescription:
        "AL NOKHBA welcomes enquiries from manufacturers, exporters, wholesalers and stockists seeking new wholesale opportunities in the United Arab Emirates.",
    }),
  component: SupplierPage,
});

function SupplierPage() {
  return (
    <>
      <PageHero
        eyebrow="Supplier Partnerships"
        title="Expand Your Products into the UAE Market"
        image={IMAGES.factory}
        lead={
          <p>
            AL NOKHBA welcomes enquiries from manufacturers, exporters, wholesalers and stockists
            seeking new wholesale opportunities in the United Arab Emirates.
          </p>
        }
      >
        <ButtonLink to="/become-a-supplier" hash="supplier-enquiry" variant="gold">
          Submit Supplier Proposal
        </ButtonLink>
      </PageHero>

      <section className="bg-ivory py-24 lg:py-32" aria-labelledby="who-we-want">
        <div className="site-container grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              eyebrow="Supplier Profile"
              title={<span id="who-we-want">Who We Want to Hear From</span>}
              intro={
                <p>
                  We engage directly with businesses that can supply commercially viable products in
                  wholesale quantities — whether from stock or through production.
                </p>
              }
            />
          </div>
          <ul className="grid gap-px self-start bg-rule sm:grid-cols-2 lg:col-span-7">
            {SUPPLIER_TYPES.map((t, i) => (
              <li
                key={t}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${(i % 2) * 80}ms` }}
                className="flex min-h-24 items-center gap-5 bg-white px-7 py-6"
              >
                <span className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] text-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-lg font-semibold text-navy">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-navy py-24 text-white lg:py-32" aria-labelledby="what-we-look-for">
        <div className="site-container">
          <SectionHeading
            light
            eyebrow="Supplier Criteria"
            title={<span id="what-we-look-for">What We Look For</span>}
          />
          <ul className="mt-14 grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {WHAT_WE_LOOK_FOR.map((c, i) => (
              <li
                key={c.title}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${(i % 4) * 80}ms` }}
                className="flex min-h-48 flex-col bg-navy p-7 transition-colors duration-300 hover:bg-navy-soft"
              >
                <span aria-hidden className="h-px w-8 bg-gold" />
                <h3 className="mt-8 text-lg font-semibold">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="supplier-enquiry"
        className="scroll-mt-20 bg-ivory py-24 lg:py-32"
        aria-labelledby="enquiry-title"
      >
        <div className="site-container grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-32">
              <SectionHeading
                eyebrow="Supplier Enquiry"
                title={<span id="enquiry-title">Submit a Supplier Proposal</span>}
                intro={
                  <p>
                    Tell us about your company, products and export terms. Proposals are reviewed by
                    our procurement team, who will contact you where there is a suitable commercial
                    fit.
                  </p>
                }
              />
              <div data-reveal className="mt-10 grid gap-1 border-t border-rule pt-8 text-sm">
                <p className="eyebrow mb-3 text-slate-ink">Prefer to write directly?</p>
                <a
                  href={CONTACT_LINKS.emailSupplierRelations}
                  className="flex min-h-11 items-center gap-3 break-all text-navy hover:text-gold"
                >
                  <Mail className="size-4 shrink-0 text-gold" strokeWidth={1.75} /> {COMPANY.email}
                </a>
                <a
                  href={CONTACT_LINKS.tel}
                  className="flex min-h-11 items-center gap-3 text-navy hover:text-gold"
                >
                  <Phone className="size-4 shrink-0 text-gold" strokeWidth={1.75} />{" "}
                  {COMPANY.phoneDisplay}
                </a>
                <a
                  href={CONTACT_LINKS.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-3 text-navy hover:text-gold"
                >
                  <MessageCircle className="size-4 shrink-0 text-gold" strokeWidth={1.75} />{" "}
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
          <div className="lg:col-span-8">
            <SupplierForm />
          </div>
        </div>
      </section>

      <MeetingSection />
    </>
  );
}
