/**
 * Front-end guards que espelham os triggers do banco
 * (`trg_enforce_mobile_phone_for_new_clients`).
 *
 * O objetivo é mostrar mensagens em pt-BR amigáveis ANTES do `RAISE EXCEPTION`
 * do Postgres aparecer cru no toast.
 */
import { isValidPhone } from "@/lib/phoneUtils";

export interface PhoneGuardOpts {
  isNewClient?: boolean | null;
  subscriptionAction?: string | null;
  mobilePhone?: string | null;
}

export type GuardResult = { ok: true } | { ok: false; message: string };

export function assertPhoneForNewClient(opts: PhoneGuardOpts): GuardResult {
  const requiresPhone =
    opts.isNewClient === true || opts.subscriptionAction === "new";

  if (!requiresPhone) return { ok: true };

  const phone = (opts.mobilePhone ?? "").trim();
  if (!phone || !isValidPhone(phone)) {
    if (opts.subscriptionAction === "new") {
      return {
        ok: false,
        message:
          "Nova adesão de assinatura precisa de telefone válido (11 dígitos com DDD).",
      };
    }
    return {
      ok: false,
      message:
        "Cliente novo precisa de telefone válido (11 dígitos com DDD).",
    };
  }

  return { ok: true };
}

/**
 * Traduz erros conhecidos vindos do Postgres (triggers) para mensagens
 * amigáveis em pt-BR. Use no `catch` antes de chamar `toast.error`.
 */
export function translateSaleError(error: unknown): string {
  const msg = String((error as any)?.message ?? "").toLowerCase();
  if (msg.includes("mobile_phone") || msg.includes("telefone")) {
    if (msg.includes("subscription") || msg.includes("assinatura")) {
      return "Telefone obrigatório para nova adesão de assinatura.";
    }
    if (msg.includes("new client") || msg.includes("cliente novo")) {
      return "Telefone obrigatório para cliente novo.";
    }
    return "Telefone obrigatório com 11 dígitos válidos.";
  }
  return (
    String((error as any)?.message ?? "") || "Erro ao salvar a venda."
  );
}
