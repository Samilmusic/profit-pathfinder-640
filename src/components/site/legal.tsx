import type { ReactNode } from "react";
import { PageHero } from "./primitives";

export type LegalSection = { title: string; body: ReactNode };

export function LegalPage({
  eyebrow,
  title,
  updated,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} compact lead={<p>Last updated: {updated}</p>} />
      <section className="bg-ivory py-20 lg:py-28">
        <div className="site-container grid gap-12 lg:grid-cols-12">
          <nav aria-label="On this page" className="hidden lg:col-span-3 lg:block">
            <ol className="sticky top-32 grid gap-2 border-l border-rule pl-5 text-sm text-slate-ink">
              {sections.map((s, i) => (
                <li key={s.title}>
                  <a href={`#section-${i + 1}`} className="transition-colors hover:text-navy">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="max-w-3xl lg:col-span-8 lg:col-start-5">
            <div className="text-lg leading-relaxed text-slate-ink">{intro}</div>
            {sections.map((s, i) => (
              <section
                key={s.title}
                id={`section-${i + 1}`}
                className="scroll-mt-28 border-t border-rule pt-10 mt-10"
              >
                <h2 className="text-xl font-semibold text-navy uppercase sm:text-2xl">
                  <span className="mr-3 text-gold">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                <div className="mt-5 grid gap-4 leading-relaxed text-slate-ink [&_a]:font-medium [&_a]:text-navy [&_a]:underline [&_a]:decoration-gold [&_a]:underline-offset-4 [&_ul]:grid [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:list-disc">
                  {s.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </section>
    </>
  );
}
