import { startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { getManausDate, toDateKey } from "@/lib/dateUtils";
import { isCancellation, isLegacyImport, type MetricTx } from "@/lib/metricsRules";

/**
 * Faixas da semana (segunda a domingo) no fuso de Manaus, como yyyy-MM-dd.
 * Semana corrente + semana anterior (base da meta).
 */
export interface WeekRanges {
  currentStart: string;
  currentEnd: string;
  prevStart: string;
  prevEnd: string;
}

export function getWeekRanges(now: Date = getManausDate()): WeekRanges {
  // `now` já vem no horário de parede de Manaus (getManausDate). Não reaplicar
  // toZonedTime aqui — isso deslocaria o fuso de novo em clientes fora de Manaus
  // e poderia selecionar a semana errada perto da virada de segunda-feira.
  const curStart = startOfWeek(now, { weekStartsOn: 1 });
  const curEnd = endOfWeek(now, { weekStartsOn: 1 });
  const prevStart = subWeeks(curStart, 1);
  const prevEnd = subWeeks(curEnd, 1);
  return {
    currentStart: toDateKey(curStart),
    currentEnd: toDateKey(curEnd),
    prevStart: toDateKey(prevStart),
    prevEnd: toDateKey(prevEnd),
  };
}

/** Meta = Base × (1 + growth%/100). */
export function weeklyMeta(base: number, growthPct: number | null | undefined): number {
  return base * (1 + (Number(growthPct) || 0) / 100);
}

/**
 * Uma transação entra no faturamento semanal da unidade?
 * Conta tudo que a unidade faturou — assinaturas (balcão + renovações + online),
 * serviços e produtos — exceto cancelamento (price 0) e importação de histórico.
 */
export function countsForWeeklyRevenue(tx: MetricTx): boolean {
  return !isCancellation(tx) && !isLegacyImport(tx);
}
