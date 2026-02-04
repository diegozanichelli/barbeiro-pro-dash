import { endOfMonth, format } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";

/**
 * Fuso horário de Manaus (Horário do Amazonas - GMT-4)
 */
export const TIMEZONE = "America/Manaus";

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
 * Calcula o número de dias restantes no mês atual (incluindo hoje)
 * Considera TODOS os dias do calendário (Domingo a Domingo)
 * O barbeiro escolhe quando folgar, então todos os dias são dias de trabalho potenciais
 * @param today - Data atual (padrão: data de Manaus)
 * @returns Número de dias entre hoje e o fim do mês (inclusive)
 */
export function calculateRemainingWorkDays(today: Date = getManausDate()): number {
  const currentDay = today.getDate(); // Dia atual (1-31)
  const lastDayOfMonth = endOfMonth(today).getDate(); // Último dia do mês (28-31)
  
  // Fórmula: Total de dias no mês - Dia atual + 1 (inclui hoje)
  return lastDayOfMonth - currentDay + 1;
}
