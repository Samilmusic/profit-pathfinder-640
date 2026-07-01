// Read-only "data tools" the AI Brain is allowed to call.
// Each helper runs with an authenticated Supabase client so RLS applies as the
// caller (admin / milad / ali). Returns compact DTOs; never raw table dumps.

import type { SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient<any, any, any>;

const CAP = 50;

function num(v: any) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getCurrencyBalances(sb: SB, args: { currency?: string } = {}) {
  let q = sb.from("inventory_lots")
    .select("currency, remaining_amount, cost_basis_rate, cost_basis_currency")
    .gt("remaining_amount", 0)
    .neq("status", "depleted");
  if (args.currency) q = q.eq("currency", args.currency.toUpperCase());
  const { data, error } = await q;
  if (error) throw error;
  const totals: Record<string, { total: number; lot_count: number }> = {};
  for (const r of data ?? []) {
    const k = r.currency;
    if (!totals[k]) totals[k] = { total: 0, lot_count: 0 };
    totals[k].total += num(r.remaining_amount);
    totals[k].lot_count += 1;
  }
  return {
    source: "inventory_lots",
    row_count: (data ?? []).length,
    balances: Object.entries(totals).map(([currency, v]) => ({ currency, ...v })),
  };
}

export async function getAccountBalances(sb: SB, args: { account_type?: string; currency?: string } = {}) {
  let acc = sb.from("accounts")
    .select("id,name,account_type,currency,holder_type,holder_customer_id,is_active")
    .is("deleted_at", null)
    .eq("is_active", true)
    .limit(CAP * 4);
  if (args.account_type) acc = acc.eq("account_type", args.account_type);
  if (args.currency) acc = acc.eq("currency", args.currency.toUpperCase());
  const { data: accounts, error } = await acc;
  if (error) throw error;
  const ids = (accounts ?? []).map((a: any) => a.id);
  if (ids.length === 0) return { source: "accounts", accounts: [] };
  const { data: ledger } = await sb.from("ledger_entries")
    .select("account_id, amount")
    .in("account_id", ids);
  const bal: Record<string, number> = {};
  for (const r of ledger ?? []) bal[r.account_id] = (bal[r.account_id] || 0) + num(r.amount);
  const out = (accounts ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    type: a.account_type,
    currency: a.currency,
    balance: Number((bal[a.id] || 0).toFixed(2)),
    link: `/accounts`,
  })).sort((a: any, b: any) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, CAP);
  return { source: "accounts+ledger_entries", accounts: out };
}

export async function getInventoryLots(sb: SB, args: { currency?: string; max_cost_rate?: number } = {}) {
  let q = sb.from("inventory_lots")
    .select("id,lot_code,currency,remaining_amount,original_amount,cost_basis_rate,cost_basis_currency,account_id,entry_date,source_ref_type")
    .gt("remaining_amount", 0)
    .order("entry_date", { ascending: true })
    .limit(CAP);
  if (args.currency) q = q.eq("currency", args.currency.toUpperCase());
  if (typeof args.max_cost_rate === "number") q = q.lte("cost_basis_rate", args.max_cost_rate);
  const { data, error } = await q;
  if (error) throw error;
  return {
    source: "inventory_lots",
    lots: (data ?? []).map((r: any) => ({
      id: r.id,
      lot_code: r.lot_code,
      currency: r.currency,
      remaining: num(r.remaining_amount),
      cost_rate: num(r.cost_basis_rate),
      cost_ccy: r.cost_basis_currency,
      entry_date: r.entry_date,
      link: `/inventory`,
    })),
  };
}

export async function getOpenDeals(sb: SB, args: { status?: string } = {}) {
  let q = sb.from("sell_transactions")
    .select("id,doc_no,entry_date,customer_id,sold_amount,sold_currency,sell_rate,received_amount,received_currency,deal_status,amount_received,customer:customers(name)")
    .is("deleted_at", null)
    .not("deal_status", "in", '("closed","cancelled")')
    .order("entry_date", { ascending: false })
    .limit(CAP);
  if (args.status) q = q.eq("deal_status", args.status);
  const { data, error } = await q;
  if (error) throw error;
  return {
    source: "sell_transactions",
    deals: (data ?? []).map((r: any) => ({
      id: r.id,
      doc_no: r.doc_no,
      date: r.entry_date,
      customer: r.customer?.name ?? null,
      sold: `${r.sold_amount} ${r.sold_currency}`,
      rate: num(r.sell_rate),
      received: `${r.received_amount} ${r.received_currency}`,
      paid_so_far: num(r.amount_received),
      status: r.deal_status,
      link: `/sells/${r.id}`,
    })),
  };
}

export async function getCustomerBalances(sb: SB, args: { customer_id?: string; q?: string } = {}) {
  let cq = sb.from("customers").select("id,name,phone").is("deleted_at", null).limit(CAP);
  if (args.customer_id) cq = cq.eq("id", args.customer_id);
  if (args.q) cq = cq.ilike("name", `%${args.q}%`);
  const { data: customers, error } = await cq;
  if (error) throw error;
  const ids = (customers ?? []).map((c: any) => c.id);
  if (ids.length === 0) return { source: "customers", customers: [] };
  const { data: openDeals } = await sb.from("sell_transactions")
    .select("customer_id,received_amount,amount_received,received_currency,deal_status")
    .in("customer_id", ids)
    .is("deleted_at", null)
    .not("deal_status", "in", '("closed","cancelled")');
  const owed: Record<string, { open_count: number; owed: Record<string, number> }> = {};
  for (const d of openDeals ?? []) {
    const k = d.customer_id!;
    if (!owed[k]) owed[k] = { open_count: 0, owed: {} };
    owed[k].open_count += 1;
    const remaining = num(d.received_amount) - num(d.amount_received);
    if (remaining > 0) owed[k].owed[d.received_currency] = (owed[k].owed[d.received_currency] || 0) + remaining;
  }
  return {
    source: "customers+sell_transactions",
    customers: (customers ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      open_deal_count: owed[c.id]?.open_count ?? 0,
      owed: owed[c.id]?.owed ?? {},
      link: `/customers/${c.id}`,
    })),
  };
}

