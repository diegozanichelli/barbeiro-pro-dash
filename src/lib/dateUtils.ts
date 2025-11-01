import { endOfMonth } from "date-fns";

/**
 * Calcula o número de dias restantes no mês atual (incluindo hoje)
 * Considera TODOS os dias do calendário (Domingo a Domingo)
 * O barbeiro escolhe quando folgar, então todos os dias são dias de trabalho potenciais
 * @param today - Data atual (padrão: new Date())
 * @returns Número de dias entre hoje e o fim do mês (inclusive)
 */
export function calculateRemainingWorkDays(today: Date = new Date()): number {
  const currentDay = today.getDate(); // Dia atual (1-31)
  const lastDayOfMonth = endOfMonth(today).getDate(); // Último dia do mês (28-31)
  
  // Fórmula: Total de dias no mês - Dia atual + 1 (inclui hoje)
  return lastDayOfMonth - currentDay + 1;
}
