import { useMemo, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCustomers } from "@/components/account-select";
import { NumberInput } from "@/components/number-input";
import { CURRENCIES } from "@/lib/exchange";
import {
  remittanceV2CreateSchema,
  TRANSFER_METHODS,
  COMMISSION_METHODS,
  PAYMENT_DESTINATIONS,
  type RemittanceV2CreateInput,
} from "@/lib/remittance-v2-schema";
import { remittanceV2Create } from "@/lib/remittance-v2.functions";

type FormState = {
  entry_date: string;
  customer_id: string;
  customer_phone: string;
  customer_reference: string;
  transfer_currency: string;
  transferred_amount: number | null;
  transfer_method: (typeof TRANSFER_METHODS)[number];
  beneficiary_name: string;
  beneficiary_country: string;
  customer_payment_currency: string;
  customer_payment_amount: number | null;
  reference_rate: number | null;
  payment_destination: (typeof PAYMENT_DESTINATIONS)[number];
  third_party_customer_id: string;
  third_party_name: string;
  settlement_amount: number | null;
  settlement_currency: string;
  commission_method: (typeof COMMISSION_METHODS)[number];
  commission_fixed_amount: number | null;
  commission_fixed_currency: string;
  commission_percentage: number | null;
  notes: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseNumOrNull(v: string): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function RemittanceV2CreateForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const customers = useCustomers();

  // Stable idempotency key per form mount.
  const [clientRequestId] = useState<string>(() => crypto.randomUUID());

  const [form, setForm] = useState<FormState>({
    entry_date: todayISO(),
    customer_id: "",
    customer_phone: "",
    customer_reference: "",
    transfer_currency: "AED",
    transferred_amount: null,
    transfer_method: "bank_transfer",
    beneficiary_name: "",
    beneficiary_country: "",
    customer_payment_currency: "IRR",
    customer_payment_amount: null,
    reference_rate: null,
    payment_destination: "into_account",
    third_party_customer_id: "",
    third_party_name: "",
    settlement_amount: null,
    settlement_currency: "IRR",
    commission_method: "included",
    commission_fixed_amount: null,
    commission_fixed_currency: "AED",
    commission_percentage: null,
    notes: "",
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const isThirdParty =
    form.payment_destination === "to_third_party" ||
    form.payment_destination === "settles_linked_buy";

  const payload = useMemo<RemittanceV2CreateInput | null>(() => {
    const raw = {
      entry_date: form.entry_date,
      customer_id: form.customer_id,
      customer_phone: form.customer_phone || null,
      customer_reference: form.customer_reference || null,
      transfer_currency: form.transfer_currency,
      transferred_amount: form.transferred_amount ?? undefined,
      transfer_method: form.transfer_method,
      beneficiary_name: form.beneficiary_name,
      beneficiary_country: form.beneficiary_country || null,
      customer_payment_currency: form.customer_payment_currency,
      customer_payment_amount: form.customer_payment_amount,
      reference_rate: form.reference_rate,
      payment_destination: form.payment_destination,
      third_party_customer_id: form.third_party_customer_id || null,
      third_party_name: form.third_party_name || null,
      settlement_amount: form.settlement_amount,
      settlement_currency: form.settlement_currency || null,
      commission_method: form.commission_method,
      commission_fixed_amount:
        form.commission_method === "fixed" ? form.commission_fixed_amount : null,
      commission_fixed_currency:
        form.commission_method === "fixed" ? form.commission_fixed_currency : null,
      commission_percentage:
        form.commission_method === "percentage" ? form.commission_percentage : null,
      notes: form.notes || null,
    };
    const parsed = remittanceV2CreateSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }, [form]);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = remittanceV2CreateSchema.safeParse({
        entry_date: form.entry_date,
        customer_id: form.customer_id,
        customer_phone: form.customer_phone || null,
        customer_reference: form.customer_reference || null,
        transfer_currency: form.transfer_currency,
        transferred_amount: form.transferred_amount ?? undefined,
        transfer_method: form.transfer_method,
        beneficiary_name: form.beneficiary_name,
        beneficiary_country: form.beneficiary_country || null,
        customer_payment_currency: form.customer_payment_currency,
        customer_payment_amount: form.customer_payment_amount,
        reference_rate: form.reference_rate,
        payment_destination: form.payment_destination,
        third_party_customer_id: form.third_party_customer_id || null,
        third_party_name: form.third_party_name || null,
        settlement_amount: form.settlement_amount,
        settlement_currency: form.settlement_currency || null,
        commission_method: form.commission_method,
        commission_fixed_amount:
          form.commission_method === "fixed" ? form.commission_fixed_amount : null,
        commission_fixed_currency:
          form.commission_method === "fixed" ? form.commission_fixed_currency : null,
        commission_percentage:
          form.commission_method === "percentage" ? form.commission_percentage : null,
        notes: form.notes || null,
      });
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new Error(first?.message ?? "Invalid form input");
      }
      return remittanceV2Create(parsed.data, clientRequestId);
    },
    onSuccess: async (newId) => {
      qc.invalidateQueries({ queryKey: ["remittances"] });
      try {
        await navigate({ to: "/remittances/$id/v2", params: { id: newId } });
        toast.success("Remittance created");
      } catch (navErr) {
        console.error("Navigation after create failed:", navErr);
        toast.error("Created, but navigation failed", {
          description: `ID ${newId}`,
          action: {
            label: "Open",
            onClick: () => {
              window.location.href = `/remittances/${newId}/v2`;
            },
          },
        });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Unable to create remittance", { description: msg });
    },
  });

  const canSubmit = payload !== null && !mutation.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-32">
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link to="/remittances">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">New Remittance (v2)</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer & Transfer</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input
              type="date"
              value={form.entry_date}
              onChange={(e) => set("entry_date", e.target.value)}
            />
          </Field>
          <Field label="Customer">
            <Select value={form.customer_id} onValueChange={(v) => set("customer_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {(customers.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Customer phone">
            <Input
              value={form.customer_phone}
              onChange={(e) => set("customer_phone", e.target.value)}
            />
          </Field>
          <Field label="Customer reference">
            <Input
              value={form.customer_reference}
              onChange={(e) => set("customer_reference", e.target.value)}
            />
          </Field>
          <Field label="Transfer currency">
            <CurrencySelect
              value={form.transfer_currency}
              onChange={(v) => set("transfer_currency", v)}
            />
          </Field>
          <Field label="Transferred amount">
            <NumberInput
              currency={form.transfer_currency}
              value={form.transferred_amount ?? ""}
              onChange={(e) => set("transferred_amount", parseNumOrNull(e.target.value))}
            />
          </Field>
          <Field label="Transfer method">
            <Select
              value={form.transfer_method}
              onValueChange={(v) => set("transfer_method", v as FormState["transfer_method"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFER_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Beneficiary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Beneficiary name">
            <Input
              value={form.beneficiary_name}
              onChange={(e) => set("beneficiary_name", e.target.value)}
            />
          </Field>
          <Field label="Beneficiary country">
            <Input
              value={form.beneficiary_country}
              onChange={(e) => set("beneficiary_country", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer Payment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Payment currency">
            <CurrencySelect
              value={form.customer_payment_currency}
              onChange={(v) => set("customer_payment_currency", v)}
            />
          </Field>
          <Field label="Payment amount">
            <NumberInput
              currency={form.customer_payment_currency}
              value={form.customer_payment_amount ?? ""}
              onChange={(e) => set("customer_payment_amount", parseNumOrNull(e.target.value))}
            />
          </Field>
          <Field label="Reference rate">
            <NumberInput
              rate
              value={form.reference_rate ?? ""}
              onChange={(e) => set("reference_rate", parseNumOrNull(e.target.value))}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlement Method</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Payment destination">
            <Select
              value={form.payment_destination}
              onValueChange={(v) =>
                set("payment_destination", v as FormState["payment_destination"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_DESTINATIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {isThirdParty ? (
            <>
              <Field label="Third-party customer">
                <Select
                  value={form.third_party_customer_id}
                  onValueChange={(v) => set("third_party_customer_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customers.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Third-party name (free text)">
                <Input
                  value={form.third_party_name}
                  onChange={(e) => set("third_party_name", e.target.value)}
                />
              </Field>
              <Field label="Settlement currency">
                <CurrencySelect
                  value={form.settlement_currency}
                  onChange={(v) => set("settlement_currency", v)}
                />
              </Field>
              <Field label="Settlement amount">
                <NumberInput
                  currency={form.settlement_currency}
                  value={form.settlement_amount ?? ""}
                  onChange={(e) => set("settlement_amount", parseNumOrNull(e.target.value))}
                />
              </Field>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Method">
            <Select
              value={form.commission_method}
              onValueChange={(v) =>
                set("commission_method", v as FormState["commission_method"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMISSION_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.commission_method === "fixed" ? (
            <>
              <Field label="Fixed amount">
                <NumberInput
                  currency={form.commission_fixed_currency}
                  value={form.commission_fixed_amount ?? ""}
                  onChange={(e) =>
                    set("commission_fixed_amount", parseNumOrNull(e.target.value))
                  }
                />
              </Field>
              <Field label="Fixed currency">
                <CurrencySelect
                  value={form.commission_fixed_currency}
                  onChange={(v) => set("commission_fixed_currency", v)}
                />
              </Field>
            </>
          ) : null}
          {form.commission_method === "percentage" ? (
            <Field label="Percentage (%)">
              <NumberInput
                value={form.commission_percentage ?? ""}
                onChange={(e) => set("commission_percentage", parseNumOrNull(e.target.value))}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 p-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
        <Button
          className="w-full"
          size="lg"
          disabled={!canSubmit}
          onClick={() => mutation.mutate()}
        >
          <Send className="mr-2 h-4 w-4" />
          {mutation.isPending ? "Creating…" : "Create Remittance"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function CurrencySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}