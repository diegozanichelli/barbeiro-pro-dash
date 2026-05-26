import { sanitizePhone } from "@/lib/phoneUtils";

export const normalizePhoneForMetrics = (value: string | null | undefined): string | null => {
  const digitsOnly = sanitizePhone(value || "");
  const normalized = digitsOnly.length === 13 && digitsOnly.startsWith("55") ? digitsOnly.slice(2) : digitsOnly;
  return normalized.length === 11 ? normalized : null;
};
