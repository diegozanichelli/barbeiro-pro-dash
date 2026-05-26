import { normalizePhoneForMetrics } from "@/lib/normalizers";

export type MetricTx = {
  item_type?: string | null;
  subscription_action?: string | null;
  is_new_client?: boolean | null;
  mobile_phone?: string | null;
};

export const isLegacyImport = (tx: MetricTx): boolean => tx.subscription_action === "legacy_import";

export const isValidOpportunity = (tx: MetricTx): boolean =>
  tx.is_new_client === true && !!normalizePhoneForMetrics(tx.mobile_phone || null);

export const isNewSubscription = (tx: MetricTx): boolean =>
  tx.item_type === "subscription" && tx.subscription_action === "new" && !isLegacyImport(tx);

export const isSubscriptionRevenue = (tx: MetricTx): boolean => tx.item_type === "subscription";
