import { sanitizePhone } from "@/lib/phoneUtils";

export const normalizePhoneForMetrics = (value: string | null | undefined): string | null => {
  const digitsOnly = sanitizePhone(value || "");
  const normalized = digitsOnly.length === 13 && digitsOnly.startsWith("55") ? digitsOnly.slice(2) : digitsOnly;
  return normalized.length === 11 ? normalized : null;
};

/**
 * Canonical matching key for phone comparisons across data sources:
 * strips the Brazil country code (55) from 13-digit numbers, otherwise
 * keeps the raw digits (11-digit mobile or 10-digit landline).
 */
export const normalizePhoneKey = (value: string | null | undefined): string | null => {
  const digitsOnly = sanitizePhone(value || "");
  if (!digitsOnly) return null;
  if (digitsOnly.length === 13 && digitsOnly.startsWith("55")) return digitsOnly.slice(2);
  return digitsOnly;
};