export async function getPendingReceipts(sb: SB) {
  const { data, error } = await sb.from("sell_transactions")
    .select("id,doc_no,entry_date,customer:customers(name),sold_amount,sold_currency,received_amount,received_currency,amount_received,deal_status")
    .is("deleted_at", null)
    .in("deal_status", ["waiting_payment", "partially_paid", "waiting_receipt"])
    .order("entry_date", { ascending: true })
    .limit(CAP);
  if (error) throw error;
  return {
    source: "sell_transactions",
    pending: (data ?? []).map((r: any) => ({
      id: r.id, doc_no: r.doc_no, date: r.entry_date, customer: r.customer?.name ?? null,
      remaining: num(r.received_amount) - num(r.amount_received),
      currency: r.received_currency, status: r.deal_status, link: `/sells/${r.id}`,
    })),
  };
}

export async function getMarketRates(sb: SB, args: { currency?: string } = {}) {
  let q = sb.from("market_rates_latest").select("*").limit(CAP);
  if (args.currency) q = q.eq("currency", args.currency.toUpperCase());
  const { data, error } = await q;
  if (error) throw error;
  const now = Date.now();
  return {
    source: "market_rates_latest",
    rates: (data ?? []).map((r: any) => ({
      currency: r.currency,
      source_name: r.source,
      buy: num(r.buy_rate),
      sell: num(r.sell_rate),
      mid: num(r.mid_rate),
      fetched_at: r.fetched_at,
      stale_minutes: r.fetched_at ? Math.round((now - new Date(r.fetched_at).getTime()) / 60000) : null,
    })),
  };
}

export async function getProfitSummary(sb: SB, args: { from?: string; to?: string } = {}) {
  const from = args.from ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = args.to ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from("sell_transactions")
    .select("entry_date,gross_profit,milad_profit,ali_profit,sold_currency,received_currency,deal_status")
    .is("deleted_at", null)
    .gte("entry_date", from).lte("entry_date", to);
  if (error) throw error;
  let realized = 0, milad = 0, ali = 0, pending_cycles = 0;
  for (const r of data ?? []) {
    if (r.sold_currency === r.received_currency && r.deal_status !== "cancelled") {
      realized += num(r.gross_profit);
      milad += num(r.milad_profit);
      ali += num(r.ali_profit);
    } else if (r.deal_status !== "cancelled") {
      pending_cycles += 1;
    }
  }
  return {
    source: "sell_transactions",
    from, to,
    realized_profit: Number(realized.toFixed(2)),
    milad_share: Number(milad.toFixed(2)),
    ali_share: Number(ali.toFixed(2)),
    open_cycle_count: pending_cycles,
  };
}

export async function getRecentActivity(sb: SB, args: { hours?: number } = {}) {
  const hours = args.hours ?? 24;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await sb.from("audit_events")
    .select("id,created_at,actor_id,entity_type,entity_id,action,reason")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(CAP);
  if (error) throw error;
  return { source: "audit_events", since, events: data ?? [] };
}

export async function getCashWithPerson(sb: SB) {
  const { data: accounts, error } = await sb.from("accounts")
    .select("id,name,currency,holder_type")
    .eq("account_type", "person_holding")
    .is("deleted_at", null);
  if (error) throw error;
  const ids = (accounts ?? []).map((a: any) => a.id);
  if (!ids.length) return { source: "accounts", holders: [] };
  const { data: ledger } = await sb.from("ledger_entries").select("account_id,amount").in("account_id", ids);
  const bal: Record<string, number> = {};
  for (const r of ledger ?? []) bal[r.account_id] = (bal[r.account_id] || 0) + num(r.amount);
  return {
    source: "accounts+ledger_entries",
    holders: (accounts ?? [])
      .map((a: any) => ({ id: a.id, name: a.name, currency: a.currency, balance: Number((bal[a.id] || 0).toFixed(2)) }))
      .filter((r) => Math.abs(r.balance) > 0.0001),
  };
}

export async function getRateExposure(sb: SB) {
  const [{ data: lots }, { data: rates }] = await Promise.all([
    sb.from("inventory_lots").select("currency,remaining_amount,cost_basis_rate,cost_basis_currency").gt("remaining_amount", 0),
    sb.from("market_rates_latest").select("currency,mid_rate"),
  ]);
  const midByCcy: Record<string, number> = {};
  for (const r of rates ?? []) midByCcy[r.currency] = num(r.mid_rate);
  const agg: Record<string, { qty: number; cost: number; mkt: number }> = {};
  for (const l of lots ?? []) {
    const k = l.currency;
    if (!agg[k]) agg[k] = { qty: 0, cost: 0, mkt: 0 };
    agg[k].qty += num(l.remaining_amount);
    agg[k].cost += num(l.remaining_amount) * num(l.cost_basis_rate);
    agg[k].mkt  += num(l.remaining_amount) * (midByCcy[k] || 0);
  }
  return {
    source: "inventory_lots+market_rates_latest",
    exposure: Object.entries(agg).map(([currency, v]) => ({
      currency, quantity: Number(v.qty.toFixed(2)),
      cost_basis_total: Number(v.cost.toFixed(2)),
      market_value_total: Number(v.mkt.toFixed(2)),
      unrealized_delta: Number((v.mkt - v.cost).toFixed(2)),
    })),
  };
}