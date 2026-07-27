import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TxnKind =
  | "sell" | "buy" | "remittance" | "deposit" | "payment_order" | "sell_payment"
  | "service_charge" | "expense" | "ledger" | "profit_receivable" | "trade_cycle";

export type Txn = {
  id: string;
  kind: TxnKind;
  kindLabel: string;
  date: string;
  code: string;
  description: string;
  currency: string | null;
  currencyIn?: string | null;
  currencyOut?: string | null;
  amountIn: number | null;
  amountOut: number | null;
  rate: number | null;
  profit: number | null;
  status: string | null;
  href: string | null;
  accountId?: string | null;
  lotId?: string | null;
  ledgerId?: string | null;
};

const KIND_LABEL: Record<TxnKind, string> = {
  sell: "Sell", buy: "Buy", remittance: "Remittance", deposit: "Deposit",
  payment_order: "Payment Order", sell_payment: "Payment", service_charge: "Service Charge",
  expense: "Expense", ledger: "Ledger", profit_receivable: "Profit", trade_cycle: "Trade Cycle",
};

const code = (prefix: string, row: { doc_no?: string | null; id: string }) =>
  row.doc_no && String(row.doc_no).trim() ? String(row.doc_no) : `${prefix}-${row.id.slice(0, 6).toUpperCase()}`;

const num = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * Single data source for the Customer 360 profile.
 * Every tab reads from these queries — no duplicate fetching per tab.
 */
