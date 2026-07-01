import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id,name,currency,account_type,owner").is("deleted_at", null).eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function AccountSelect({
  value, onChange, currency, placeholder = "Select account",
}: { value: string; onChange: (v: string) => void; currency?: string; placeholder?: string }) {
  const { data } = useAccounts();
  const filtered = (data ?? []).filter((a) => !currency || a.currency === currency);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {filtered.map((a) => (
          <SelectItem key={a.id} value={a.id}>{a.name} · {a.currency}</SelectItem>
        ))}
        {filtered.length === 0 && <div className="px-2 py-4 text-xs text-muted-foreground text-center">No matching accounts</div>}
      </SelectContent>
    </Select>
  );
}

export function useCustomers() {
  return useQuery({
    queryKey: ["customers_light"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}