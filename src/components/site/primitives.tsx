import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SiteImageDef, SitePath } from "@/lib/site";

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "light" | "dark" | "outlineLight" | "outlineDark" | "gold";

const base =
  "group inline-flex min-h-12 items-center justify-center gap-3 px-6 py-3 text-[0.78rem] font-semibold uppercase tracking-[0.16em] transition-colors duration-300";

const variants: Record<ButtonVariant, string> = {
  light: "bg-ivory text-navy hover:bg-white",
  dark: "bg-navy text-ivory hover:bg-navy-deep",
  gold: "bg-gold text-navy-deep hover:bg-gold-soft",
  outlineLight: "border border-white/35 text-white hover:border-white hover:bg-white/5",
  outlineDark: "border border-navy/25 text-navy hover:border-navy hover:bg-navy/[0.03]",
};

export function buttonClass(variant: ButtonVariant = "dark", className?: string) {
  return cn(base, variants[variant], className);
}

function Arrow() {
  return (
    <ArrowRight
      aria-hidden
      className="size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1"
      strokeWidth={1.75}
    />
  );
}

export function ButtonLink({
  to,
  hash,
  children,
  variant = "dark",
  className,
  arrow = true,
}: {
  to: SitePath;
  hash?: string;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  arrow?: boolean;
}) {
  return (
    <Link to={to} hash={hash} className={buttonClass(variant, className)}>
      <span>{children}</span>
      {arrow && <Arrow />}
    </Link>
  );
}

export function ButtonAnchor({
  href,
  children,
  variant = "dark",
  className,
  arrow = false,
  icon,
  external,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  arrow?: boolean;
  icon?: ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      className={buttonClass(variant, className)}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {icon}
      <span>{children}</span>
      {arrow && <Arrow />}
    </a>
  );
}

export function TextLink({
  to,
  children,
  light,
}: {
  to: SitePath;
  children: ReactNode;
  light?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group inline-flex items-center gap-3 border-b pb-1.5 text-[0.78rem] font-semibold uppercase tracking-[0.16em] transition-colors",
        light
          ? "border-gold/60 text-white hover:border-white"
          : "border-gold text-navy hover:border-navy",
      )}
    >
      {children}
      <Arrow />
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

export function Eyebrow({
  children,
  light,
  className,
}: {
  children: ReactNode;
  light?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "eyebrow flex items-center gap-3",
        light ? "text-gold-soft" : "text-gold",
        className,
      )}
    >
      <span aria-hidden className={cn("h-px w-8", light ? "bg-gold-soft/70" : "bg-gold")} />
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  light,
  className,
  align = "left",
  as: Tag = "h2",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  light?: boolean;
  className?: string;
  align?: "left" | "center";
  as?: "h1" | "h2";
}) {
  return (
    <div
      data-reveal
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center [&_p.eyebrow]:justify-center",
        className,
      )}
    >
      {eyebrow && <Eyebrow light={light}>{eyebrow}</Eyebrow>}
      <Tag
        className={cn(
          "mt-5 text-[1.85rem] leading-[1.08] font-semibold uppercase sm:text-4xl lg:text-[2.75rem]",
          light ? "text-white" : "text-navy",
        )}
      >
        {title}
      </Tag>
      {intro && (
        <div
          className={cn(
            "mt-6 text-base leading-relaxed sm:text-lg",
            light ? "text-white/75" : "text-slate-ink",
          )}
        >
          {intro}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

const WIDTHS = [480, 768, 1080, 1440, 1920];

function unsplashSrc(src: string, w: number) {
  return `${src}?auto=format&fit=crop&q=70&w=${w}`;
}

export function SiteImage({
  image,
  sizes = "100vw",
  priority,
  className,
  imgClassName,
}: {
  image: SiteImageDef;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // An image can fail before hydration attaches onError — detect that on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  const isUnsplash = image.src.startsWith("https://images.unsplash.com/");
  return (
    <div className={cn("relative overflow-hidden bg-navy-soft site-grain", className)}>
      {!failed && (
        <img
          ref={imgRef}
          src={isUnsplash ? unsplashSrc(image.src, 1440) : image.src}
          srcSet={
            isUnsplash
              ? WIDTHS.map((w) => `${unsplashSrc(image.src, w)} ${w}w`).join(", ")
              : undefined
          }
          sizes={sizes}
          alt={image.alt}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 h-full w-full object-cover", imgClassName)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page hero                                                           */
/* ------------------------------------------------------------------ */

export function PageHero({
  eyebrow,
  title,
  lead,
  image,
  children,
  compact,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  image?: SiteImageDef;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-navy-deep text-white">
      {image && (
        <>
          <SiteImage
            image={image}
            priority
            className="absolute inset-0 -z-20"
            imgClassName="opacity-45"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-deep via-navy-deep/85 to-navy-deep/40"
          />
        </>
      )}
      <div
        className={cn(
          "site-container flex flex-col justify-end",
          compact
            ? "pt-36 pb-16 sm:pt-40 sm:pb-20"
            : "min-h-[34rem] pt-36 pb-16 sm:min-h-[38rem] sm:pb-24 lg:min-h-[42rem]",
        )}
      >
        <Eyebrow light className="site-page-in">
          {eyebrow}
        </Eyebrow>
        <h1 className="site-page-in mt-6 max-w-4xl text-[2.35rem] leading-[1.02] font-semibold uppercase sm:text-5xl lg:text-[4.25rem]">
          {title}
        </h1>
        {lead && (
          <div className="site-page-in mt-7 max-w-2xl text-base leading-relaxed text-white/80 [animation-delay:120ms] sm:text-lg">
            {lead}
          </div>
        )}
        {children && <div className="site-page-in mt-10 [animation-delay:200ms]">{children}</div>}
        <div aria-hidden className="site-line-in mt-14 h-px w-full bg-white/15" />
      </div>
    </section>
  );
}