export function useCustomer360(customerId: string) {
  const customer = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).single();
      if (error) throw error;
      return data;
    },
  });

  const core = useQuery({
    queryKey: ["customer360", customerId],
    queryFn: async () => {
      const [sells, buys, remits, deposits, orders, charges, receivables, cycles, accounts] = await Promise.all([
        supabase.from("sell_transactions").select("*").eq("customer_id", customerId).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("buy_transactions").select("*").eq("customer_id", customerId).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("remittances").select("*").or(`customer_id.eq.${customerId},third_party_customer_id.eq.${customerId},fx_supplier_customer_id.eq.${customerId}`).order("entry_date", { ascending: false }),
        supabase.from("customer_deposits").select("*").eq("customer_id", customerId).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("payment_orders").select("*").eq("customer_id", customerId).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("service_charges").select("*").eq("customer_id", customerId).order("entry_date", { ascending: false }),
        supabase.from("profit_receivables").select("*").eq("customer_id", customerId).is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("trade_cycles").select("*").or(`customer_id.eq.${customerId},counterparty_id.eq.${customerId}`).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("accounts").select("id,name,currency,account_type,holder_customer_id").eq("holder_customer_id", customerId).is("deleted_at", null),
      ]);
      const err = [sells, buys, remits, deposits, orders, charges, receivables, cycles, accounts].find((r) => r.error);
      if (err?.error) throw err.error;

      const sellIds = (sells.data ?? []).map((r: any) => r.id);
      const buyIds = (buys.data ?? []).map((r: any) => r.id);
      const accountIds = (accounts.data ?? []).map((a: any) => a.id);

      const [payments, expenses, ledger, docs] = await Promise.all([
        sellIds.length
          ? supabase.from("sell_payments").select("*").in("sell_id", sellIds).is("deleted_at", null)
          : Promise.resolve({ data: [], error: null } as any),
        sellIds.length || buyIds.length
          ? supabase.from("expenses").select("*").is("deleted_at", null)
              .or([
                sellIds.length ? `related_sell_id.in.(${sellIds.join(",")})` : null,
                buyIds.length ? `related_buy_id.in.(${buyIds.join(",")})` : null,
              ].filter(Boolean).join(","))
          : Promise.resolve({ data: [], error: null } as any),
        accountIds.length
          ? supabase.from("ledger_entries").select("*").in("account_id", accountIds).order("entry_date", { ascending: false }).limit(500)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from("documents").select("*")
          .or([`and(ref_type.eq.customer,ref_id.eq.${customerId})`,
               sellIds.length ? `ref_id.in.(${sellIds.join(",")})` : null,
               buyIds.length ? `ref_id.in.(${buyIds.join(",")})` : null,
              ].filter(Boolean).join(","))
          .order("created_at", { ascending: false }),
      ]);

      return {
        sells: sells.data ?? [], buys: buys.data ?? [], remittances: remits.data ?? [],
        deposits: deposits.data ?? [], orders: orders.data ?? [], charges: charges.data ?? [],
        receivables: receivables.data ?? [], cycles: cycles.data ?? [], accounts: accounts.data ?? [],
        payments: payments.data ?? [], expenses: expenses.data ?? [], ledger: ledger.data ?? [],
        documents: docs.data ?? [],
      };
    },
  });

  const notes = useQuery({
    queryKey: ["customer_notes", customerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("customer_notes").select("*")
        .eq("customer_id", customerId).is("deleted_at", null)
        .order("pinned", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const audit = useQuery({
    queryKey: ["customer_audit", customerId, (core.data?.sells ?? []).length, (core.data?.buys ?? []).length],
    enabled: !!core.data,
    queryFn: async () => {
      const ids = [
        customerId,
        ...(core.data?.sells ?? []).map((r: any) => r.id),
        ...(core.data?.buys ?? []).map((r: any) => r.id),
        ...(core.data?.remittances ?? []).map((r: any) => r.id),
        ...(core.data?.deposits ?? []).map((r: any) => r.id),
      ].slice(0, 200);
      const { data, error } = await supabase.from("audit_events").select("*")
        .in("entity_id", ids).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const transactions: Txn[] = useMemo(() => {
    const d = core.data;
    if (!d) return [];
    const out: Txn[] = [];

    for (const r of d.sells as any[]) {
      out.push({
        id: r.id, kind: "sell", kindLabel: KIND_LABEL.sell, date: r.entry_date,
        code: code("SELL", r),
        description: `Sold ${r.sold_amount} ${r.sold_currency} → ${r.received_amount} ${r.received_currency}`,
        currency: r.sold_currency, amountOut: num(r.sold_amount), amountIn: num(r.received_amount),
        currencyOut: r.sold_currency, currencyIn: r.received_currency,
        rate: num(r.sell_rate), profit: num(r.net_profit_aed ?? r.gross_profit),
        status: r.deal_status ?? r.settlement_status, href: `/sells/${r.id}`,
        accountId: r.received_into_account_id ?? r.sold_from_account_id,
      });
    }
    for (const r of d.buys as any[]) {
      out.push({
        id: r.id, kind: "buy", kindLabel: KIND_LABEL.buy, date: r.entry_date,
        code: code("BUY", r),
        description: `Bought ${r.bought_amount} ${r.bought_currency} for ${r.paid_amount} ${r.paid_currency}`,
        currency: r.bought_currency, amountIn: num(r.bought_amount), amountOut: num(r.paid_amount),
        currencyIn: r.bought_currency, currencyOut: r.paid_currency,
        rate: num(r.buy_rate), profit: null, status: r.settlement_status, href: `/buy`,
        accountId: r.received_into_account_id ?? r.paid_from_account_id,
      });
    }
    for (const r of d.remittances as any[]) {
      out.push({
        id: r.id, kind: "remittance", kindLabel: KIND_LABEL.remittance, date: r.entry_date,
        code: code("REM", r),
        description: `Transfer ${r.transferred_amount} ${r.transfer_currency} to ${r.beneficiary_name ?? "beneficiary"}`,
        currency: r.transfer_currency, amountOut: num(r.transferred_amount), amountIn: num(r.customer_payment_amount),
        currencyOut: r.transfer_currency, currencyIn: r.customer_payment_currency,
        rate: num(r.reference_rate), profit: num(r.total_profit_aed ?? r.net_commission_aed),
        status: r.workflow_state ?? r.status, href: `/remittances/${r.id}`,
        accountId: r.source_account_id,
      });
    }
    for (const r of d.deposits as any[]) {
      out.push({
        id: r.id, kind: "deposit", kindLabel: KIND_LABEL.deposit, date: r.entry_date,
        code: code("DEP", r), description: r.notes || "Customer deposit",
        currency: r.currency, amountIn: num(r.amount), amountOut: null, rate: null, profit: null,
        status: r.settlement_status, href: `/deposits`, accountId: r.deposit_account_id,
      });
    }
    for (const r of d.orders as any[]) {
      out.push({
        id: r.id, kind: "payment_order", kindLabel: KIND_LABEL.payment_order, date: r.entry_date,
        code: code("PO", r), description: `Payout to ${r.receiver_name ?? r.destination_bank_name ?? "receiver"}`,
        currency: r.currency, amountOut: num(r.amount), amountIn: null, rate: null, profit: null,
        status: r.settlement_status, href: `/payment-orders`, accountId: r.source_wallet_account_id,
      });
    }
    for (const r of d.payments as any[]) {
      out.push({
        id: r.id, kind: "sell_payment", kindLabel: KIND_LABEL.sell_payment, date: r.entry_date,
        code: code("PAY", r), description: r.notes || "Payment received on deal",
        currency: r.currency, amountIn: num(r.amount), amountOut: null, rate: null, profit: null,
        status: "received", href: `/sells/${r.sell_id}`, accountId: r.received_into_account_id,
      });
    }
    for (const r of d.charges as any[]) {
      out.push({
        id: r.id, kind: "service_charge", kindLabel: KIND_LABEL.service_charge, date: r.entry_date,
        code: code("SVC", r), description: r.notes || `Service charge (${r.kind})`,
        currency: r.currency, amountIn: num(r.amount), amountOut: null, rate: null, profit: num(r.amount),
        status: null, href: null,
      });
    }
    for (const r of d.expenses as any[]) {
      out.push({
        id: r.id, kind: "expense", kindLabel: KIND_LABEL.expense, date: r.entry_date,
        code: code("EXP", r), description: r.notes || r.category || "Expense charged",
        currency: r.currency, amountOut: num(r.amount), amountIn: null, rate: null, profit: null,
        status: r.settlement_status, href: `/expenses`, accountId: r.paid_from_account_id,
      });
    }
    for (const r of d.receivables as any[]) {
      out.push({
        id: r.id, kind: "profit_receivable", kindLabel: KIND_LABEL.profit_receivable,
        date: (r.created_at ?? "").slice(0, 10),
        code: `PR-${r.id.slice(0, 6).toUpperCase()}`, description: r.notes || "Profit receivable",
        currency: r.currency, amountIn: num(r.amount), amountOut: null, rate: null, profit: num(r.amount),
        status: r.status, href: `/profits`, accountId: r.received_into_account_id,
      });
    }
    for (const r of d.ledger as any[]) {
      const amt = Number(r.amount ?? 0);
      out.push({
        id: r.id, kind: "ledger", kindLabel: r.ref_type === "opening_balance" ? "Opening balance" : r.ref_type === "adjustment" ? "Adjustment" : "Ledger",
        date: r.entry_date, code: `LED-${r.id.slice(0, 6).toUpperCase()}`,
        description: r.description || r.ref_type, currency: r.currency,
        amountIn: amt >= 0 ? amt : null, amountOut: amt < 0 ? Math.abs(amt) : null,
        rate: null, profit: null, status: null, href: null,
        accountId: r.account_id, ledgerId: r.id,
      });
    }

    return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [core.data]);

  const stats = useMemo(() => {
    const d = core.data;
    const openStates = ["open", "waiting_payment", "partially_paid", "waiting_receipt", "ready_to_close", "waiting_currency_delivery", "waiting_delivery_proof", "draft", "allocating", "settlement_pending", "funds_received"];
    const sells = (d?.sells ?? []) as any[];
    const buys = (d?.buys ?? []) as any[];
    const remits = (d?.remittances ?? []) as any[];
    const dealRows = [
      ...sells.map((r) => ({ status: r.deal_status })),
      ...buys.map((r) => ({ status: r.settlement_status })),
      ...remits.map((r) => ({ status: r.workflow_state ?? r.status })),
    ];
    const openDeals = dealRows.filter((r) => openStates.includes(String(r.status))).length;
    const completedDeals = dealRows.filter((r) => ["closed", "completed"].includes(String(r.status))).length;
    const pendingSettlements = [...sells, ...buys, ...(d?.deposits ?? []), ...(d?.orders ?? [])]
      .filter((r: any) => r.settlement_status && !["completed", "cancelled"].includes(r.settlement_status)).length;

    const volume = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind === "ledger") continue;
      const ccyIn = t.currencyIn ?? t.currency;
      const ccyOut = t.currencyOut ?? t.currency;
      if (t.amountIn != null && ccyIn) volume.set(ccyIn, (volume.get(ccyIn) ?? 0) + t.amountIn);
      if (t.amountOut != null && ccyOut) volume.set(ccyOut, (volume.get(ccyOut) ?? 0) + t.amountOut);
    }

    const balances = new Map<string, number>();
    for (const l of (d?.ledger ?? []) as any[]) {
      balances.set(l.currency, (balances.get(l.currency) ?? 0) + Number(l.amount ?? 0));
    }

    const profitByCcy = new Map<string, number>();
    for (const t of transactions) {
      if (t.profit && t.currency) profitByCcy.set(t.currency, (profitByCcy.get(t.currency) ?? 0) + t.profit);
    }

    return {
      openDeals, completedDeals, pendingSettlements,
      volume: [...volume.entries()],
      balances: [...balances.entries()],
      profit: [...profitByCcy.entries()],
      lastTxn: transactions[0] ?? null,
      totalDeals: dealRows.length,
    };
  }, [core.data, transactions]);

  return { customer, core, notes, audit, transactions, stats };
}

export function txnKindOptions() {
  return Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }));
}