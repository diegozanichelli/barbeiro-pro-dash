import { useCallback, useEffect, useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  CalendarDays,
  Clock,
  Loader2,
  Package,
  Scissors,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { getManausDate, TIMEZONE } from "@/lib/dateUtils";
import { fetchAllRows } from "@/lib/supabasePagination";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Unit {
  id: string;
  name: string;
}

interface SaleTransaction {
  barber_id: string | null;
  created_at: string;
  daily_production_id: string | null;
  production_date?: string | null;
  item_type: string;
  service_category: string | null;
  price_sold: number;
  unit_id: string | null;
}

interface DailyProductionDate {
  id: string;
  date: string;
}

interface Barber {
  id: string;
  name: string;
  unit_id: string | null;
}

type CategoryKey = "basic" | "extra" | "product";
type MetricKey = "amount" | "count";

interface BucketValue {
  amount: number;
  count: number;
}

interface CategoryInfo {
  key: CategoryKey;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  colorClass: string;
}

const CATEGORIES: CategoryInfo[] = [
  {
    key: "basic",
    label: "Serviços base",
    shortLabel: "Base",
    icon: Scissors,
    colorClass: "bg-sky-500",
  },
  {
    key: "extra",
    label: "Serviços extras",
    shortLabel: "Extras",
    icon: Sparkles,
    colorClass: "bg-violet-500",
  },
  {
    key: "product",
    label: "Produtos",
    shortLabel: "Produtos",
    icon: Package,
    colorClass: "bg-emerald-500",
  },
];

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

const emptyBucket = (): Record<CategoryKey, BucketValue> => ({
  basic: { amount: 0, count: 0 },
  extra: { amount: 0, count: 0 },
  product: { amount: 0, count: 0 },
});

const getCategory = (transaction: SaleTransaction): CategoryKey | null => {
  if (transaction.item_type === "product") return "product";
  if (transaction.item_type !== "service") return null;
  if (transaction.service_category === "extra") return "extra";

  // Transações antigas de serviço podem não ter service_category preenchido.
  // Nos demais relatórios do gestor, serviço sem categoria é tratado como base.
  return "basic";
};

const getBucketValue = (bucket: BucketValue, metric: MetricKey) =>
  metric === "amount" ? bucket.amount : bucket.count;

const formatMetric = (value: number, metric: MetricKey) =>
  metric === "amount"
    ? currencyFormatter.format(value)
    : `${numberFormatter.format(value)} venda${value === 1 ? "" : "s"}`;

const PAGE_SIZE = 1000;
const OPENING_HOUR = 7;
const CLOSING_HOUR = 22;
const BUSINESS_HOURS = Array.from(
  { length: CLOSING_HOUR - OPENING_HOUR + 1 },
  (_, index) => OPENING_HOUR + index,
);

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
};

const addDaysToDateKey = (dateKey: string, days: number) => {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
};

const getDateKeysInRange = (startDateKey: string, endDateKey: string) => {
  const dates: string[] = [];
  let current = startDateKey;

  while (current <= endDateKey) {
    dates.push(current);
    current = addDaysToDateKey(current, 1);
  }

  return dates;
};

