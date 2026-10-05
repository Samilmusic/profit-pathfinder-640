import { useId, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Link } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Mail, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPANY, CONTACT_LINKS } from "@/lib/site";
import {
  ACCEPT_ATTR,
  COMPANY_TYPES,
  EXPORT_UAE_OPTIONS,
  ORDER_VALUE_OPTIONS,
  PRODUCT_CATEGORIES,
  STOCK_OPTIONS,
  YES_NO,
  supplierEnquirySchema,
  validateFile,
  type SupplierEnquiry,
} from "@/lib/supplier-enquiry";
import { buttonClass } from "./primitives";

type Status = "idle" | "submitting" | "success" | "error";

const inputClass =
  "block w-full rounded-none border border-rule bg-white px-4 py-3 text-charcoal placeholder:text-slate-ink/50 transition-colors focus:border-navy focus:outline-none aria-[invalid=true]:border-red-700";

function Field({
  label,
  required,
  error,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  htmlFor: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-[0.78rem] font-semibold tracking-wide text-navy"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-gold" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-ink">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-x-6 gap-y-6 border-t border-rule pt-8 sm:grid-cols-2">
      <legend className="eyebrow float-left mb-6 w-full text-gold sm:col-span-2">{legend}</legend>
      {children}
    </fieldset>
  );
}

function FileInput({
  id,
  name,
  label,
  file,
  error,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  file: File | null;
  error?: string;
  onChange: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Field
      label={label}
      htmlFor={id}
      error={error}
      hint="PDF, Excel, CSV, Word, PowerPoint, ZIP or image · max 10 MB"
    >
      <div
        className={cn(
          "relative flex min-h-14 items-center gap-3 border border-dashed bg-white px-4 py-3",
          error ? "border-red-700" : "border-navy/25",
        )}
      >
        <FileUp className="size-5 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-slate-ink">
          {file ? file.name : "Choose a file"}
        </span>
        {file && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (ref.current) ref.current.value = "";
            }}
            className="relative z-10 inline-flex size-9 items-center justify-center text-slate-ink hover:text-navy"
            aria-label={`Remove ${label.toLowerCase()}`}
          >
            <X className="size-4" />
          </button>
        )}
        <input
          ref={ref}
          id={id}
          name={name}
          type="file"
          accept={ACCEPT_ATTR}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>
    </Field>
  );
}

