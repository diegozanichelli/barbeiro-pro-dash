import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  DollarSign,
  Loader2,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { getCurrentDay, getCurrentMonthYear, TIMEZONE } from "@/lib/dateUtils";
import { fetchAllRows } from "@/lib/supabasePagination";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { brl, int } from "@/lib/currency";

interface Unit {
  id: string;
  name: string;
}

interface Barber {
  id: string;
  name: string;
  unit_id: string | null;
  status: string;
}

interface Tx {
  barber_id: string | null;
  created_at: string;
  daily_production_id: string | null;
  item_type: string;
  item_name: string;
  service_category: string | null;
  price_sold: number;
  commission_amount: number;
  unit_id: string | null;
}

type MetricKey = "revenue" | "clients" | "ticket";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];


const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Fatias fixas de 7 dias: S1 = 1-7, S2 = 8-14, S3 = 15-21, S4 = 22-28, S5 = 29+ */
const sliceRange = (year: number, month: number, slice: number | "month") => {
  const total = daysInMonth(year, month);
  if (slice === "month") return { startDay: 1, endDay: total };
  const startDay = (slice - 1) * 7 + 1;
  return { startDay, endDay: Math.min(startDay + 6, total) };
};

const key = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

const weekdayOf = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
};

const shortDate = (dateKey: string) => {
  const [, m, d] = dateKey.split("-");
  return `${d}/${m}`;
};

/**
 * Deslocamento (em dias) que faz a fatia do mês anterior cair no mesmo dia da
 * semana da fatia atual: sábado compara com sábado, segunda com segunda.
 *
 * Existem sempre dois deslocamentos válidos (um para frente e outro para trás,
 * distantes 7 dias). Escolhemos o que mantém mais dias dentro do mês anterior —
 * sem isso, fatias no fim do mês (S5) podiam jogar a janela inteira para fora e
 * a linha de comparação desaparecia.
 */
const weekdayOffset = (
  currentKey: string,
  previousKey: string,
  previousStartDay: number,
  length: number,
  previousTotalDays: number
) => {
  const diff = (weekdayOf(currentKey) - weekdayOf(previousKey) + 7) % 7;
  if (diff === 0) return 0;

  const daysInsideMonth = (offset: number) => {
    let count = 0;
    for (let i = 0; i <= length; i++) {
      const day = previousStartDay + i + offset;
      if (day >= 1 && day <= previousTotalDays) count++;
    }
    return count;
  };

  const forward = diff;
  const backward = diff - 7;
  const gain = daysInsideMonth(forward) - daysInsideMonth(backward);
  if (gain !== 0) return gain > 0 ? forward : backward;
  return Math.abs(forward) <= Math.abs(backward) ? forward : backward;
};

interface ChartRow {
  label: string;
  atual: number | null;
  anterior: number | null;
  /** Data do mês anterior pareada por dia da semana (dd/MM). */
  anteriorLabel: string | null;
}

interface DayBucket {
  revenue: number;
  clients: number;
  commission: number;
}

const emptyBucket = (): DayBucket => ({ revenue: 0, clients: 0, commission: 0 });

/**
 * Um atendimento é uma comanda, não uma linha de serviço: corte e barba na
 * mesma venda contam como um cliente só. É a definição que o banco usa para
 * alimentar tx_clients_count (COUNT DISTINCT created_at dentro da produção
 * diária) e, por tabela, os relatórios do gestor. Agrupamos por barbeiro para
 * não juntar duas comandas simultâneas de barbeiros diferentes.
 */
const visitKey = (t: Tx) => `${t.barber_id ?? "sem-barbeiro"}|${t.created_at}`;

/**
 * Serviço sem categoria preenchida conta como básico — é como BestSalesDays e os
 * demais relatórios do gestor tratam os lançamentos antigos.
 */
type ItemKind = "basic" | "extra" | "product";
const itemKind = (t: Tx): ItemKind => {
  if (t.item_type === "product") return "product";
  return t.service_category === "extra" ? "extra" : "basic";
};

/**
 * Sem base no período anterior a variação é indefinida, não "+100%": fevereiro
 * não tem quinta fatia, o mês anterior pode não ter lançamento nenhum. Nesses
 * casos o card mostra "—" em vez de um crescimento que não existe.
 */
const variation = (current: number, previous: number) => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};

