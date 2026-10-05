import { normalizePhoneForMetrics } from "@/lib/normalizers";

export type MetricTx = {
  item_type?: string | null;
  subscription_action?: string | null;
  attribution_source?: string | null;
  is_new_client?: boolean | null;
  mobile_phone?: string | null;
};

export const isLegacyImport = (tx: MetricTx): boolean => tx.subscription_action === "legacy_import";

export const isValidOpportunity = (tx: MetricTx): boolean =>
  tx.is_new_client === true && !!normalizePhoneForMetrics(tx.mobile_phone || null);

export const isNewSubscription = (tx: MetricTx): boolean =>
  tx.item_type === "subscription" && tx.subscription_action === "new" && !isLegacyImport(tx);

export const isSubscriptionRevenue = (tx: MetricTx): boolean => tx.item_type === "subscription";

/**
 * Cancelamento de assinatura lançado pelo controlador.
 * Convenção: subscription_action = 'cancel' (valor de texto, sem enum de BD).
 * Linha sem receita (price_sold = 0); alimenta o churn.
 */
export const isCancellation = (tx: MetricTx): boolean =>
  tx.item_type === "subscription" && tx.subscription_action === "cancel";

/**
 * Adesão de assinatura vendida online (fora do balcão), lançada pelo controlador.
 */
export const isOnlineAdhesion = (tx: MetricTx): boolean =>
  tx.item_type === "subscription" &&
  tx.subscription_action === "new" &&
  tx.attribution_source === "online" &&
  !isLegacyImport(tx);

/**
 * Renovação automática cobrada pelo gateway (cartão), lançada pelo controlador
 * ou pelo wizard de assinatura.
 */
export const isAutoRecurring = (tx: MetricTx): boolean =>
  tx.item_type === "subscription" && tx.attribution_source === "auto_recurring";

/**
 * Faturamento "operacional" = tudo que NÃO é assinatura.
 * Assinaturas (MRR) não devem somar à meta diária do barbeiro/unidade no Ao Vivo;
 * elas aparecem apenas no card lateral "Ranking de Assinaturas".
 */
export const isOperationalRevenueTx = (tx: MetricTx): boolean =>
  tx.item_type !== "subscription";