export function SupplierForm() {
  const uid = useId();
  const id = (n: string) => `${uid}-${n}`;
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [catalogue, setCatalogue] = useState<File | null>(null);
  const [productList, setProductList] = useState<File | null>(null);
  const [fileErrors, setFileErrors] = useState<{ catalogue?: string; productList?: string }>({});
  const topRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupplierEnquiry>({
    resolver: zodResolver(supplierEnquirySchema),
    mode: "onTouched",
    defaultValues: {
      productCategory: "",
      companyType: "",
      uaeDistributor: "",
      stockAvailability: "",
      orderValue: "",
      canExportUae: "",
    } as unknown as Partial<SupplierEnquiry>,
  });

  const a11y = (name: keyof SupplierEnquiry) => ({
    id: id(name),
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${id(name)}-error` : undefined,
  });

  const setFile = (key: "catalogue" | "productList", f: File | null) => {
    const err = f ? validateFile(f) : null;
    setFileErrors((prev) => ({ ...prev, [key]: err ?? undefined }));
    (key === "catalogue" ? setCatalogue : setProductList)(err ? null : f);
  };

  const onSubmit = async (values: SupplierEnquiry, honeypot: string) => {
    setStatus("submitting");
    setErrorMessage("");
    const body = new FormData();
    for (const [k, v] of Object.entries(values)) body.append(k, (v ?? "").toString());
    body.append("fax", honeypot);
    if (catalogue) body.append("catalogue", catalogue);
    if (productList) body.append("productList", productList);

    try {
      const res = await fetch("/api/public/supplier-enquiry", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMessage(
          data.error === "file_too_large" || data.error === "invalid_file"
            ? "One of the attached files could not be accepted. Please check the format and size (max 10 MB each) and try again."
            : data.error === "validation"
              ? "Some required details are missing or invalid. Please review the form and try again."
              : `We could not submit your proposal at this moment. Please try again, or email it directly to ${COMPANY.email}.`,
        );
        setStatus("error");
        return;
      }
      setStatus("success");
      reset();
      setCatalogue(null);
      setProductList(null);
      requestAnimationFrame(() =>
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch {
      setErrorMessage(
        `A network error prevented your proposal from being sent. Please try again, or email it directly to ${COMPANY.email}.`,
      );
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div ref={topRef} role="status" className="border border-rule bg-white p-8 sm:p-12">
        <CheckCircle2 className="size-10 text-gold" strokeWidth={1.5} aria-hidden />
        <h3 className="mt-6 text-2xl font-semibold text-navy">Proposal received</h3>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-ink">
          Thank you. Your supplier proposal has been submitted to our procurement team for review.
        </p>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-ink">
          For additional documents or follow-up correspondence, please write to{" "}
          <a
            href={CONTACT_LINKS.email}
            className="font-semibold text-navy underline decoration-gold underline-offset-4"
          >
            {COMPANY.email}
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className={cn(buttonClass("outlineDark"), "mt-8")}
        >
          Submit another proposal
        </button>
      </div>
    );
  }

  return (
    <div ref={topRef}>
      <form
        noValidate
        className="site-form grid gap-10"
        onSubmit={(e) => {
          const hp =
            (e.currentTarget.elements.namedItem("fax") as HTMLInputElement | null)?.value ?? "";
          void handleSubmit((v) => onSubmit(v, hp))(e);
        }}
      >
        {/* Honeypot (hidden from people and assistive tech) */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Fax
            <input type="text" name="fax" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <Group legend="Company">
          <Field
            label="Company Name"
            required
            htmlFor={id("companyName")}
            error={errors.companyName?.message}
          >
            <input
              {...register("companyName")}
              {...a11y("companyName")}
              autoComplete="organization"
              className={inputClass}
            />
          </Field>
          <Field label="Country" required htmlFor={id("country")} error={errors.country?.message}>
            <input
              {...register("country")}
              {...a11y("country")}
              autoComplete="country-name"
              className={inputClass}
            />
          </Field>
          <Field
            label="Company Website"
            required
            htmlFor={id("website")}
            error={errors.website?.message}
          >
            <input
              {...register("website")}
              {...a11y("website")}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="www.yourcompany.com"
              className={inputClass}
            />
          </Field>
          <Field label="Company Type" htmlFor={id("companyType")}>
            <select {...register("companyType")} {...a11y("companyType")} className={inputClass}>
              <option value="">Select…</option>
              {COMPANY_TYPES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
        </Group>

        <Group legend="Contact">
          <Field
            label="Contact Person"
            required
            htmlFor={id("contactPerson")}
            error={errors.contactPerson?.message}
          >
            <input
              {...register("contactPerson")}
              {...a11y("contactPerson")}
              autoComplete="name"
              className={inputClass}
            />
          </Field>
          <Field label="Job Title" htmlFor={id("jobTitle")}>
            <input
              {...register("jobTitle")}
              {...a11y("jobTitle")}
              autoComplete="organization-title"
              className={inputClass}
            />
          </Field>
          <Field
            label="Business Email"
            required
            htmlFor={id("email")}
            error={errors.email?.message}
          >
            <input
              {...register("email")}
              {...a11y("email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              className={inputClass}
            />
          </Field>
          <Field
            label="Telephone / WhatsApp"
            required
            htmlFor={id("phone")}
            error={errors.phone?.message}
          >
            <input
              {...register("phone")}
              {...a11y("phone")}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+32 …"
              className={inputClass}
            />
          </Field>
        </Group>

        <Group legend="Products & Supply">
          <Field
            label="Product Category"
            required
            htmlFor={id("productCategory")}
            error={errors.productCategory?.message}
          >
            <select
              {...register("productCategory")}
              {...a11y("productCategory")}
              className={inputClass}
            >
              <option value="" disabled>
                Select…
              </option>
              {PRODUCT_CATEGORIES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Product / Brand Names" htmlFor={id("productBrands")}>
            <input
              {...register("productBrands")}
              {...a11y("productBrands")}
              className={inputClass}
            />
          </Field>
          <Field label="Existing UAE Distributor?" htmlFor={id("uaeDistributor")}>
            <select
              {...register("uaeDistributor")}
              {...a11y("uaeDistributor")}
              className={inputClass}
            >
              <option value="">Select…</option>
              {YES_NO.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Current Export Markets" htmlFor={id("exportMarkets")}>
            <input
              {...register("exportMarkets")}
              {...a11y("exportMarkets")}
              placeholder="e.g. EU, GCC, Africa"
              className={inputClass}
            />
          </Field>
          <Field label="MOQ" htmlFor={id("moq")}>
            <input
              {...register("moq")}
              {...a11y("moq")}
              placeholder="e.g. 1 pallet / 1 × 20ft container"
              className={inputClass}
            />
          </Field>
          <Field label="Typical Order Lead Time" htmlFor={id("leadTime")}>
            <input
              {...register("leadTime")}
              {...a11y("leadTime")}
              placeholder="e.g. 2–3 weeks"
              className={inputClass}
            />
          </Field>
          <Field label="Current Stock Availability" htmlFor={id("stockAvailability")}>
            <select
              {...register("stockAvailability")}
              {...a11y("stockAvailability")}
              className={inputClass}
            >
              <option value="">Select…</option>
              {STOCK_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Indicative Wholesale Order Value" htmlFor={id("orderValue")}>
            <select {...register("orderValue")} {...a11y("orderValue")} className={inputClass}>
              <option value="">Select…</option>
              {ORDER_VALUE_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Can you export to the UAE?" htmlFor={id("canExportUae")}>
            <select {...register("canExportUae")} {...a11y("canExportUae")} className={inputClass}>
              <option value="">Select…</option>
              {EXPORT_UAE_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
        </Group>

        <Group legend="Documents & Message">
          <FileInput
            id={id("catalogue")}
            name="catalogue"
            label="Catalogue Upload"
            file={catalogue}
            error={fileErrors.catalogue}
            onChange={(f) => setFile("catalogue", f)}
          />
          <FileInput
            id={id("productList")}
            name="productList"
            label="Product List Upload"
            file={productList}
            error={fileErrors.productList}
            onChange={(f) => setFile("productList", f)}
          />
          <Field label="Message" htmlFor={id("message")} className="sm:col-span-2">
            <textarea
              {...register("message")}
              {...a11y("message")}
              rows={6}
              placeholder="Product range, wholesale pricing, export terms (Incoterms), sample availability…"
              className={cn(inputClass, "resize-y")}
            />
          </Field>
        </Group>

        {status === "error" && (
          <div
            role="alert"
            className="flex gap-4 border border-red-700/30 bg-red-50 p-5 text-sm text-red-900"
          >
            <AlertCircle className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden />
            <div>
              <p className="font-semibold">Submission not completed</p>
              <p className="mt-1 leading-relaxed">{errorMessage}</p>
              <a
                href={CONTACT_LINKS.emailSupplierRelations}
                className="mt-3 inline-flex items-center gap-2 font-semibold underline underline-offset-4"
              >
                <Mail className="size-4" /> Email procurement
              </a>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5 border-t border-rule pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-xs leading-relaxed text-slate-ink">
            Fields marked <span className="text-gold">*</span> are required. Information submitted
            is used solely to evaluate the supply opportunity, as described in our{" "}
            <Link to="/privacy-policy" className="underline underline-offset-2 hover:text-navy">
              Privacy Policy
            </Link>
            .
          </p>
          <button
            type="submit"
            disabled={status === "submitting"}
            className={cn(
              buttonClass("dark"),
              "w-full shrink-0 disabled:cursor-wait disabled:opacity-70 sm:w-auto",
            )}
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Submitting…
              </>
            ) : (
              "Submit Supplier Proposal"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
