import { useCallback, useEffect, useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth, eachDayOfInterval } from "date-fns";
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
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { getManausDate, TIMEZONE } from "@/lib/dateUtils";
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
  item_type: string;
  service_category: string | null;
  price_sold: number;
  unit_id: string | null;
}

interface BarberUnit {
  id: string;
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
  const [metric, setMetric] = useState<MetricKey>("amount");
  const [units, setUnits] = useState<Unit[]>([]);
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
    const nextDay = new Date(rangeEnd);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayKey = format(nextDay, "yyyy-MM-dd");

    try {
      const unitsPromise = supabase
        .from("units")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name");

      const barbersPromise = supabase
        .from("barbers")
        .select("id, unit_id")
        .eq("organization_id", organizationId);

      const allTransactions: SaleTransaction[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("sale_transactions")
          .select(
            "barber_id, created_at, item_type, service_category, price_sold, unit_id",
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
      ] = await Promise.all([unitsPromise, barbersPromise]);

      if (unitsError) throw unitsError;
      if (barbersError) throw barbersError;

      const barberUnitById = new Map(
        ((barbersData || []) as BarberUnit[]).map((barber) => [
          barber.id,
          barber.unit_id,
        ]),
      );

      const filteredTransactions =
        selectedUnit === "all"
          ? allTransactions
          : allTransactions.filter((transaction) => {
              const transactionUnitId =
                transaction.unit_id ||
                (transaction.barber_id
                  ? barberUnitById.get(transaction.barber_id)
                  : null);

              return transactionUnitId === selectedUnit;
            });

      setUnits(unitsData || []);
      setTransactions(filteredTransactions);
    } catch (error) {
      console.error("Erro ao buscar vendas para mapa de calor:", error, {
        startDate,
        endDate,
        selectedUnit,
      });
      setTransactions([]);
      setErrorMessage(
        "Não foi possível carregar as vendas para este período. Tente novamente em alguns instantes.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, dateRange, selectedUnit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const analytics = useMemo(() => {
    const hourlyBuckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      categories: emptyBucket(),
    }));

    const dayMap = new Map<string, Record<CategoryKey, BucketValue>>();
    const rangeDays = dateRange?.from
      ? eachDayOfInterval({
          start: dateRange.from,
          end: dateRange.to ?? dateRange.from,
        })
      : [];

    rangeDays.forEach((day) => {
      dayMap.set(format(day, "yyyy-MM-dd"), emptyBucket());
    });

    transactions.forEach((transaction) => {
      const category = getCategory(transaction);
      if (!category) return;

      const hour = Number(
        formatInTimeZone(transaction.created_at, TIMEZONE, "H"),
      );
      const dayKey = formatInTimeZone(
        transaction.created_at,
        TIMEZONE,
        "yyyy-MM-dd",
      );
      const price = Number(transaction.price_sold) || 0;

      hourlyBuckets[hour].categories[category].amount += price;
      hourlyBuckets[hour].categories[category].count += 1;

      const dayBucket = dayMap.get(dayKey) || emptyBucket();
      dayBucket[category].amount += price;
      dayBucket[category].count += 1;
      dayMap.set(dayKey, dayBucket);
    });

    const dayBuckets = Array.from(dayMap.entries()).map(
      ([date, categories]) => {
        const dateObj = new Date(`${date}T00:00:00`);
        return {
          date,
          day: Number(format(dateObj, "d")),
          weekday: dateObj.getDay(),
          categories,
        };
      },
    );

    const totals = emptyBucket();
    transactions.forEach((transaction) => {
      const category = getCategory(transaction);
      if (!category) return;
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
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    const dayRanking = dayBuckets
      .map((bucket) => ({
        date: bucket.date,
        day: bucket.day,
        weekday: WEEKDAY_LABELS[bucket.weekday],
        value: CATEGORIES.reduce(
          (sum, category) =>
            sum + getBucketValue(bucket.categories[category.key], metric),
          0,
        ),
      }))
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
      totalAmount,
      totalCount,
    };
  }, [dateRange, transactions, metric]);

  const metricLabel = metric === "amount" ? "Receita" : "Quantidade";
  const noData = !isLoading && transactions.length === 0;

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

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[720px]">
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
                    por hora e tipo de venda.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto pb-2">
                    <div className="min-w-[760px] space-y-2">
                      <div className="grid grid-cols-[72px_repeat(24,minmax(28px,1fr))] gap-1 text-[10px] text-muted-foreground">
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
                          className="grid grid-cols-[72px_repeat(24,minmax(28px,1fr))] gap-1 items-center"
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
                              {item.weekday},{" "}
                              {format(
                                new Date(`${item.date}T00:00:00`),
                                "dd/MM",
                              )}
                            </span>
                          </div>
                          <span className="font-semibold">
                            {formatMetric(item.value, metric)}
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
