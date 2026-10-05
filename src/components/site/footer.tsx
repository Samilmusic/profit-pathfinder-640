import { Link } from "@tanstack/react-router";
import { COMPANY, CONTACT_LINKS, type SitePath } from "@/lib/site";
import { Wordmark } from "./logo";

const FOOTER_NAV: { label: string; to: SitePath }[] = [
  { label: "Company", to: "/about" },
  { label: "Trading Sectors", to: "/trading-sectors" },
  { label: "International Sourcing", to: "/international-sourcing" },
  { label: "Procurement", to: "/wholesale-procurement" },
  { label: "Become a Supplier", to: "/become-a-supplier" },
  { label: "Contact", to: "/contact" },
  { label: "Privacy Policy", to: "/privacy-policy" },
  { label: "Terms & Conditions", to: "/terms-and-conditions" },
];

export function SiteFooter() {
  return (
    <footer className="bg-navy-deep pb-24 text-white/70 lg:pb-0">
      <div className="site-container pt-20 pb-12 lg:pt-24">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-4">
            <Link to="/" aria-label="AL NOKHBA TRADING — Home" className="inline-block">
              <Wordmark light />
            </Link>
            <p className="eyebrow mt-8 text-gold-soft">{COMPANY.tagline}</p>
            <p className="mt-5 max-w-sm text-sm leading-relaxed">
              Dubai-based goods wholesaler sourcing, purchasing and importing commercially viable
              products from international suppliers for wholesale and B2B distribution in the United
              Arab Emirates and selected GCC markets.
            </p>
          </div>

          <nav aria-label="Footer" className="lg:col-span-3">
            <p className="eyebrow text-white/45">Navigation</p>
            <ul className="mt-6 grid gap-1 text-sm">
              {FOOTER_NAV.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="inline-flex min-h-9 items-center transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-5">
            <p className="eyebrow text-white/45">Company Information</p>
            <address className="mt-6 grid gap-5 text-sm leading-relaxed not-italic">
              <div>
                <p className="font-semibold text-white">{COMPANY.legalName}</p>
                <p>
                  {COMPANY.addressLine1}, {COMPANY.city}, UAE
                </p>
              </div>
              <dl className="grid gap-1">
                <div className="flex flex-wrap gap-x-2">
                  <dt>Trade Licence No.</dt>
                  <dd className="text-white">{COMPANY.licenceNo}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt>Licensed Activity:</dt>
                  <dd className="text-white">{COMPANY.activity}</dd>
                </div>
              </dl>
              <div className="grid gap-1">
                <a
                  href={CONTACT_LINKS.email}
                  className="w-fit break-all text-white transition-colors hover:text-gold-soft"
                >
                  {COMPANY.email}
                </a>
                <a
                  href={CONTACT_LINKS.tel}
                  className="w-fit text-white transition-colors hover:text-gold-soft"
                >
                  {COMPANY.phoneDisplay}
                </a>
                <Link to="/" className="w-fit transition-colors hover:text-white">
                  {COMPANY.domain}
                </Link>
              </div>
            </address>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-white/10 pt-8 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 {COMPANY.legalName}. All Rights Reserved.</p>
          <p className="eyebrow text-[0.62rem] text-white/40">Dubai • United Arab Emirates</p>
        </div>
      </div>
    </footer>
  );
}
