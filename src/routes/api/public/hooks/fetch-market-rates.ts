import { createFileRoute } from "@tanstack/react-router";

type ParsedRate = { buy: number | null; sell: number | null; raw: string | null };

function extractRate(html: string, code: string): ParsedRate {
  const lower = html.toLowerCase();
  // Bonbast marks rows with IDs like `usd1` (sell) and `usd2` (buy).
  const re = new RegExp(
    `id=["']${code}(1|2)["'][^>]*>([\\s\\S]*?)</`,
    "gi",
  );
  const found: Record<string, number> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower))) {
    const which = m[1];
    const val = Number(m[2].replace(/[,\s<>]/g, "").replace(/[^\d.]/g, ""));
    if (Number.isFinite(val) && val > 0) found[which] = val;
  }
  const raw = Object.keys(found).length ? JSON.stringify(found) : null;
  return {
    sell: found["1"] ?? null,
    buy: found["2"] ?? null,
    raw,
  };
}

async function upsertRate(
  supabaseAdmin: any,
  currency: string,
  parsed: ParsedRate,
  errorMessage: string | null,
) {
  const buy = parsed.buy;
  const sell = parsed.sell;
  const mid = buy && sell ? (buy + sell) / 2 : buy ?? sell ?? null;
  const status = buy || sell ? "ok" : "error";
  const { error } = await supabaseAdmin.from("market_rates").insert({
    source: "bonbast",
    currency,
    buy_rate: buy,
    sell_rate: sell,
    mid_rate: mid,
    raw_response: parsed.raw ? { extracted: parsed.raw } : null,
    status,
    error_message: errorMessage,
  });
  if (error) console.error("[market-rates] insert failed", currency, error);
  return status;
}

export const Route = createFileRoute("/api/public/hooks/fetch-market-rates")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        let html = "";
        let fetchError: string | null = null;
        try {
          const resp = await fetch("https://bonbast.com/", {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
              "Accept": "text/html",
              "Accept-Language": "en-US,en;q=0.9",
            },
          });
          if (!resp.ok) fetchError = `HTTP ${resp.status}`;
          else html = await resp.text();
        } catch (e: any) {
          fetchError = e?.message ?? "fetch failed";
        }

        const results: Record<string, string> = {};
        for (const cur of ["usd", "aed"] as const) {
          if (fetchError) {
            await upsertRate(
              supabaseAdmin,
              cur.toUpperCase(),
              { buy: null, sell: null, raw: null },
              fetchError,
            );
            results[cur] = "error";
            continue;
          }
          const parsed = extractRate(html, cur);
          const status = await upsertRate(
            supabaseAdmin,
            cur.toUpperCase(),
            parsed,
            parsed.buy || parsed.sell
              ? null
              : "Failed to parse rate from bonbast HTML",
          );
          results[cur] = status;
        }

        return new Response(
          JSON.stringify({ ok: true, results, error: fetchError }),
          { headers: { "content-type": "application/json" } },
        );
      },
      GET: async () => {
        return new Response(
          JSON.stringify({ ok: true, hint: "POST to trigger" }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});