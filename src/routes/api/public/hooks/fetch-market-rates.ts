import { createFileRoute } from "@tanstack/react-router";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function parseSetCookies(headers: Headers): string {
  // Node fetch exposes only one Set-Cookie via .get, but .getSetCookie() is available in modern runtimes.
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

type BonbastPayload = Record<string, string | number> & {
  aed1?: string;
  aed2?: string;
  usd1?: string;
  usd2?: string;
  last_modified?: string;
};

async function scrapeBonbast(): Promise<
  { ok: true; data: BonbastPayload } | { ok: false; error: string; stage: string }
> {
  // Step 1 — load homepage to (a) get the token param and (b) collect cookies.
  let home: Response;
  try {
    home = await fetch("https://bonbast.com/", {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network error", stage: "home_fetch" };
  }
  if (!home.ok) {
    return { ok: false, error: `home HTTP ${home.status}`, stage: "home_fetch" };
  }
  const cookie = parseSetCookies(home.headers);
  const html = await home.text();
  const paramMatch = html.match(/param:\s*"([^"]+)"/);
  if (!paramMatch) {
    return { ok: false, error: "param token not found in homepage HTML", stage: "param_extract" };
  }
  const param = paramMatch[1];

  // Step 2 — POST the token to /json with cookies + XHR headers.
  const body = new URLSearchParams({ param }).toString();
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
  if (!jsonRes.ok) {
    return { ok: false, error: `json HTTP ${jsonRes.status}`, stage: "json_fetch" };
  }
  const text = await jsonRes.text();
  let payload: BonbastPayload;
  try {
    payload = JSON.parse(text) as BonbastPayload;
  } catch (e: any) {
    return { ok: false, error: "invalid JSON response", stage: "json_parse" };
  }
  if ((payload as any).rest !== undefined && !payload.usd1) {
    return { ok: false, error: "bonbast rejected token (rate limited?)", stage: "json_reject" };
  }
  return { ok: true, data: payload };
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function upsertRate(
  supabaseAdmin: any,
  currency: string,
  sell: number | null,
  buy: number | null,
  raw: any,
  errorMessage: string | null,
) {
  const status = buy || sell ? "ok" : "error";
  const mid = buy && sell ? (buy + sell) / 2 : buy ?? sell ?? null;
  const { error } = await supabaseAdmin.from("market_rates").insert({
    source: "bonbast",
    currency,
    buy_rate: buy,
    sell_rate: sell,
    mid_rate: mid,
    raw_response: raw ? { extracted: raw } : null,
    status,
    error_message: errorMessage,
  });
  if (error) console.error("[market-rates] insert failed", currency, error);
  return status;
}

export const Route = createFileRoute("/api/public/hooks/fetch-market-rates")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, hint: "POST to trigger fetch" }), {
          headers: { "content-type": "application/json" },
        }),
      POST: async () => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const result = await scrapeBonbast();

        if (!result.ok) {
          const errMsg = `[${result.stage}] ${result.error}`;
          console.error("[market-rates] bonbast fetch failed:", errMsg);
          await upsertRate(supabaseAdmin, "AED", null, null, null, errMsg);
          await upsertRate(supabaseAdmin, "USD", null, null, null, errMsg);
          return new Response(
            JSON.stringify({
              ok: false,
              error: errMsg,
              fallback: true,
              message: "Bonbast unavailable. Using last saved/manual rate.",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        const p = result.data;
        // Convention on bonbast: `1` = sell (broker sells to you = you buy the currency),
        // `2` = buy (broker buys from you = you sell). We record them as-is.
        const aedSell = num(p.aed1);
        const aedBuy = num(p.aed2);
        const usdSell = num(p.usd1);
        const usdBuy = num(p.usd2);

        const outcomes: Record<string, string> = {};
        outcomes.AED = await upsertRate(
          supabaseAdmin,
          "AED",
          aedSell,
          aedBuy,
          { aed1: p.aed1, aed2: p.aed2, last_modified: p.last_modified },
          aedSell || aedBuy ? null : "AED fields missing in bonbast payload",
        );
        outcomes.USD = await upsertRate(
          supabaseAdmin,
          "USD",
          usdSell,
          usdBuy,
          { usd1: p.usd1, usd2: p.usd2, last_modified: p.last_modified },
          usdSell || usdBuy ? null : "USD fields missing in bonbast payload",
        );

        return new Response(
          JSON.stringify({ ok: true, results: outcomes, source_last_modified: p.last_modified }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});