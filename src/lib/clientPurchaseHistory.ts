import { supabase } from "@/integrations/supabase/client";
import { sanitizePhone } from "@/lib/phoneUtils";

interface PurchaseEntry {
  itemName: string;
  itemType: "service" | "product" | "subscription";
  amount: number;
  quantity?: number;
  purchasedAt?: string;
}

interface RecordClientPurchasesInput {
  organizationId: string;
  clientName: string;
  mobilePhone: string;
  purchases: PurchaseEntry[];
}

let warnedMissingPurchaseSchema = false;

const isPurchaseSchemaMissing = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("client_purchase_history") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    details.includes("client_purchase_history")
  );
};

export async function recordClientPurchasesBestEffort({
  organizationId,
  clientName,
  mobilePhone,
  purchases,
}: RecordClientPurchasesInput) {
  const name = clientName.trim();
  const phone = sanitizePhone(mobilePhone);

  if (!name || !phone || purchases.length === 0) return;

  const rows = purchases.map((purchase) => ({
    organization_id: organizationId,
    client_name: name,
    mobile_phone: phone,
    item_name: purchase.itemName,
    item_type: purchase.itemType,
    amount: purchase.amount,
    quantity: purchase.quantity ?? 1,
    purchased_at: purchase.purchasedAt || new Date().toISOString(),
  }));

  const { error } = await supabase.from("client_purchase_history").insert(rows as any);

  if (!error) return;

  if (isPurchaseSchemaMissing(error)) {
    if (!warnedMissingPurchaseSchema) {
      warnedMissingPurchaseSchema = true;
      console.warn(
        "Tabela public.client_purchase_history não encontrada. Histórico de recompra ficará indisponível até aplicar migration.",
      );
    }
    return;
  }

  throw error;
}
