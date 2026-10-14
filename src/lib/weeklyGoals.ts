import { getManausDate, toDateKey } from "@/lib/dateUtils";
import { isCancellation, isLegacyImport, type MetricTx } from "@/lib/metricsRules";

/**
 * Faixas da semana no fuso de Manaus, como yyyy-MM-dd.
 * Semana corrente + semana anterior (base da meta).
 *
 * A semana é um BLOCO FIXO DO MÊS de 7 dias contados a partir do dia 1:
 * 1–7, 8–14, 15–21, 22–28 e 29–fim do mês (o último bloco pode ter menos de 7
 * dias). Não é semana ISO (segunda a domingo): o calendário reinicia todo dia 1.
 * A "semana anterior" é o bloco imediatamente anterior na ordem do tempo —
 * para o bloco 1–7, é o último bloco do mês anterior (que pode ser parcial).
 */
export interface WeekRanges {
  currentStart: string;
  currentEnd: string;
  prevStart: string;
  prevEnd: string;
}

interface Block {
  start: Date;
  end: Date;
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** Índice do bloco (0..4) que contém o dia do mês informado. */
function blockIndexOf(day: number): number {
  return Math.min(4, Math.floor((day - 1) / 7));
}

/** Bloco (início/fim) de índice `idx` no mês (year, month0). */
function blockAt(year: number, month0: number, idx: number): Block {
  const last = lastDayOfMonth(year, month0);
  const startDay = idx * 7 + 1;
  const endDay = Math.min(startDay + 6, last);
  return { start: new Date(year, month0, startDay), end: new Date(year, month0, endDay) };
}

/** Último bloco do mês anterior a (year, month0). */
function lastBlockOfPrevMonth(year: number, month0: number): Block {
  const py = month0 === 0 ? year - 1 : year;
  const pm = month0 === 0 ? 11 : month0 - 1;
  const last = lastDayOfMonth(py, pm);
  return blockAt(py, pm, blockIndexOf(last));
}

export function getWeekRanges(now: Date = getManausDate()): WeekRanges {
  // `now` já vem no horário de parede de Manaus (getManausDate); usamos ano/mês/
  // dia direto. Não reaplicar toZonedTime — deslocaria o fuso de novo em clientes
  // fora de Manaus e poderia cair no bloco errado perto da virada do dia.
  const year = now.getFullYear();
  const month0 = now.getMonth();
  const day = now.getDate();
  const idx = blockIndexOf(day);
  const cur = blockAt(year, month0, idx);
  const prev = idx > 0 ? blockAt(year, month0, idx - 1) : lastBlockOfPrevMonth(year, month0);
  return {
    currentStart: toDateKey(cur.start),
    currentEnd: toDateKey(cur.end),
    prevStart: toDateKey(prev.start),
    prevEnd: toDateKey(prev.end),
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
