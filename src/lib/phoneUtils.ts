/**
 * Phone utility functions for Brazilian mobile numbers.
 * Format: (XX) XXXXX-XXXX — 11 digits total.
 */

/** Removes all non-digit characters */
export function sanitizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

/** Formats digits into (XX) XXXXX-XXXX mask */
export function formatPhone(value: string): string {
  const digits = sanitizePhone(value).slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Validates a Brazilian mobile phone number (11 digits, valid DDD, anti-fraud) */
export function isValidPhone(phone: string): boolean {
  const digits = sanitizePhone(phone);
  if (digits.length !== 11) return false;

  // All digits the same (e.g. 00000000000, 11111111111)
  if (/^(\d)\1+$/.test(digits)) return false;

  // Sequential (12345678900)
  if (digits === "12345678900") return false;

  // DDD must be >= 11
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11) return false;

  // Third digit must be 9 (mobile)
  if (digits[2] !== "9") return false;

  return true;
}
