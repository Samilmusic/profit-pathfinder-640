import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Mail, MessageCircle, Phone } from "lucide-react";
import { COMPANY, CONTACT_LINKS, IMAGES, seo } from "@/lib/site";
import { ButtonAnchor, ButtonLink, PageHero, SectionHeading } from "@/components/site/primitives";

export const Route = createFileRoute("/_site/contact")({
  head: () =>
    seo({
      path: "/contact",
      title: "Contact AL NOKHBA TRADING | Wholesale Trading Company Dubai",
      description:
        "Contact AL NOKHBA TRADING in Dubai for procurement opportunities, supplier proposals and international trade enquiries. Email, telephone and WhatsApp details and registered company information.",
      ogTitle: "Contact AL NOKHBA TRADING — Let's Discuss Business",
      ogDescription:
        "Procurement, supplier relations and general enquiries for AL NOKHBA AL MASIYA GOODS WHOLESALERS L.L.C, Dubai, UAE.",
    }),
  component: ContactPage,
});

const CATEGORIES = [
  {
    title: "Procurement",
    body: "International product sourcing and purchasing enquiries.",
    href: CONTACT_LINKS.emailProcurement,
  },
  {
    title: "Supplier Relations",
    body: "Manufacturers, exporters and wholesalers interested in working with AL NOKHBA.",
    href: CONTACT_LINKS.emailSupplierRelations,
  },
  {
    title: "General Enquiries",
    body: "General corporate and business correspondence.",
    href: CONTACT_LINKS.emailGeneral,
  },
];

function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Let's Discuss Business"
        image={IMAGES.containerShip}
        compact
        lead={
          <p>
            For procurement opportunities, supplier proposals and international trade enquiries,
            contact AL NOKHBA directly.
          </p>
        }
      />

      <section className="bg-ivory py-20 lg:py-28">
        <div className="site-container grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <div data-reveal className="grid gap-3 sm:grid-cols-2">
              <ButtonAnchor
                href={CONTACT_LINKS.emailProcurement}
                variant="dark"
                icon={<Mail className="size-4" strokeWidth={1.75} />}
              >
                Email Procurement
              </ButtonAnchor>
              <ButtonAnchor
                href={CONTACT_LINKS.tel}
                variant="outlineDark"
                icon={<Phone className="size-4" strokeWidth={1.75} />}
              >
                Call
              </ButtonAnchor>
              <ButtonAnchor
                href={CONTACT_LINKS.whatsapp}
                variant="outlineDark"
                external
                icon={<MessageCircle className="size-4" strokeWidth={1.75} />}
              >
                WhatsApp
              </ButtonAnchor>
              <ButtonLink
                to="/become-a-supplier"
                hash="supplier-enquiry"
                variant="gold"
                arrow={false}
              >
                <span className="inline-flex items-center gap-3">
                  <FileText className="size-4" strokeWidth={1.75} /> Supplier Enquiry
                </span>
              </ButtonLink>
            </div>

            <div className="mt-16">
              <SectionHeading eyebrow="Contact Categories" title="How can we help?" />
              <ul className="mt-10 border-t border-rule">
                {CATEGORIES.map((c) => (
                  <li key={c.title} data-reveal className="border-b border-rule">
                    <a
                      href={c.href}
                      className="group grid gap-2 py-7 sm:grid-cols-[14rem_1fr_auto] sm:items-center sm:gap-8"
                    >
                      <span className="text-lg font-semibold tracking-wide text-navy uppercase">
                        {c.title}
                      </span>
                      <span className="text-slate-ink">{c.body}</span>
                      <ArrowRight
                        className="hidden size-5 text-gold transition-transform group-hover:translate-x-1 sm:block"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <aside
            data-reveal
            className="self-start bg-navy text-white lg:col-span-5"
            aria-label="Company details"
          >
            <div className="border-b border-white/10 p-8 sm:p-10">
              <p className="eyebrow text-gold-soft">Registered Company</p>
              <p className="mt-5 text-xl leading-snug font-semibold">{COMPANY.legalName}</p>
              <address className="mt-4 leading-relaxed text-white/75 not-italic">
                {COMPANY.addressLine1}
                <br />
                {COMPANY.city}
                <br />
                {COMPANY.country}
              </address>
            </div>
            <dl className="divide-y divide-white/10 text-sm">
              {[
                [
                  "Email",
                  <a key="e" href={CONTACT_LINKS.email} className="break-all hover:text-gold-soft">
                    {COMPANY.email}
                  </a>,
                ],
                [
                  "Mobile / WhatsApp",
                  <a key="p" href={CONTACT_LINKS.tel} className="hover:text-gold-soft">
                    {COMPANY.phoneDisplay}
                  </a>,
                ],
                ["Trade Licence", COMPANY.licenceNo],
                ["Licensed Activity", COMPANY.activity],
                [
                  "Website",
                  <Link key="w" to="/" className="hover:text-gold-soft">
                    {COMPANY.domain}
                  </Link>,
                ],
              ].map(([k, v]) => (
                <div
                  key={k as string}
                  className="grid gap-1 px-8 py-4 sm:grid-cols-[10rem_1fr] sm:px-10"
                >
                  <dt className="text-white/50">{k}</dt>
                  <dd className="font-medium text-white">{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>
    </>
  );
}
