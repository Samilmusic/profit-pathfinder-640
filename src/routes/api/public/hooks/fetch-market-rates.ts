import { createFileRoute } from "@tanstack/react-router";
import { MARKET_CURRENCIES, bonbastFieldsFor } from "@/lib/market-currencies";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function parseSetCookies(headers: Headers): string {
  const anyH = headers as unknown as { getSetCookie?: () => string[] };
  const list = typeof anyH.getSetCookie === "function" ? anyH.getSetCookie() : [];
  if (list.length === 0) {
    const raw = headers.get("set-cookie");
    if (raw) list.push(raw);
  }
  return list
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

type BonbastPayload = Record<string, string | number> & { last_modified?: string };

async function scrapeBonbast(): Promise<
  { ok: true; data: BonbastPayload } | { ok: false; error: string; stage: string }
> {
  let home: Response;
  try {
    home = await fetch("https://bonbast.com/", {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network error", stage: "home_fetch" };
  }
  if (!home.ok) return { ok: false, error: `home HTTP ${home.status}`, stage: "home_fetch" };

  const cookie = parseSetCookies(home.headers);
  const html = await home.text();
  const paramMatch = html.match(/param:\s*"([^"]+)"/);
  if (!paramMatch) return { ok: false, error: "param token not found", stage: "param_extract" };

  const body = new URLSearchParams({ param: paramMatch[1] }).toString();
  let jsonRes: Response;
  try {
    jsonRes = await fetch("https://bonbast.com/json", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://bonbast.com/",
        Origin: "https://bonbast.com",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network error", stage: "json_fetch" };
  }
  if (!jsonRes.ok) return { ok: false, error: `json HTTP ${jsonRes.status}`, stage: "json_fetch" };

  const text = await jsonRes.text();
  let payload: BonbastPayload;
  try {
    payload = JSON.parse(text) as BonbastPayload;
  } catch {
    return { ok: false, error: "invalid JSON response", stage: "json_parse" };
  }
  if ((payload as any).rest !== undefined && !(payload as any).usd1) {
    return { ok: false, error: "bonbast rejected token", stage: "json_reject" };
  }
  return { ok: true, data: payload };
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function insertRate(
  supabaseAdmin: any,
  currency: string,
  sell: number | null,
  buy: number | null,
  raw: any,
  errorMessage: string | null,
) {
  const status = buy || sell ? "ok" : "error";
  // Bonbast publishes rates in Toman. System unit is IRR (1 IRR = 0.1 Toman),
  // so multiply by 10 for the normalized values used by the app.
  const TOMAN_TO_IRR = 10;
  const srcMid = buy && sell ? (buy + sell) / 2 : buy ?? sell ?? null;
  const normBuy = buy != null ? buy * TOMAN_TO_IRR : null;
  const normSell = sell != null ? sell * TOMAN_TO_IRR : null;
  const normMid = srcMid != null ? srcMid * TOMAN_TO_IRR : null;
  const { error } = await supabaseAdmin.from("market_rates").insert({
    source: "bonbast",
    currency,
    buy_rate: normBuy,
    sell_rate: normSell,
    mid_rate: normMid,
    source_unit: "TOMAN",
    source_buy_rate: buy,
    source_sell_rate: sell,
    source_mid_rate: srcMid,
    raw_response: raw ? { extracted: raw } : null,
    status,
    error_message: errorMessage,
  });
  if (error) console.error("[market-rates] insert failed", currency, error);
  return status === "ok";
}

export const Route = createFileRoute("/api/public/hooks/fetch-market-rates")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, hint: "POST to trigger fetch" }), {
          headers: { "content-type": "application/json" },
        }),
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const triggeredBy = request.headers.get("x-triggered-by") ?? "manual";
        const startedAt = new Date();

        const result = await scrapeBonbast();
        const perCurrency: Record<
          string,
          { ok: boolean; buy: number | null; sell: number | null; error?: string }
        > = {};
        let success = 0;
        let failed = 0;

        if (!result.ok) {
          const errMsg = `[${result.stage}] ${result.error}`;
          console.error("[market-rates] scrape failed:", errMsg);
          // Log a fetch attempt but don't touch any per-currency rows —
          // the widget will keep showing the last successful rate for each.
          for (const c of MARKET_CURRENCIES) {
            perCurrency[c.code] = { ok: false, buy: null, sell: null, error: errMsg };
            failed++;
          }
          const finishedAt = new Date();
          await supabaseAdmin.from("market_rate_fetches").insert({
            source: "bonbast",
            started_at: startedAt.toISOString(),
            finished_at: finishedAt.toISOString(),
            duration_ms: finishedAt.getTime() - startedAt.getTime(),
            success_count: 0,
            failed_count: failed,
            currencies: perCurrency,
            error_message: errMsg,
            triggered_by: triggeredBy,
          });
          return new Response(
            JSON.stringify({
              ok: false,
              error: errMsg,
              fallback: true,
              message: "Bonbast unavailable. Using last saved/manual rate.",
              results: perCurrency,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        const p = result.data;
        for (const c of MARKET_CURRENCIES) {
          const { sellField, buyField } = bonbastFieldsFor(c.code);
          const sell = num((p as any)[sellField]);
          const buy = num((p as any)[buyField]);
          if (!sell && !buy) {
            // Not present in this payload — skip inserting a row so we don't
            // clobber the last known value with a spurious "error" record.
            perCurrency[c.code] = {
              ok: false,
              buy: null,
              sell: null,
              error: c.primary ? "missing in bonbast payload" : "not published",
            };
            if (c.primary) failed++;
            continue;
          }
          const ok = await insertRate(
            supabaseAdmin,
            c.code,
            sell,
            buy,
            {
              [sellField]: (p as any)[sellField],
              [buyField]: (p as any)[buyField],
              last_modified: p.last_modified,
            },
            null,
          );
          perCurrency[c.code] = { ok, buy, sell };
          if (ok) success++;
          else failed++;
        }

        const finishedAt = new Date();
        await supabaseAdmin.from("market_rate_fetches").insert({
          source: "bonbast",
          started_at: startedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          success_count: success,
          failed_count: failed,
          currencies: perCurrency,
          error_message: null,
          triggered_by: triggeredBy,
        });

        return new Response(
          JSON.stringify({
            ok: true,
            success,
            failed,
            results: perCurrency,
            source_last_modified: p.last_modified,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});