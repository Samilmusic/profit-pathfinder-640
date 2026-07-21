import { supabase } from "@/integrations/supabase/client";
import type { RemittanceV2CreateInput } from "./remittance-v2-schema";

/**
 * Client wrapper for the `remittance_v2_create` RPC. The server is the single
 * source of truth for role and feature-flag checks — this wrapper never
 * short-circuits based on the client-side flag cache.
 *
 * Monetary values remain numbers throughout the frontend. The RPC uses
 * `_payload->>'field'` to read values, which coerces JSON numbers to their
 * string form at the SQL boundary before casting to numeric. No client-side
 * string conversion is needed.
 */
export async function remittanceV2Create(
  input: RemittanceV2CreateInput,
  clientRequestId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("remittance_v2_create", {
    _payload: input as unknown as never,
    _client_request_id: clientRequestId,
  });
  if (error) throw error;
  if (!data) throw new Error("remittance_v2_create returned no id");
  return String(data);
}