const getDateDisplayInfo = (dateKey: string) => {
  const { year, month, day } = parseDateKey(dateKey);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12));

  return {
    day,
    weekday: utcDate.getUTCDay(),
    shortDate: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`,
  };
};

const getWeekDisplayInfo = (dateKey: string) => {
  const { year, month, day } = parseDateKey(dateKey);
  // Fatias fixas de 7 dias a partir do dia 1 do mês:
  // Semana 1: 1-7, Semana 2: 8-14, Semana 3: 15-21, Semana 4: 22-28, Semana 5: 29+
  const weekIndex = Math.floor((day - 1) / 7); // 0..4
  const startDay = weekIndex * 7 + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDay = Math.min(startDay + 6, daysInMonth);
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekStart = `${year}-${pad(month)}-${pad(startDay)}`;
  const weekEnd = `${year}-${pad(month)}-${pad(endDay)}`;
  const weekNumber = weekIndex + 1;

  return {
    weekStart,
    weekEnd,
    label: `${weekNumber} (${getDateDisplayInfo(weekStart).shortDate} a ${getDateDisplayInfo(weekEnd).shortDate})`,
  };
};

const getSaleDateKey = (transaction: SaleTransaction) =>
  transaction.production_date ||
  formatInTimeZone(transaction.created_at, TIMEZONE, "yyyy-MM-dd");

const getHeatIntensityClass = (value: number, max: number) => {
  if (value <= 0 || max <= 0)
    return "bg-muted/30 text-muted-foreground border-white/[0.06]";
  const ratio = value / max;
  if (ratio >= 0.85)
    return "bg-primary text-primary-foreground border-primary/60 shadow-[0_0_18px_hsl(var(--primary)/0.28)]";
  if (ratio >= 0.65)
    return "bg-primary/75 text-primary-foreground border-primary/50";
  if (ratio >= 0.45) return "bg-primary/55 text-foreground border-primary/40";
  if (ratio >= 0.25) return "bg-primary/30 text-foreground border-primary/30";
  return "bg-primary/15 text-foreground border-primary/20";
};

export default function BestSalesDays() {
  const { organizationId, loading: organizationLoading } = useOrganization();
  const today = getManausDate();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(today),
    to: endOfMonth(today),
  });
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [selectedBarber, setSelectedBarber] = useState("all");
  const [metric, setMetric] = useState<MetricKey>("amount");
  const [units, setUnits] = useState<Unit[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [transactions, setTransactions] = useState<SaleTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!organizationId || !dateRange?.from) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    const rangeEnd = dateRange.to ?? dateRange.from;
    const startDate = format(dateRange.from, "yyyy-MM-dd");
    const endDate = format(rangeEnd, "yyyy-MM-dd");
    const nextDayKey = addDaysToDateKey(endDate, 1);

    try {
      const unitsPromise = supabase
        .from("units")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name");

      const barbersPromise = supabase
        .from("barbers")
        .select("id, name, unit_id")
        .eq("organization_id", organizationId);

      const productionsPromise = fetchAllRows<{ id: string; date: string }>(() =>
        supabase
          .from("daily_productions")
          .select("id, date")
          .eq("organization_id", organizationId)
          .gte("date", startDate)
          .lte("date", endDate)
      ).then((data) => ({ data, error: null as null }));

      const allTransactions: SaleTransaction[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("sale_transactions")
          .select(
            "barber_id, created_at, daily_production_id, item_type, service_category, price_sold, unit_id",
          )
          .eq("organization_id", organizationId)
          .in("item_type", ["service", "product"])
          .gte("created_at", `${startDate}T00:00:00-04:00`)
          .lt("created_at", `${nextDayKey}T00:00:00-04:00`)
          .order("created_at", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allTransactions.push(...((data || []) as SaleTransaction[]));

        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      const [
        { data: unitsData, error: unitsError },
        { data: barbersData, error: barbersError },
        { data: productionsData, error: productionsError },
      ] = await Promise.all([unitsPromise, barbersPromise, productionsPromise]);

      if (unitsError) throw unitsError;
      if (barbersError) throw barbersError;
      if (productionsError) throw productionsError;

      const productionDateById = new Map(
        ((productionsData || []) as DailyProductionDate[]).map((production) => [
          production.id,
          production.date,
        ]),
      );

      const transactionsWithProductionDate = allTransactions.map(
        (transaction) => ({
          ...transaction,
          production_date: transaction.daily_production_id
            ? productionDateById.get(transaction.daily_production_id)
            : null,
        }),
      );

      const barberUnitById = new Map(
        ((barbersData || []) as Barber[]).map((barber) => [
          barber.id,
          barber.unit_id,
        ]),
      );

      const filteredTransactions = transactionsWithProductionDate.filter(
        (transaction) => {
          const transactionUnitId =
            transaction.unit_id ||
            (transaction.barber_id
              ? barberUnitById.get(transaction.barber_id)
              : null);

          const matchesUnit =
            selectedUnit === "all" || transactionUnitId === selectedUnit;
          const matchesBarber =
            selectedBarber === "all" || transaction.barber_id === selectedBarber;

          return matchesUnit && matchesBarber;
        },
      );

      setUnits(unitsData || []);
      setBarbers((barbersData || []) as Barber[]);
      setTransactions(filteredTransactions);
    } catch (error) {
      console.error("Erro ao buscar vendas para mapa de calor:", error, {
        startDate,
        endDate,
        selectedUnit,
        selectedBarber,
      });
      setTransactions([]);
      setErrorMessage(
        "Não foi possível carregar as vendas para este período. Tente novamente em alguns instantes.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, dateRange, selectedUnit, selectedBarber]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const availableBarbers = useMemo(
    () =>
      selectedUnit === "all"
        ? barbers
        : barbers.filter((barber) => barber.unit_id === selectedUnit),
    [barbers, selectedUnit],
  );

  useEffect(() => {
    if (
      selectedBarber !== "all" &&
      !availableBarbers.some((barber) => barber.id === selectedBarber)
    ) {
      setSelectedBarber("all");
    }
  }, [availableBarbers, selectedBarber]);

  const analytics = useMemo(() => {
    const hourlyBuckets = BUSINESS_HOURS.map((hour) => ({
      hour,
      categories: emptyBucket(),
    }));
    const hourlyBucketByHour = new Map(
      hourlyBuckets.map((bucket) => [bucket.hour, bucket]),
    );

    const rangeEnd = dateRange?.to ?? dateRange?.from;
    const startDateKey = dateRange?.from
      ? format(dateRange.from, "yyyy-MM-dd")
      : null;
    const endDateKey = rangeEnd ? format(rangeEnd, "yyyy-MM-dd") : null;

    const dayMap = new Map<string, Record<CategoryKey, BucketValue>>();
    const rangeDays =
      startDateKey && endDateKey
        ? getDateKeysInRange(startDateKey, endDateKey)
        : [];

    rangeDays.forEach((dateKey) => {
      dayMap.set(dateKey, emptyBucket());
    });

    let outOfBusinessHoursCount = 0;

    transactions.forEach((transaction) => {
      const category = getCategory(transaction);
      if (!category) return;

      const dayKey = getSaleDateKey(transaction);
      if (
        (startDateKey && dayKey < startDateKey) ||
        (endDateKey && dayKey > endDateKey)
      ) {
        return;
      }

      const hour = Number(
        formatInTimeZone(transaction.created_at, TIMEZONE, "H"),
      );
      const price = Number(transaction.price_sold) || 0;

      const hourlyBucket = hourlyBucketByHour.get(hour);
      if (hourlyBucket) {
        hourlyBucket.categories[category].amount += price;
        hourlyBucket.categories[category].count += 1;
      } else {
        outOfBusinessHoursCount += 1;
      }

      const dayBucket = dayMap.get(dayKey) || emptyBucket();
      dayBucket[category].amount += price;
      dayBucket[category].count += 1;
      dayMap.set(dayKey, dayBucket);
    });

    const dayBuckets = Array.from(dayMap.entries()).map(
      ([date, categories]) => {
        const dateInfo = getDateDisplayInfo(date);
        return {
          date,
          day: dateInfo.day,
          weekday: dateInfo.weekday,
          shortDate: dateInfo.shortDate,
          categories,
        };
      },
    );

    const totals = emptyBucket();
    transactions.forEach((transaction) => {
      const category = getCategory(transaction);
      if (!category) return;

      const dayKey = getSaleDateKey(transaction);
      if (
        (startDateKey && dayKey < startDateKey) ||
        (endDateKey && dayKey > endDateKey)
      ) {
        return;
      }

      totals[category].amount += Number(transaction.price_sold) || 0;
      totals[category].count += 1;
    });

    const hourlyMax = Math.max(
      ...hourlyBuckets.flatMap((bucket) =>
        CATEGORIES.map((category) =>
          getBucketValue(bucket.categories[category.key], metric),
        ),
      ),
      0,
    );
    const dailyMax = Math.max(
      ...dayBuckets.flatMap((bucket) =>
        CATEGORIES.map((category) =>
          getBucketValue(bucket.categories[category.key], metric),
        ),
      ),
      0,
    );

    const hourRanking = hourlyBuckets
      .map((bucket) => ({
        hour: bucket.hour,
        value: CATEGORIES.reduce(
          (sum, category) =>
            sum + getBucketValue(bucket.categories[category.key], metric),
          0,
        ),
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    const dayRanking = dayBuckets
      .map((bucket) => ({
        date: bucket.date,
        day: bucket.day,
        weekday: WEEKDAY_LABELS[bucket.weekday],
        shortDate: bucket.shortDate,
        value: CATEGORIES.reduce(
          (sum, category) =>
            sum + getBucketValue(bucket.categories[category.key], metric),
          0,
        ),
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const weekMap = new Map<string, { label: string; value: number }>();
    transactions.forEach((transaction) => {
      const category = getCategory(transaction);
      if (!category) return;

      const dayKey = getSaleDateKey(transaction);
      if (
        (startDateKey && dayKey < startDateKey) ||
        (endDateKey && dayKey > endDateKey)
      ) {
        return;
      }

      const weekInfo = getWeekDisplayInfo(dayKey);
      const current = weekMap.get(weekInfo.weekStart) || {
        label: weekInfo.label,
        value: 0,
      };
      current.value += Number(transaction.price_sold) || 0;
      weekMap.set(weekInfo.weekStart, current);
    });

    const weekRanking = Array.from(weekMap.entries())
      .map(([weekStart, week]) => ({
        weekStart,
        label: week.label,
        value: week.value,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const totalAmount = CATEGORIES.reduce(
      (sum, category) => sum + totals[category.key].amount,
      0,
    );
    const totalCount = CATEGORIES.reduce(
      (sum, category) => sum + totals[category.key].count,
      0,
    );

    return {
      hourlyBuckets,
      dayBuckets,
      totals,
      hourlyMax,
      dailyMax,
      hourRanking,
      dayRanking,
      weekRanking,
      totalAmount,
      totalCount,
      outOfBusinessHoursCount,
    };
  }, [dateRange, transactions, metric]);

  const metricLabel = metric === "amount" ? "Receita" : "Quantidade";
  const noData = !isLoading && analytics.totalCount === 0;
  const hourlyGridStyle = {
    gridTemplateColumns: `72px repeat(${BUSINESS_HOURS.length}, minmax(36px, 1fr))`,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-mono uppercase tracking-[0.22em] text-primary/80">
            Mapa de calor
          </p>
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Melhores dias de vendas
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Analise em quais horários e dias do período saem mais vendas de
            serviços base, serviços extras e produtos.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:min-w-[960px]">
          <div className="space-y-2 sm:col-span-1">
            <Label>Período</Label>
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />
          </div>
          <div className="space-y-2">
            <Label>Unidade</Label>
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as unidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Barbeiro</Label>
            <Select value={selectedBarber} onValueChange={setSelectedBarber}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os barbeiros" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os barbeiros</SelectItem>
                {availableBarbers.map((barber) => (
                  <SelectItem key={barber.id} value={barber.id}>
                    {barber.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Métrica</Label>
            <Select
              value={metric}
              onValueChange={(value) => setMetric(value as MetricKey)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">Receita vendida</SelectItem>
                <SelectItem value="count">Quantidade de vendas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isLoading || organizationLoading ? (
        <Card className="glass-card">
          <CardContent className="flex min-h-[320px] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando mapa de calor de vendas...
          </CardContent>
        </Card>
      ) : errorMessage ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            {errorMessage}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="glass-card xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Resumo do período
                </CardTitle>
                <CardDescription>
                  {metricLabel} por venda individual lançada
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.06] bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Receita total</p>
                  <p className="text-2xl font-bold">
                    {currencyFormatter.format(analytics.totalAmount)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Vendas</p>
                  <p className="text-2xl font-bold">
                    {numberFormatter.format(analytics.totalCount)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              const total = analytics.totals[category.key];
              return (
                <Card key={category.key} className="glass-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          category.colorClass,
                        )}
                      />
                      {category.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold">
                          {currencyFormatter.format(total.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {numberFormatter.format(total.count)} vendas
                        </p>
                      </div>
                      <Icon className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {noData ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhuma venda de serviço base, serviço extra ou produto foi
                encontrada para os filtros selecionados.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
              <Card className="glass-card overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    Horários que mais vendem no dia
                  </CardTitle>
                  <CardDescription>
                    Cada célula mostra{" "}
                    {metric === "amount"
                      ? "a receita"
                      : "a quantidade de vendas"}{" "}
                    por hora e tipo de venda, considerando o horário operacional
                    exibido ({String(OPENING_HOUR).padStart(2, "0")}h–
                    {String(CLOSING_HOUR).padStart(2, "0")}h).
                  </CardDescription>
                  {analytics.outOfBusinessHoursCount > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {analytics.outOfBusinessHoursCount} lançamento
                      {analytics.outOfBusinessHoursCount === 1 ? "" : "s"} fora
                      desse intervalo entraram nos totais e nos dias, mas foram
                      ignorados no mapa por horário.
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto pb-2">
                    <div className="min-w-[650px] space-y-2">
                      <div
                        className="grid gap-1 text-[10px] text-muted-foreground"
                        style={hourlyGridStyle}
                      >
                        <div />
                        {analytics.hourlyBuckets.map((bucket) => (
                          <div key={bucket.hour} className="text-center">
                            {bucket.hour}h
                          </div>
                        ))}
                      </div>

                      {CATEGORIES.map((category) => (
                        <div
                          key={category.key}
                          className="grid gap-1 items-center"
                          style={hourlyGridStyle}
                        >
                          <div className="text-xs font-medium text-muted-foreground">
                            {category.shortLabel}
                          </div>
                          {analytics.hourlyBuckets.map((bucket) => {
                            const bucketValue = bucket.categories[category.key];
                            const value = getBucketValue(bucketValue, metric);
                            return (
                              <div
                                key={`${category.key}-${bucket.hour}`}
                                title={`${bucket.hour}:00 • ${category.label}: ${formatMetric(value, metric)} (${currencyFormatter.format(bucketValue.amount)}, ${bucketValue.count} vendas)`}
                                className={cn(
                                  "h-10 rounded-md border px-1 text-center text-[10px] font-semibold flex items-center justify-center transition-transform hover:scale-105",
                                  getHeatIntensityClass(
                                    value,
                                    analytics.hourlyMax,
                                  ),
                                )}
                              >
                                {value > 0
                                  ? metric === "amount"
                                    ? currencyFormatter
                                        .format(value)
                                        .replace("R$", "")
                                    : value
                                  : "-"}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Picos de venda
                  </CardTitle>
                  <CardDescription>
                    Ranking consolidado por{" "}
                    {metric === "amount" ? "receita" : "quantidade"}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <p className="mb-3 text-sm font-semibold">Top horários</p>
                    <div className="space-y-2">
                      {analytics.hourRanking.map((item, index) => (
                        <div
                          key={item.hour}
                          className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-muted/20 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">#{index + 1}</Badge>
                            <span className="font-medium">
                              {String(item.hour).padStart(2, "0")}:00
                            </span>
                          </div>
                          <span className="font-semibold">
                            {formatMetric(item.value, metric)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-semibold">Top dias</p>
                    <div className="space-y-2">
                      {analytics.dayRanking.map((item, index) => (
                        <div
                          key={item.date}
                          className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-muted/20 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">#{index + 1}</Badge>
                            <span className="font-medium">
                              {item.weekday}, {item.shortDate}
                            </span>
                          </div>
                          <span className="font-semibold">
                            {formatMetric(item.value, metric)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-semibold">
                      Top semanas por faturamento
                    </p>
                    <div className="space-y-2">
                      {analytics.weekRanking.map((item, index) => (
                        <div
                          key={item.weekStart}
                          className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-muted/20 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">#{index + 1}</Badge>
                            <span className="font-medium">
                              Semana {item.label}
                            </span>
                          </div>
                          <span className="font-semibold">
                            {currencyFormatter.format(item.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    Dias que mais vendem no mês
                  </CardTitle>
                  <CardDescription>
                    Mapa de calor diário separado por serviços base, serviços
                    extras e produtos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
                    {WEEKDAY_LABELS.map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({
                      length: analytics.dayBuckets[0]?.weekday || 0,
                    }).map((_, index) => (
                      <div key={`empty-${index}`} />
                    ))}
                    {analytics.dayBuckets.map((bucket) => {
                      const totalValue = CATEGORIES.reduce(
                        (sum, category) =>
                          sum +
                          getBucketValue(
                            bucket.categories[category.key],
                            metric,
                          ),
                        0,
                      );
                      return (
                        <div
                          key={bucket.date}
                          className={cn(
                            "min-h-[116px] rounded-xl border p-2 transition-transform hover:scale-[1.02]",
                            getHeatIntensityClass(
                              totalValue,
                              analytics.dailyMax,
                            ),
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-bold">
                              {bucket.day}
                            </span>
                            <span className="text-[10px] opacity-80">
                              {formatMetric(totalValue, metric)}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {CATEGORIES.map((category) => {
                              const categoryValue = getBucketValue(
                                bucket.categories[category.key],
                                metric,
                              );
                              return (
                                <div
                                  key={`${bucket.date}-${category.key}`}
                                  className="flex items-center justify-between gap-1 rounded bg-background/25 px-1.5 py-1 text-[10px]"
                                >
                                  <span className="flex items-center gap-1 truncate">
                                    <span
                                      className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        category.colorClass,
                                      )}
                                    />
                                    {category.shortLabel}
                                  </span>
                                  <span className="font-semibold">
                                    {categoryValue > 0
                                      ? metric === "amount"
                                        ? currencyFormatter
                                            .format(categoryValue)
                                            .replace("R$", "")
                                        : categoryValue
                                      : "-"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
