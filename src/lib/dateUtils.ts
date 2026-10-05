import { endOfMonth, format } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";

/**
 * Fuso horário de Manaus (Horário do Amazonas - GMT-4)
 */
export const TIMEZONE = "America/Manaus";

/** Offset fixo de Manaus (não há horário de verão desde 2008). */
export const MANAUS_OFFSET = "-04:00";

/**
 * Converte uma Date (campos locais) para a chave de dia puro yyyy-MM-dd.
 * Use sempre isso para date pickers — nunca `toISOString()`.
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Início do dia em Manaus, para comparar com colunas timestamptz. */
export function manausDayStart(dateKey: string | Date): string {
  const key = typeof dateKey === "string" ? dateKey : toDateKey(dateKey);
  return `${key}T00:00:00${MANAUS_OFFSET}`;
}

/** Fim do dia em Manaus, para comparar com colunas timestamptz. */
export function manausDayEnd(dateKey: string | Date): string {
  const key = typeof dateKey === "string" ? dateKey : toDateKey(dateKey);
  return `${key}T23:59:59.999${MANAUS_OFFSET}`;
}

/**
 * Retorna a data atual no fuso horário de Manaus
 * @returns Date object ajustado para Manaus
 */
export function getManausDate(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

/**
 * Retorna a data de hoje formatada como yyyy-MM-dd no fuso horário de Manaus
 * @returns string no formato yyyy-MM-dd
 */
export function getTodayString(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

/**
 * Formata um timestamp ISO/timestamptz no fuso de Manaus.
 */
export function formatManausDateTime(
  value: string | Date,
  pattern: string = "dd/MM HH:mm"
): string {
  const date = value instanceof Date ? value : new Date(value);
  return formatInTimeZone(date, TIMEZONE, pattern);
}

/**
 * Retorna o mês e ano atual no fuso horário de Manaus
 * @returns { month: number, year: number }
 */
export function getCurrentMonthYear(): { month: number; year: number } {
  const manausDate = getManausDate();
  return {
    month: manausDate.getMonth() + 1,
    year: manausDate.getFullYear(),
  };
}

/**
 * Retorna o dia do mês atual no fuso horário de Manaus
 * @returns número do dia (1-31)
 */
export function getCurrentDay(): number {
  return getManausDate().getDate();
}

/**
 * Dias que o controlador deve lançar por padrão, seguindo a regra operacional:
 * ele registra sempre o movimento do dia anterior. Na segunda-feira, isso
 * engloba o fim de semana (sábado e domingo); nos demais dias, apenas o dia
 * imediatamente anterior. É só uma SUGESTÃO inteligente — a tela permite ajustar
 * a data manualmente para corrigir lançamentos.
 * @param today - Data atual (padrão: data de Manaus)
 * @returns lista de chaves yyyy-MM-dd em ordem cronológica
 */
export function getControllerDefaultDays(today: Date = getManausDate()): string[] {
  const dayAt = (offset: number): string =>
    toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset));

  // getDay(): 0=domingo, 1=segunda, ... 6=sábado
  if (today.getDay() === 1) {
    // Segunda-feira → sábado (2 dias atrás) e domingo (1 dia atrás)
    return [dayAt(2), dayAt(1)];
  }
  // Demais dias → somente ontem
  return [dayAt(1)];
}

/**
 * Calcula o número de dias restantes no mês atual (incluindo hoje)
 * Considera o mês completo e exclui apenas feriados configurados
 * @param today - Data atual (padrão: data de Manaus)
 * @param holidayDates - Lista de datas (yyyy-MM-dd) que devem ser desconsideradas
 * @returns Número de dias entre hoje e o fim do mês (inclusive)
 */
export function calculateRemainingWorkDays(today: Date = getManausDate(), holidayDates: string[] = []): number {
  const lastDayOfMonth = endOfMonth(today).getDate();
  const holidaysSet = new Set(holidayDates);
  let count = 0;

  for (let d = today.getDate(); d <= lastDayOfMonth; d++) {
    const date = new Date(today.getFullYear(), today.getMonth(), d);
    const dateKey = format(date, "yyyy-MM-dd");
    const isHoliday = holidaysSet.has(dateKey);

    if (!isHoliday) count++; // Excluir apenas feriados
  }

  return count;
}