export default function PerformanceDashboard() {
  const { organizationId, loading: orgLoading } = useOrganization();
  const { month: currentMonth, year: currentYear } = getCurrentMonthYear();
  const today = getCurrentDay();

  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [unitId, setUnitId] = useState("all");
  const [slice, setSlice] = useState<number | "month">("month");
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [current, setCurrent] = useState<Tx[]>([]);
  const [previous, setPrevious] = useState<Tx[]>([]);
  const [prodDates, setProdDates] = useState<Record<string, string>>({});
  const [goals, setGoals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const [{ data: u }, { data: b }] = await Promise.all([
        supabase.from("units").select("id, name").eq("organization_id", organizationId).order("name"),
        supabase
          .from("barbers")
          .select("id, name, unit_id, status")
          .eq("organization_id", organizationId)
          .order("name"),
      ]);
      setUnits((u ?? []) as Unit[]);
      setBarbers((b ?? []) as Barber[]);
    })();
  }, [organizationId]);

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const startKey = key(prevYear, prevMonth, 1);
      const endTotal = daysInMonth(year, month);
      const endKey = key(year, month, endTotal);
      const nextDay = new Date(Date.UTC(year, month - 1, endTotal + 1, 12))
        .toISOString()
        .slice(0, 10);

      const [txs, prods] = await Promise.all([
        fetchAllRows<Tx>(() =>
          supabase
            .from("sale_transactions")
            .select(
              "barber_id, created_at, daily_production_id, item_type, item_name, service_category, price_sold, commission_amount, unit_id"
            )
            .eq("organization_id", organizationId)
            .in("item_type", ["service", "product"])
            .gte("created_at", `${startKey}T00:00:00-04:00`)
            .lt("created_at", `${nextDay}T00:00:00-04:00`)
            .order("created_at", { ascending: true })
        ),
        fetchAllRows<{ id: string; date: string }>(() =>
          supabase
            .from("daily_productions")
            .select("id, date")
            .eq("organization_id", organizationId)
            .gte("date", startKey)
            .lte("date", endKey)
        ),
      ]);

      const map: Record<string, string> = {};
      prods.forEach((p) => (map[p.id] = p.date));
      setProdDates(map);

      // Metas do mês selecionado, para o card de metas batidas.
      const { data: goalRows } = await supabase
        .from("monthly_goals")
        .select("barber_id, target_commission")
        .eq("organization_id", organizationId)
        .eq("month", month)
        .eq("year", year);
      const targets: Record<string, number> = {};
      (goalRows ?? []).forEach((g) => {
        if (!g.barber_id) return;
        targets[g.barber_id] = (targets[g.barber_id] ?? 0) + (Number(g.target_commission) || 0);
      });
      setGoals(targets);

      const dateOf = (t: Tx) =>
        (t.daily_production_id && map[t.daily_production_id]) ||
        formatInTimeZone(t.created_at, TIMEZONE, "yyyy-MM-dd");

      setCurrent(txs.filter((t) => dateOf(t).startsWith(`${year}-${pad(month)}`)));
      setPrevious(
        txs.filter((t) => dateOf(t).startsWith(`${prevYear}-${pad(prevMonth)}`))
      );
    } catch (e) {
      console.error(e);
      setError("Não foi possível carregar os dados de performance.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, month, year, prevMonth, prevYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dateOf = useCallback(
    (t: Tx) =>
      (t.daily_production_id && prodDates[t.daily_production_id]) ||
      formatInTimeZone(t.created_at, TIMEZONE, "yyyy-MM-dd"),
    [prodDates]
  );

  const filterTx = useCallback(
    (rows: Tx[], barberId: string | null) =>
      rows.filter((t) => {
        if (unitId !== "all" && t.unit_id !== unitId) return false;
        if (barberId && t.barber_id !== barberId) return false;
        return true;
      }),
    [unitId]
  );

  const buildSeries = useCallback(
    (
      rows: Tx[],
      y: number,
      m: number
    ): { byDay: Record<number, DayBucket>; total: DayBucket } => {
      const byDay: Record<number, DayBucket> = {};
      const visitsByDay: Record<number, Set<string>> = {};
      const total = emptyBucket();
      rows.forEach((t) => {
        const dk = dateOf(t);
        const [, , dStr] = dk.split("-");
        const day = Number(dStr);
        if (!byDay[day]) byDay[day] = emptyBucket();
        const bucket = byDay[day];
        bucket.revenue += Number(t.price_sold) || 0;
        bucket.commission += Number(t.commission_amount) || 0;
        total.revenue += Number(t.price_sold) || 0;
        total.commission += Number(t.commission_amount) || 0;
        (visitsByDay[day] ??= new Set()).add(visitKey(t));
      });
      // Cada comanda conta uma vez no dia em que aconteceu.
      Object.entries(visitsByDay).forEach(([day, visits]) => {
        byDay[Number(day)].clients = visits.size;
        total.clients += visits.size;
      });
      return { byDay, total };
    },
    [dateOf]
  );

  const activeBarberName = useMemo(
    () => barbers.find((b) => b.id === selectedBarber)?.name ?? null,
    [barbers, selectedBarber]
  );

  const scoped = useMemo(() => {
    const cur = filterTx(current, selectedBarber);
    const prev = filterTx(previous, selectedBarber);
    return {
      cur: buildSeries(cur, year, month),
      prev: buildSeries(prev, prevYear, prevMonth),
      curRows: cur,
    };
  }, [current, previous, filterTx, buildSeries, selectedBarber, year, month, prevYear, prevMonth]);

  const range = sliceRange(year, month, slice);
  const prevRange = sliceRange(prevYear, prevMonth, slice);
  const prevTotalDays = daysInMonth(prevYear, prevMonth);

  /**
   * Último dia que já pode ter lançamento: o mês inteiro quando fechado, hoje
   * quando é o mês corrente, nenhum dia quando é mês futuro. Sem isso os dias
   * que ainda não aconteceram entrariam no gráfico e nos cards como R$ 0.
   */
  const monthIndex = (y: number, m: number) => y * 12 + m;
  const lastRealDay = (y: number, m: number) => {
    const diff = monthIndex(y, m) - monthIndex(currentYear, currentMonth);
    if (diff > 0) return 0;
    if (diff === 0) return today;
    return daysInMonth(y, m);
  };

  const curLastDay = lastRealDay(year, month);
  const prevLastDay = lastRealDay(prevYear, prevMonth);

  /** Deslocamento que casa o dia da semana entre as duas fatias. */
  const prevOffset = weekdayOffset(
    key(year, month, range.startDay),
    key(prevYear, prevMonth, prevRange.startDay),
    prevRange.startDay,
    range.endDay - range.startDay,
    prevTotalDays
  );

  const sumRange = (
    byDay: Record<number, DayBucket>,
    start: number,
    end: number
  ): DayBucket => {
    const acc = emptyBucket();
    for (let d = start; d <= end; d++) {
      const b = byDay[d];
      if (!b) continue;
      acc.revenue += b.revenue;
      acc.clients += b.clients;
      acc.commission += b.commission;
    }
    return acc;
  };

  // Fatia em andamento: o mês corrente só tem dados até hoje.
  const curEndDay = Math.min(range.endDay, curLastDay);
  const partialPeriod = curEndDay < range.endDay;

  /**
   * Os cards usam a mesma janela que o gráfico desenha — deslocada para casar o
   * dia da semana e com o mesmo tamanho da fatia atual — senão o total do card
   * não fecha com a linha cinza logo abaixo dele.
   *
   * A exceção é o mês fechado: ali a pergunta do card é "agosto contra julho",
   * então vale o mês anterior inteiro. O alinhamento por dia da semana serve à
   * forma da curva, não ao total.
   */
  const alignedStart = prevRange.startDay + prevOffset;
  const useAlignedWindow = partialPeriod || slice !== "month";
  const prevWindow = useAlignedWindow
    ? {
        startDay: Math.max(1, alignedStart),
        endDay: Math.min(
          prevTotalDays,
          prevLastDay,
          alignedStart + (curEndDay - range.startDay)
        ),
      }
    : { startDay: prevRange.startDay, endDay: Math.min(prevRange.endDay, prevLastDay) };

  const curTotals = sumRange(scoped.cur.byDay, range.startDay, curEndDay);
  const prevTotals = sumRange(scoped.prev.byDay, prevWindow.startDay, prevWindow.endDay);

  /**
   * O período comparado fica escrito no card, não só no title: em telefone não
   * existe hover, e é esse intervalo que explica o número ao lado.
   */
  const hasPrevWindow = prevWindow.endDay >= prevWindow.startDay;
  const comparisonLabel = useAlignedWindow ? "mesmo período" : "período anterior";
  const comparisonRange = useAlignedWindow
    ? `${shortDate(key(prevYear, prevMonth, prevWindow.startDay))} a ${shortDate(
        key(prevYear, prevMonth, prevWindow.endDay)
      )}`
    : MONTHS[prevMonth - 1];

  const curTicket = curTotals.clients ? curTotals.revenue / curTotals.clients : 0;
  const prevTicket = prevTotals.clients ? prevTotals.revenue / prevTotals.clients : 0;

  const kpis = [
    {
      label: "Faturamento",
      icon: DollarSign,
      value: brl(curTotals.revenue),
      delta: variation(curTotals.revenue, prevTotals.revenue),
      previous: brl(prevTotals.revenue),
    },
    {
      label: "Atendimentos",
      icon: Users,
      value: int(curTotals.clients),
      delta: variation(curTotals.clients, prevTotals.clients),
      previous: int(prevTotals.clients),
    },
    {
      label: "Ticket médio",
      icon: Receipt,
      value: brl(curTicket),
      delta: variation(curTicket, prevTicket),
      previous: brl(prevTicket),
    },
    {
      label: "Comissão",
      icon: Wallet,
      value: brl(curTotals.commission),
      delta: variation(curTotals.commission, prevTotals.commission),
      previous: brl(prevTotals.commission),
    },
  ];

  const chartData = useMemo(() => {
    const rows: ChartRow[] = [];
    const len = range.endDay - range.startDay;
    for (let i = 0; i <= len; i++) {
      const day = range.startDay + i;
      const prevDay = prevRange.startDay + i + prevOffset;
      // Dia futuro não é "vendeu zero", é dia que ainda não aconteceu: fica sem ponto.
      const hasCur = day <= curLastDay;
      const hasPrev = prevDay >= 1 && prevDay <= Math.min(prevTotalDays, prevLastDay);
      const dk = key(year, month, day);
      const cb = scoped.cur.byDay[day];
      const pb = hasPrev ? scoped.prev.byDay[prevDay] : undefined;
      const pick = (b?: DayBucket) => {
        if (!b) return 0;
        if (metric === "revenue") return b.revenue;
        if (metric === "clients") return b.clients;
        return b.clients ? b.revenue / b.clients : 0;
      };
      rows.push({
        label: slice === "month" ? shortDate(dk) : `${WEEKDAYS[weekdayOf(dk)]} ${day}`,
        atual: hasCur ? pick(cb) : null,
        anterior: hasPrev ? pick(pb) : null,
        anteriorLabel: hasPrev ? shortDate(key(prevYear, prevMonth, prevDay)) : null,
      });
    }
    return rows;
  }, [
    range,
    prevRange,
    prevOffset,
    prevTotalDays,
    curLastDay,
    prevLastDay,
    scoped,
    metric,
    slice,
    year,
    month,
    prevYear,
    prevMonth,
  ]);

  const teamRanking = useMemo(() => {
    const rows = filterTx(current, null);
    const totals: Record<string, DayBucket & Record<ItemKind, number>> = {};
    const visits: Record<string, Set<string>> = {};
    rows.forEach((t) => {
      if (!t.barber_id) return;
      const dk = dateOf(t);
      const day = Number(dk.split("-")[2]);
      if (day < range.startDay || day > range.endDay) return;
      if (!totals[t.barber_id]) {
        totals[t.barber_id] = { ...emptyBucket(), basic: 0, extra: 0, product: 0 };
      }
      const b = totals[t.barber_id];
      const valor = Number(t.price_sold) || 0;
      b.revenue += valor;
      b.commission += Number(t.commission_amount) || 0;
      b[itemKind(t)] += valor;
      (visits[t.barber_id] ??= new Set()).add(visitKey(t));
    });
    Object.entries(visits).forEach(([id, set]) => (totals[id].clients = set.size));
    return Object.entries(totals)
      .map(([id, v]) => ({
        id,
        name: barbers.find((b) => b.id === id)?.name ?? "Barbeiro",
        ...v,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [current, filterTx, dateOf, range, barbers]);

  /**
   * Metas são mensais, então este resumo ignora a fatia (S1-S5) e sempre olha o
   * mês inteiro. A regra é a mesma do painel anterior: conta quem tem meta
   * definida e alcançou a comissão do mês; o denominador respeita o filtro de
   * unidade.
   */
  const goalsSummary = useMemo(() => {
    const scopedBarbers = barbers.filter(
      (b) => b.status === "active" && (unitId === "all" || b.unit_id === unitId)
    );
    const earned: Record<string, number> = {};
    filterTx(current, null).forEach((t) => {
      if (!t.barber_id) return;
      earned[t.barber_id] = (earned[t.barber_id] ?? 0) + (Number(t.commission_amount) || 0);
    });
    const achieved = scopedBarbers.filter((b) => {
      const target = goals[b.id] ?? 0;
      return target > 0 && (earned[b.id] ?? 0) >= target;
    }).length;
    return { achieved, total: scopedBarbers.length };
  }, [barbers, unitId, current, filterTx, goals]);

  const individualDays = useMemo(() => {
    if (!selectedBarber) return [];
    const byDate: Record<string, Tx[]> = {};
    scoped.curRows.forEach((t) => {
      const dk = dateOf(t);
      const day = Number(dk.split("-")[2]);
      if (day < range.startDay || day > range.endDay) return;
      (byDate[dk] ||= []).push(t);
    });
    return Object.entries(byDate)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        date,
        items,
        revenue: items.reduce((s, t) => s + (Number(t.price_sold) || 0), 0),
        commission: items.reduce((s, t) => s + (Number(t.commission_amount) || 0), 0),
        clients: new Set(items.map(visitKey)).size,
      }));
  }, [selectedBarber, scoped.curRows, dateOf, range]);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 3; y--) list.push(y);
    return list;
  }, [currentYear]);

  const initials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");

  const metricFormatter = (v: number) =>
    metric === "clients" ? int(v) : brl(v);

  const slices: (number | "month")[] = [1, 2, 3, 4, 5, "month"];

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho de filtros */}
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-primary/80">
            Performance Barber
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-foreground">
            Performance
          </h2>
          <p className="text-sm text-muted-foreground">Comparação de resultados</p>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {slices.map((s) => {
              const active = slice === s;
              const label = s === "month" ? "Mês" : `S${s}`;
              return (
                <button
                  key={String(s)}
                  onClick={() => setSlice(s)}
                  className={cn(
                    "min-h-[36px] px-4 rounded-full text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-gold"
                      : "bg-secondary text-foreground/75 hover:bg-accent"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-9 w-[150px] bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-[110px] bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="h-9 w-[180px] bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas unidades</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <Card className="glass border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          const delta = k.delta;
          const positive = (delta ?? 0) >= 0;
          const DeltaIcon = positive ? TrendingUp : TrendingDown;
          return (
            <Card key={k.label} className="glass border-white/[0.06]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {k.label}
                    </p>
                    <p
                      className="font-metric text-2xl md:text-3xl font-bold text-foreground mt-1"
                      data-metric
                    >
                      {loading ? "—" : k.value}
                    </p>
                  </div>
                  <span className="rounded-xl bg-primary/12 p-2.5">
                    <Icon className="w-5 h-5 text-primary" />
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                      delta === null
                        ? "bg-secondary text-muted-foreground"
                        : positive
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive"
                    )}
                    title={delta === null ? "Sem base de comparação no período anterior" : undefined}
                  >
                    {delta !== null && <DeltaIcon className="w-3 h-3" />}
                    {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                  </span>
                  <span className="text-xs text-muted-foreground/80">
                    {hasPrevWindow
                      ? `${comparisonLabel} (${comparisonRange}): ${k.previous}`
                      : "sem período equivalente no mês anterior"}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Metas do mês */}
      <Card className="glass border-white/[0.06]">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Metas batidas no mês
              </p>
              <p className="text-sm text-muted-foreground/80">
                Barbeiros que já alcançaram a meta de comissão de {MONTHS[month - 1]}
              </p>
            </div>
            <p className="font-metric text-2xl md:text-3xl font-bold text-foreground" data-metric>
              {int(goalsSummary.achieved)}
              <span className="text-muted-foreground text-lg"> / {int(goalsSummary.total)}</span>
            </p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${
                  goalsSummary.total > 0
                    ? (goalsSummary.achieved / goalsSummary.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Gráfico */}
      <Card className="glass border-white/[0.06]">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-2">
              {selectedBarber && (
                <button
                  onClick={() => setSelectedBarber(null)}
                  className="rounded-lg p-1.5 hover:bg-accent text-muted-foreground"
                  aria-label="Voltar para a visão geral"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h3 className="font-display text-base font-semibold text-foreground">
                {selectedBarber
                  ? `Comparativo Individual — ${activeBarberName}`
                  : "Resumo geral"}
              </h3>
            </div>

            <div className="flex items-center gap-1 md:ml-auto overflow-x-auto">
              {(
                [
                  { k: "revenue", label: "Faturamento" },
                  { k: "clients", label: "Atendimentos" },
                  { k: "ticket", label: "Ticket Médio" },
                ] as { k: MetricKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMetric(t.k)}
                  className={cn(
                    "relative min-h-[36px] px-3 text-sm whitespace-nowrap transition-colors",
                    metric === t.k
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                  {metric === t.k && (
                    <span className="absolute left-2 right-2 -bottom-0.5 h-[2px] rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[300px]">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                    opacity={0.35}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    stroke="hsl(var(--border))"
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    stroke="hsl(var(--border))"
                    tickFormatter={(v: number) =>
                      metric === "clients" ? int(v) : `R$${int(v)}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      color: "hsl(var(--popover-foreground))",
                    }}
                    formatter={(
                      value: number,
                      name: string,
                      item: { payload?: ChartRow }
                    ) => [
                      metricFormatter(Number(value)),
                      name === "atual"
                        ? "Período atual"
                        : item?.payload?.anteriorLabel
                          ? `Mês anterior (${item.payload.anteriorLabel})`
                          : "Mês anterior",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="atual"
                    name="atual"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="anterior"
                    name="anterior"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-6 rounded-full bg-primary" /> Período atual
            </span>
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-6 rounded-full bg-muted-foreground/70" /> Mês
              anterior <span className="text-muted-foreground/70">(mesmo dia da semana)</span>
            </span>
          </div>

          {/* Detalhamento individual */}
          {selectedBarber && (
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <p className="text-xs uppercase tracking-wide text-muted-foreground pt-3">
                Histórico de atendimentos
              </p>
              {individualDays.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum lançamento no período selecionado.
                </p>
              )}
              {individualDays.map((day) => (
                <Collapsible key={day.date}>
                  <CollapsibleTrigger className="w-full flex items-center gap-3 rounded-xl bg-secondary/60 px-3 py-3 text-left hover:bg-accent transition-colors">
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground">
                      {shortDate(day.date)} · {WEEKDAYS[weekdayOf(day.date)]}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {int(day.clients)} atend.
                    </span>
                    <span className="text-sm font-semibold text-primary font-metric" data-metric>
                      {brl(day.revenue)}
                    </span>
                    <span className="text-xs text-success font-metric hidden sm:inline" data-metric>
                      {brl(day.commission)}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 py-2 space-y-1">
                      {day.items.map((t, i) => (
                        <div
                          key={`${day.date}-${i}`}
                          className="flex items-center gap-3 text-sm py-1.5 border-b border-white/[0.04] last:border-0"
                        >
                          <span className="text-foreground/90 truncate">{t.item_name}</span>
                          <span className="ml-auto text-muted-foreground text-xs">
                            Ticket
                          </span>
                          <span className="font-metric text-foreground" data-metric>
                            {brl(Number(t.price_sold))}
                          </span>
                          <span className="text-muted-foreground text-xs">Comissão</span>
                          <span className="font-metric text-success" data-metric>
                            {brl(Number(t.commission_amount))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipe */}
      <div className="space-y-3">
        <h3 className="font-display text-base font-semibold text-foreground">
          Desempenho da Equipe
        </h3>
        {!loading && teamRanking.length === 0 && (
          <Card className="glass border-white/[0.06]">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Nenhuma venda registrada no período.
            </CardContent>
          </Card>
        )}
        <div className="space-y-2">
          {teamRanking.map((b, index) => {
            const active = selectedBarber === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBarber(active ? null : b.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors border",
                  active
                    ? "bg-primary/10 border-primary/40"
                    : "glass border-white/[0.06] hover:bg-accent/50"
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {initials(b.name)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground truncate">
                    {b.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    #{index + 1} · {int(b.clients)} atendimentos · ticket{" "}
                    {brl(b.clients ? b.revenue / b.clients : 0)}
                  </span>
                  <span className="block text-xs text-muted-foreground/80 truncate">
                    básicos {brl(b.basic)} · extras {brl(b.extra)} · produtos {brl(b.product)}
                  </span>
                </span>
                <span className="ml-auto text-right">
                  <span
                    className="block font-metric text-base md:text-lg font-bold text-primary"
                    data-metric
                  >
                    {brl(b.revenue)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    comissão {brl(b.commission)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
