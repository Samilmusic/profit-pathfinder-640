import { createFileRoute } from "@tanstack/react-router";
import { IMAGES, SOURCING_STEPS, seo } from "@/lib/site";
import { ButtonLink, PageHero, SectionHeading, SiteImage } from "@/components/site/primitives";
import { CtaBand, MeetingSection } from "@/components/site/sections";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_site/international-sourcing")({
  head: () =>
    seo({
      path: "/international-sourcing",
      title: "International Sourcing UAE | European Suppliers — AL NOKHBA TRADING",
      description:
        "How AL NOKHBA TRADING sources products from manufacturers, exporters and stockists in established international markets: from supplier identification and sample evaluation to supplier visits, purchase orders and UAE import.",
      ogTitle: "International Sourcing — Sourcing Products. Building Supply Relationships.",
      ogDescription:
        "A structured nine-step sourcing process connecting international and European suppliers with wholesale trade in the UAE.",
    }),
  component: SourcingPage,
});

function SourcingPage() {
  return (
    <>
      <PageHero
        eyebrow="International Sourcing"
        title={
          <>
            Sourcing Products.
            <br />
            Building Supply Relationships.
          </>
        }
        image={IMAGES.containers}
        lead={
          <p>
            AL NOKHBA identifies potential suppliers in established international markets and
            evaluates opportunities based on commercial suitability for the UAE.
          </p>
        }
      >
        <ButtonLink to="/become-a-supplier" hash="supplier-enquiry" variant="gold">
          Become a Supplier
        </ButtonLink>
      </PageHero>

      <section className="bg-ivory py-24 lg:py-32" aria-labelledby="sourcing-process">
        <div className="site-container grid gap-16 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-32">
              <SectionHeading
                eyebrow="Sourcing Process"
                title={<span id="sourcing-process">From first contact to UAE wholesale</span>}
                intro={
                  <p>
                    Each supply opportunity follows a clear sequence. Suppliers know what to expect,
                    what information we need and how a commercial decision is reached.
                  </p>
                }
              />
            </div>
          </div>

          <ol className="lg:col-span-8">
            {SOURCING_STEPS.map((s, i) => {
              const highlight = "highlight" in s && s.highlight;
              const last = i === SOURCING_STEPS.length - 1;
              return (
                <li
                  key={s.no}
                  data-reveal
                  className="relative grid grid-cols-[3.5rem_1fr] gap-5 sm:grid-cols-[5rem_1fr] sm:gap-8"
                >
                  <div className="relative flex flex-col items-center">
                    <span
                      className={cn(
                        "relative z-10 flex size-14 items-center justify-center border font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.1em] sm:size-16",
                        highlight
                          ? "border-gold bg-navy text-gold-soft"
                          : "border-navy/20 bg-ivory text-navy",
                      )}
                    >
                      {s.no}
                    </span>
                    {!last && (
                      <span aria-hidden className="relative w-px flex-1 bg-navy/10">
                        <span className="process-line absolute inset-0 bg-gold" />
                      </span>
                    )}
                  </div>
                  <div className={cn("pb-12", last && "pb-0")}>
                    <div
                      className={cn(
                        "transition-shadow duration-500",
                        highlight
                          ? "bg-navy p-7 text-white shadow-[0_30px_60px_-35px_oklch(0.2_0.04_255/0.6)] sm:p-9"
                          : "pt-3",
                      )}
                    >
                      {highlight && (
                        <p className="eyebrow mb-4 text-gold-soft">Direct evaluation</p>
                      )}
                      <h3
                        className={cn(
                          "text-xl font-semibold uppercase sm:text-2xl",
                          highlight ? "text-white" : "text-navy",
                        )}
                      >
                        {s.title}
                      </h3>
                      <p
                        className={cn(
                          "mt-3 max-w-2xl leading-relaxed",
                          highlight ? "text-white/80" : "text-slate-ink",
                        )}
                      >
                        {s.body}
                      </p>
                      {highlight && (
                        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65">
                          Seeing products, stock and operations first-hand allows both parties to
                          confirm quality, packaging, availability and logistics before significant
                          purchasing commitments are made.
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="bg-white py-24 lg:py-32" aria-labelledby="what-we-request">
        <div className="site-container grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              eyebrow="Information Requested"
              title={<span id="what-we-request">What we typically request from suppliers</span>}
              intro={
                <p>
                  To evaluate a new opportunity efficiently, our procurement team usually asks for
                  the following during the initial discussion and commercial review.
                </p>
              }
            />
          </div>
          <ul className="grid gap-px self-start bg-rule sm:grid-cols-2 lg:col-span-7">
            {[
              "Product catalogue",
              "Wholesale price list",
              "Current stock availability",
              "Minimum order quantities (MOQ)",
              "Export terms & Incoterms",
              "Sample availability",
              "Product documentation & specifications",
              "Indicative lead times",
            ].map((t, i) => (
              <li
                key={t}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${(i % 2) * 70}ms` }}
                className="flex min-h-20 items-center gap-4 bg-white px-6 py-5"
              >
                <span aria-hidden className="size-1.5 shrink-0 rotate-45 bg-gold" />
                <span className="font-medium text-navy">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-navy-deep py-24 text-white lg:py-28">
        <SiteImage
          image={IMAGES.containerShip}
          className="absolute inset-0 -z-20"
          imgClassName="opacity-30"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-navy-deep/70" />
        <div className="site-container max-w-4xl text-center">
          <SectionHeading
            light
            align="center"
            eyebrow="Established Markets"
            title="European and international suppliers"
            intro={
              <p>
                We focus on suppliers in established international markets — with particular
                attention to European manufacturers, wholesalers and stockists offering consistent
                quality, documentation and export experience.
              </p>
            }
          />
        </div>
      </section>

      <MeetingSection />
      <CtaBand />
    </>
  );
}
