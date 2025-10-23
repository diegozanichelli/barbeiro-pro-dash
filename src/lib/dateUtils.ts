import { eachDayOfInterval, endOfMonth, isWeekend, startOfDay } from "date-fns";

/**
 * Calcula o número de dias úteis restantes no mês atual
 * Considera Segunda a Sábado como dias úteis (exclui apenas Domingo)
 * @param today - Data atual (padrão: new Date())
 * @returns Número de dias úteis entre hoje e o fim do mês (inclusive)
 */
export function calculateRemainingWorkDays(today: Date = new Date()): number {
  const startDate = startOfDay(today);
  const lastDayOfMonth = endOfMonth(today);

  // Gera array com todos os dias entre hoje e o fim do mês
  const daysInterval = eachDayOfInterval({
    start: startDate,
    end: lastDayOfMonth,
  });

  // Conta apenas dias que não são domingo (0 = domingo)
  const workDays = daysInterval.filter((day) => day.getDay() !== 0);

  return workDays.length;
}
