/**
 * Privacy utilities for masking PII (Personal Identifiable Information) in logs
 */

/**
 * Masks an email address for privacy
 * Example: cassiano.diego@gmail.com -> c***@g***.com
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '[no-email]';
  
  const [localPart, domain] = email.split('@');
  if (!domain) return '[invalid-email]';
  
  const maskedLocal = localPart.charAt(0) + '***';
  const domainParts = domain.split('.');
  const maskedDomain = domainParts.map(part => 
    part.length > 1 ? part.charAt(0) + '***' : part
  ).join('.');
  
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Masks a UUID/ID by showing only the first 8 characters
 * Example: 550e8400-e29b-41d4-a716-446655440000 -> 550e8400-****
 */
export function maskId(id: string | null | undefined): string {
  if (!id) return '[no-id]';
  return id.substring(0, 8) + '-****';
}

/**
 * Generates a correlation ID for tracking requests without exposing PII
 */
export function generateCorrelationId(): string {
  return `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Redacts sensitive fields from an object for logging
 */
export function redactSensitive(obj: Record<string, any>): Record<string, any> {
  const redacted = { ...obj };
  
  // Fields to redact completely
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
  
  // Fields to mask
  const maskFields = ['email', 'customer_id', 'stripe_customer_id'];
  
  for (const key in redacted) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      redacted[key] = '[REDACTED]';
    } else if (lowerKey.includes('email')) {
      redacted[key] = maskEmail(redacted[key]);
    } else if (lowerKey.includes('id') && typeof redacted[key] === 'string') {
      redacted[key] = maskId(redacted[key]);
    }
  }
  
  return redacted;
}
