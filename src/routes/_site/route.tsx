import { useEffect } from "react";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { MobileActionBar } from "@/components/site/mobile-action-bar";
import { ORGANIZATION_JSON_LD } from "@/lib/site";

// Layout for the public corporate website (AL NOKHBA TRADING).
export const Route = createFileRoute("/_site")({
  head: () => ({
    meta: [{ name: "theme-color", content: "#141c30" }],
    links: [
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://images.unsplash.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&display=swap",
      },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(ORGANIZATION_JSON_LD) }],
  }),
  component: SiteLayout,
});

function useScrollReveal(pathname: string) {
  useEffect(() => {
    const root = document.documentElement;
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const observeAll = () =>
      document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((el) => io.observe(el));
    observeAll();
    // Content rendered later (e.g. success states) is picked up as well.
    const mo = new MutationObserver(observeAll);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, [pathname]);
}

function SiteLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useScrollReveal(pathname);

  return (
    <div className="site flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-[60] bg-gold px-4 py-3 text-sm font-semibold text-navy-deep focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" key={pathname} className="site-page-in flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <MobileActionBar />
    </div>
  );
}
