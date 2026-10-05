import { Link } from "@tanstack/react-router";
import { MessageCircle, Phone } from "lucide-react";
import { CONTACT_LINKS } from "@/lib/site";

/** Persistent enquiry bar for phones and small tablets. */
export function MobileActionBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="grid grid-cols-[1fr_auto_auto]">
        <Link
          to="/become-a-supplier"
          hash="supplier-enquiry"
          className="flex min-h-14 items-center justify-center bg-gold px-4 text-[0.72rem] font-semibold tracking-[0.16em] text-navy-deep uppercase"
        >
          Supplier Enquiry
        </Link>
        <a
          href={CONTACT_LINKS.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp AL NOKHBA TRADING"
          className="flex min-h-14 min-w-16 items-center justify-center gap-2 border-l border-white/10 px-4 text-white"
        >
          <MessageCircle className="size-5" strokeWidth={1.75} />
          <span className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold sm:tracking-[0.14em] sm:uppercase">
            WhatsApp
          </span>
        </a>
        <a
          href={CONTACT_LINKS.tel}
          aria-label="Call AL NOKHBA TRADING"
          className="flex min-h-14 min-w-16 items-center justify-center gap-2 border-l border-white/10 px-4 text-white"
        >
          <Phone className="size-5" strokeWidth={1.75} />
          <span className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold sm:tracking-[0.14em] sm:uppercase">
            Call
          </span>
        </a>
      </div>
    </div>
  );
}
