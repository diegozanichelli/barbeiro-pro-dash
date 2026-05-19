export const monthNamesPt = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const monthShortPt = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export const fmtBRL = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtInt = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR");

export const variation = (current: number, previous: number) => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};

export const fmtPct = (n: number | null) => {
  if (n === null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
};

// ============ Period helpers ============

export type PeriodMode = "full_month" | "mtd" | "first_half" | "second_half" | "custom";

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/** Conta dias do range excluindo apenas feriados (mesma lógica de calculateRemainingWorkDays). */
export function countWorkingDays(start: Date, end: Date, holidayDates: string[] = []): number {
  const set = new Set(holidayDates);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (!set.has(toISODate(cur))) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function isFullMonth(start: Date, end: Date): boolean {
  return (
    start.getDate() === 1 &&
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear() &&
    end.getDate() === lastDayOfMonth(end.getFullYear(), end.getMonth() + 1)
  );
}

/** Calcula intervalo de comparação imediatamente anterior, com mesma quantidade de dias. */
export function computeCompareRange(start: Date, end: Date): { compareStart: Date; compareEnd: Date } {
  const len = daysBetween(start, end);
  // Caso especial: mês fechado => mesmo intervalo do mês anterior
  if (isFullMonth(start, end)) {
    const prevMonth = start.getMonth() === 0 ? 11 : start.getMonth() - 1;
    const prevYear = start.getMonth() === 0 ? start.getFullYear() - 1 : start.getFullYear();
    const cStart = new Date(prevYear, prevMonth, 1);
    const cEnd = new Date(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth + 1));
    return { compareStart: cStart, compareEnd: cEnd };
  }
  const cEnd = addDays(start, -1);
  const cStart = addDays(cEnd, -(len - 1));
  return { compareStart: cStart, compareEnd: cEnd };
}

/** Resolve as datas para cada modo de período. */
export function resolvePeriod(
  mode: PeriodMode,
  month: number,
  year: number,
  custom?: { start: Date; end: Date } | null,
  today: Date = new Date(),
): { start: Date; end: Date } {
  if (mode === "full_month") {
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month - 1, lastDayOfMonth(year, month)),
    };
  }
  if (mode === "mtd") {
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month - 1, Math.min(today.getDate(), lastDayOfMonth(year, month))),
    };
  }
  if (mode === "first_half") {
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month - 1, 15),
    };
  }
  if (mode === "second_half") {
    return {
      start: new Date(year, month - 1, 16),
      end: new Date(year, month - 1, lastDayOfMonth(year, month)),
    };
  }
  // custom
  if (custom) return { start: custom.start, end: custom.end };
  return { start: new Date(year, month - 1, 1), end: new Date(year, month - 1, lastDayOfMonth(year, month)) };
}

/** Rótulo curto humano do período. */
export function formatPeriodLabel(start: Date, end: Date): string {
  if (isFullMonth(start, end)) {
    return `${monthNamesPt[start.getMonth()]} / ${start.getFullYear()}`;
  }
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  // 1ª quinzena
  if (sameMonth && start.getDate() === 1 && end.getDate() === 15) {
    return `1ª Quinzena de ${monthNamesPt[start.getMonth()]} / ${start.getFullYear()}`;
  }
  if (
    sameMonth &&
    start.getDate() === 16 &&
    end.getDate() === lastDayOfMonth(end.getFullYear(), end.getMonth() + 1)
  ) {
    return `2ª Quinzena de ${monthNamesPt[start.getMonth()]} / ${start.getFullYear()}`;
  }
  if (sameMonth) {
    return `${String(start.getDate()).padStart(2, "0")}–${String(end.getDate()).padStart(2, "0")} de ${monthNamesPt[start.getMonth()]} / ${start.getFullYear()}`;
  }
  return `${String(start.getDate()).padStart(2, "0")} ${monthShortPt[start.getMonth()]} – ${String(end.getDate()).padStart(2, "0")} ${monthShortPt[end.getMonth()]} / ${end.getFullYear()}`;
}

/** Rótulo curtinho para chips. */
export function formatPeriodShort(start: Date, end: Date): string {
  if (isFullMonth(start, end)) return `${monthShortPt[start.getMonth()]}/${String(start.getFullYear()).slice(2)}`;
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${String(start.getDate()).padStart(2, "0")}–${String(end.getDate()).padStart(2, "0")} ${monthShortPt[start.getMonth()]}`;
  }
  return `${String(start.getDate()).padStart(2, "0")} ${monthShortPt[start.getMonth()]} – ${String(end.getDate()).padStart(2, "0")} ${monthShortPt[end.getMonth()]}`;
}
