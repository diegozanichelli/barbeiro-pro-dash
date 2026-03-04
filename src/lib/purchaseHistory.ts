import { supabase } from "@/integrations/supabase/client";

let warnedMissingSchema = false;

const isSchemaMissing = (error: unknown): boolean => {
  const msg = String((error as Record<string, unknown>)?.message || "").toLowerCase();
  const details = String((error as Record<string, unknown>)?.details || "").toLowerCase();
  const code = String((error as Record<string, unknown>)?.code || "").toUpperCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("client_purchase_history") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    details.includes("client_purchase_history")
  );
};

export interface PurchaseRecord {
  item_name: string;
  item_type: "service" | "product" | "subscription";
  amount: number;
  quantity?: number;
  purchased_at?: string; // ISO string
}

/**
 * Records client purchases in `client_purchase_history`.
 * Best-effort: will NOT break the checkout if the table doesn't exist yet.
 */
export async function recordClientPurchasesBestEffort(
  organizationId: string,
  clientName: string,
  mobilePhone: string,
  purchases: PurchaseRecord[]
): Promise<void> {
  if (!purchases.length || !clientName.trim() || !mobilePhone) return;

  const rows = purchases.map((p) => ({
    organization_id: organizationId,
    client_name: clientName.trim(),
    mobile_phone: mobilePhone,
    item_name: p.item_name,
    item_type: p.item_type,
    amount: p.amount,
    quantity: p.quantity ?? 1,
    purchased_at: p.purchased_at || new Date().toISOString(),
  }));

  try {
    const { error } = await supabase
      .from("client_purchase_history" as any)
      .insert(rows as any);

    if (error) {
      if (isSchemaMissing(error)) {
        if (!warnedMissingSchema) {
          warnedMissingSchema = true;
          console.warn(
            "Tabela client_purchase_history não encontrada. Histórico de compras desabilitado até aplicar migration."
          );
        }
        return;
      }
      throw error;
    }
  } catch (err: unknown) {
    if (isSchemaMissing(err)) {
      if (!warnedMissingSchema) {
        warnedMissingSchema = true;
        console.warn(
          "Tabela client_purchase_history não encontrada. Histórico de compras desabilitado até aplicar migration."
        );
      }
      return;
    }
    // Log but don't break checkout
    console.error("Erro ao salvar histórico de compras:", err);
  }
}

/**
 * Fetches the last N purchases for a client by mobile_phone.
 */
export async function getClientPurchaseHistory(
  organizationId: string,
  mobilePhone: string,
  limit = 20
) {
  try {
    const { data, error } = await supabase
      .from("client_purchase_history" as any)
      .select("*")
      .eq("organization_id", organizationId)
      .eq("mobile_phone", mobilePhone)
      .order("purchased_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isSchemaMissing(error)) return [];
      throw error;
    }
    return data || [];
  } catch {
    return [];
  }
}
