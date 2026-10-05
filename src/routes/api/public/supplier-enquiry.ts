import { createFileRoute } from "@tanstack/react-router";
import {
  FIELD_LABELS,
  MAX_FILE_BYTES,
  supplierEnquirySchema,
  validateFile,
  type SupplierEnquiry,
} from "@/lib/supplier-enquiry";
import { COMPANY } from "@/lib/site";

// Receives supplier proposals from /become-a-supplier and forwards them by
// email (with attachments) to the procurement mailbox via Resend.
//
// Required server environment variables:
//   RESEND_API_KEY      — API key from resend.com (domain alnokhbatrading.com verified)
// Optional:
//   ENQUIRY_FROM_EMAIL  — default "AL NOKHBA Website <website@alnokhbatrading.com>"
//   ENQUIRY_TO_EMAIL    — default Manager@alnokhbatrading.com

const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function renderEmail(data: SupplierEnquiry, files: { label: string; name: string }[]) {
  const rows = (Object.keys(FIELD_LABELS) as (keyof SupplierEnquiry)[])
    .filter((k) => k !== "message")
    .map((k) => [FIELD_LABELS[k], (data[k] ?? "").toString().trim() || "—"] as const);

  const text = [
    "New supplier proposal submitted via alnokhbatrading.com",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Message:",
    data.message?.trim() || "—",
    "",
    files.length
      ? `Attachments: ${files.map((f) => `${f.label} (${f.name})`).join(", ")}`
      : "Attachments: none",
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2430;background:#f6f4ef;padding:24px">
<table role="presentation" width="100%" style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e4e0d6">
<tr><td style="background:#16213a;color:#fff;padding:20px 24px;font-size:13px;letter-spacing:2px">AL NOKHBA TRADING — SUPPLIER PROPOSAL</td></tr>
<tr><td style="padding:24px">
<table role="presentation" width="100%" cellpadding="8" style="border-collapse:collapse;font-size:14px">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="border-bottom:1px solid #eee;color:#666;width:40%;vertical-align:top">${escapeHtml(label)}</td><td style="border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(value)}</td></tr>`,
  )
  .join("")}
</table>
<p style="margin:24px 0 8px;color:#666;font-size:13px">Message</p>
<div style="white-space:pre-wrap;font-size:14px;line-height:1.5">${escapeHtml(data.message?.trim() || "—")}</div>
<p style="margin:24px 0 0;color:#666;font-size:13px">Attachments: ${
    files.length
      ? files.map((f) => `${escapeHtml(f.label)} (${escapeHtml(f.name)})`).join(", ")
      : "none"
  }</p>
</td></tr></table></body></html>`;

  return { text, html };
}

export const Route = createFileRoute("/api/public/supplier-enquiry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ ok: false, error: "invalid_request" }, 400);
        }

        // Honeypot: real visitors never see or fill this field.
        if (String(form.get("fax") ?? "").trim() !== "") return json({ ok: true });

        const raw: Record<string, string> = {};
        for (const key of Object.keys(FIELD_LABELS)) {
          const v = form.get(key);
          raw[key] = typeof v === "string" ? v : "";
        }
        const parsed = supplierEnquirySchema.safeParse(raw);
        if (!parsed.success) {
          return json(
            {
              ok: false,
              error: "validation",
              issues: parsed.error.issues.map((i) => i.path.join(".")),
            },
            422,
          );
        }

        const uploads: { label: string; file: File }[] = [];
        for (const [field, label] of [
          ["catalogue", "Catalogue"],
          ["productList", "Product List"],
        ] as const) {
          const f = form.get(field);
          if (f && typeof f !== "string" && f.size > 0) {
            if (validateFile(f)) return json({ ok: false, error: "invalid_file" }, 422);
            uploads.push({ label, file: f });
          }
        }
        const total = uploads.reduce((s, u) => s + u.file.size, 0);
        if (total > MAX_TOTAL_BYTES || uploads.some((u) => u.file.size > MAX_FILE_BYTES)) {
          return json({ ok: false, error: "file_too_large" }, 413);
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          console.error("[supplier-enquiry] RESEND_API_KEY is not configured");
          return json({ ok: false, error: "not_configured" }, 503);
        }

        const data = parsed.data;
        const attachments = await Promise.all(
          uploads.map(async (u) => ({
            filename: u.file.name,
            content: toBase64(new Uint8Array(await u.file.arrayBuffer())),
          })),
        );
        const { text, html } = renderEmail(
          data,
          uploads.map((u) => ({ label: u.label, name: u.file.name })),
        );

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.ENQUIRY_FROM_EMAIL || `AL NOKHBA Website <website@${COMPANY.domain}>`,
            to: [process.env.ENQUIRY_TO_EMAIL || COMPANY.email],
            reply_to: data.email,
            subject: `Supplier proposal: ${data.companyName} (${data.country}) — ${data.productCategory}`,
            text,
            html,
            attachments,
          }),
        }).catch((e: unknown) => {
          console.error("[supplier-enquiry] email request failed", e);
          return null;
        });

        if (!res || !res.ok) {
          if (res)
            console.error("[supplier-enquiry] email provider error", res.status, await res.text());
          return json({ ok: false, error: "delivery_failed" }, 502);
        }
        return json({ ok: true });
      },
    },
  },
});
