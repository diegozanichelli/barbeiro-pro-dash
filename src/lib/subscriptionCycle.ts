import { addMonths, differenceInCalendarDays, parseISO } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { TIMEZONE, getManausDate } from "@/lib/dateUtils";

export type CycleStatus =
  | "em_dia"
  | "renovacao_disponivel"
  | "vencido"
  | "sem_historico";

export interface CycleInfo {
  status: CycleStatus;
  /** Data prevista de vencimento (Date no fuso de Manaus). Para `sem_historico`, é igual à data atual. */
  dueDate: Date;
  /** Dias até vencer. Negativo = vencido, 0 = vence hoje, positivo = ainda no prazo. Para `sem_historico` = 0. */
  daysLeft: number;
  /** Data formatada dd/MM/yyyy. Para `sem_historico`, string vazia. */
  dueDateLabel: string;
  /** Texto curto do estado (Ex: "Vence em 3 dias", "Vencida em 14/04", "Adesão sem registro") */
  label: string;
  /** Variante visual para o banner */
  variant: "success" | "warning" | "danger" | "neutral";
}

/**
 * Constrói um CycleInfo neutro para assinantes legados (cliente vinculado a um plano,
 * mas sem nenhuma sale_transaction de assinatura para ancorar o ciclo).
 * O usuário ainda vê o status "Assinante" e pode acionar a primeira renovação,
 * que passa a registrar o cycle_anchor — o sistema se cura sozinho a partir daí.
 */
export function buildLegacyCycle(today: Date = getManausDate()): CycleInfo {
  const todayManaus = toZonedTime(today, TIMEZONE);
  return {
    status: "sem_historico",
    dueDate: todayManaus,
    daysLeft: 0,
    dueDateLabel: "",
    label: "Adesão sem registro — renove para iniciar o ciclo",
    variant: "neutral",
  };
}

/**
 * Tenta parsear o campo `description` de uma sale_transaction.
 * Se contiver JSON com cycle_anchor (yyyy-MM-dd), retorna a Date correspondente; senão null.
 */
export function parseCycleAnchor(description: string | null | undefined): Date | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description);
    if (parsed && typeof parsed.cycle_anchor === "string") {
      const d = parseISO(parsed.cycle_anchor);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    // não é JSON, ignora
  }
  return null;
}

/**
 * Serializa o cycle_anchor + next_due em JSON para gravar no campo description.
 */
export function serializeCycleMetadata(anchorDate: Date, nextDueDate: Date): string {
  return JSON.stringify({
    cycle_anchor: formatInTimeZone(anchorDate, TIMEZONE, "yyyy-MM-dd"),
    next_due: formatInTimeZone(nextDueDate, TIMEZONE, "yyyy-MM-dd"),
  });
}

/**
 * Calcula o status de ciclo a partir da última transação de assinatura.
 * @param lastTransactionDate created_at da última subscription (new/renew/upgrade) — Date UTC
 * @param cycleAnchorOverride se a transação trouxe cycle_anchor no description, prefira ele
 * @param today data atual (default: agora em Manaus)
 */
export function computeCycleStatus(
  lastTransactionDate: Date,
  cycleAnchorOverride: Date | null = null,
  today: Date = getManausDate()
): CycleInfo {
  // Base = anchor (se houver) ou data da última transação, ambas convertidas para Manaus
  const base = cycleAnchorOverride
    ? toZonedTime(cycleAnchorOverride, TIMEZONE)
    : toZonedTime(lastTransactionDate, TIMEZONE);

  const dueDate = addMonths(base, 1);
  const todayManaus = toZonedTime(today, TIMEZONE);
  const daysLeft = differenceInCalendarDays(dueDate, todayManaus);

  const dueDateLabel = formatInTimeZone(dueDate, TIMEZONE, "dd/MM/yyyy");

  let status: CycleStatus;
  let label: string;
  let variant: CycleInfo["variant"];

  if (daysLeft < 0) {
    status = "vencido";
    variant = "danger";
    label = `Vencida em ${dueDateLabel}`;
  } else if (daysLeft <= 5) {
    status = "renovacao_disponivel";
    variant = "warning";
    label =
      daysLeft === 0
        ? "Vence hoje"
        : daysLeft === 1
          ? "Vence amanhã"
          : `Vence em ${daysLeft} dias`;
  } else {
    status = "em_dia";
    variant = "success";
    label = `Próx. ${dueDateLabel}`;
  }

  return { status, dueDate, daysLeft, dueDateLabel, label, variant };
}

/**
 * Calcula a próxima âncora de ciclo após uma renovação.
 * Política de fidelização: se ainda não venceu, mantém a data original (não queima dias pagos).
 * Se venceu, parte de hoje.
 */
export function computeNextAnchor(
  current: CycleInfo,
  today: Date = getManausDate()
): { anchor: Date; nextDue: Date; preservedDays: number } {
  const todayManaus = toZonedTime(today, TIMEZONE);
  const anchor = current.status === "vencido" ? todayManaus : current.dueDate;
  const nextDue = addMonths(anchor, 1);
  const preservedDays = current.status === "vencido" ? 0 : Math.max(0, current.daysLeft);
  return { anchor, nextDue, preservedDays };
}
