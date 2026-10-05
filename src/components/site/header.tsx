import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Mail, Menu, MessageCircle, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPANY, CONTACT_LINKS, NAV } from "@/lib/site";
import { Wordmark } from "./logo";
import { buttonClass } from "./primitives";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const solid = scrolled && !open;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-500",
        solid
          ? "border-b border-rule bg-ivory/92 shadow-[0_1px_24px_-12px_oklch(0.2_0.03_255/0.25)] backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div
        className={cn(
          "site-container flex items-center justify-between transition-[height] duration-500",
          solid ? "h-[4.5rem]" : "h-20 lg:h-24",
        )}
      >
        <Link to="/" aria-label="AL NOKHBA TRADING — Home" className="relative z-10 -my-2 py-2">
          <Wordmark light={!solid} />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1 xl:gap-3">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "relative px-3 py-2 text-[0.72rem] font-semibold tracking-[0.18em] uppercase transition-colors",
                    "after:absolute after:inset-x-3 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-gold after:transition-transform after:duration-300 hover:after:scale-x-100",
                    solid ? "text-charcoal hover:text-navy" : "text-white/85 hover:text-white",
                  )}
                  activeProps={{ className: "after:scale-x-100" }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/become-a-supplier"
            className={cn(
              buttonClass(solid ? "dark" : "light"),
              "hidden min-h-11 px-5 sm:inline-flex",
            )}
          >
            Become a Supplier
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className={cn(
              "relative z-10 inline-flex size-12 items-center justify-center border transition-colors lg:hidden",
              open
                ? "border-white/25 text-white"
                : solid
                  ? "border-navy/20 text-navy"
                  : "border-white/30 text-white",
            )}
          >
            {open ? (
              <X className="size-5" strokeWidth={1.75} />
            ) : (
              <Menu className="size-5" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="fixed inset-0 z-0 overflow-y-auto bg-navy-deep text-white lg:hidden"
      >
        <div className="site-container flex min-h-full flex-col pt-28 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <nav aria-label="Mobile">
            <ul className="divide-y divide-white/10 border-y border-white/10">
              <li>
                <Link
                  to="/"
                  className="flex min-h-14 items-center justify-between py-3 text-xl font-semibold tracking-wide uppercase"
                  activeOptions={{ exact: true }}
                  activeProps={{ className: "text-gold-soft" }}
                >
                  Home
                </Link>
              </li>
              {NAV.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="flex min-h-14 items-center justify-between py-3 text-xl font-semibold tracking-wide uppercase"
                    activeProps={{ className: "text-gold-soft" }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link
            to="/become-a-supplier"
            hash="supplier-enquiry"
            className={cn(buttonClass("gold"), "mt-8 w-full")}
          >
            Become a Supplier
          </Link>
          <div className="mt-auto grid gap-2 pt-10 text-sm text-white/75">
            <p className="eyebrow text-gold-soft">Procurement</p>
            <a href={CONTACT_LINKS.email} className="flex min-h-11 items-center gap-3 break-all">
              <Mail className="size-4 shrink-0 text-gold-soft" /> {COMPANY.email}
            </a>
            <a href={CONTACT_LINKS.tel} className="flex min-h-11 items-center gap-3">
              <Phone className="size-4 shrink-0 text-gold-soft" /> {COMPANY.phoneDisplay}
            </a>
            <a
              href={CONTACT_LINKS.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-3"
            >
              <MessageCircle className="size-4 shrink-0 text-gold-soft" /> WhatsApp
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
