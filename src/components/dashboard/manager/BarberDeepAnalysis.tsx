import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { getManausDate } from "@/lib/dateUtils";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  Users,
  Receipt,
  Repeat,
  TrendingDown,
  TrendingUp,
  Sparkles,
  BadgeDollarSign,
  UserCheck,
  Phone,
  ShoppingBag,
  Activity,
} from "lucide-react";

export type DeepAnalysisPeriod = "current_month" | "last_3_months" | "year";

interface Props {
  barberId: string;
  organizationId: string | null;
  period: DeepAnalysisPeriod;
  selectedYear: number;
}

interface ProductionRow {
  id: string;
  date: string;
  barber_id: string;
  tx_basic_total: number | null;
  tx_extra_total: number | null;
  tx_products_total: number | null;
  manual_basic_total: number | null;
  manual_extra_total: number | null;
  manual_products_total: number | null;
  services_basic_total: number | null;
  services_extra_total: number | null;
  products_total: number | null;
  services_total: number | null;
  tx_clients_count: number | null;
  manual_clients_count: number | null;
  clients_count: number | null;
  tx_commission_earned: number | null;
  commission_earned: number | null;
}

interface AggregatedTotals {
  basic: number;
  extra: number;
  products: number;
  total: number;
  clients: number;
  commission: number;
}

interface ServiceTxRow {
  barber_id: string | null;
  created_at: string;
  mobile_phone: string | null;
  daily_production_id: string | null;
  item_type: string | null;
  is_new_client: boolean | null;
  price_sold: number | null;
}

interface ClientMetrics {
  atendimentos: number; // distinct created_at (definição "Ao Vivo")
  servicos: number; // total de linhas item_type='service'
  unicos: number; // telefones distintos
}

interface VitalMetrics {
  uniqueClients: number;
  ticketMedio: number;
  recurringPct: number; // 0-100 (apenas considerando linhas com flag is_new_client preenchida)
  newCount: number;
  returningCount: number;
  subscriptionCount: number;
  subscriptionRevenue: number;
  // médias da casa por barbeiro ativo
  houseUniqueClientsAvg: number;
  houseTicketMedioAvg: number;
  houseSubscriptionCountAvg: number;
  hasItemizedData: boolean;
}

interface PortfolioQuality {
  phoneCoveragePct: number;
  visitsPerClient: number;
  productPenetrationPct: number;
}

type Semaphore = "success" | "warning" | "destructive";

function getSemaphore(
  value: number,
  reference: number,
  thresholds: { greenRatio: number; yellowRatio: number } = { greenRatio: 1.1, yellowRatio: 0.8 }
): Semaphore {
  if (reference <= 0) return value > 0 ? "success" : "warning";
  const ratio = value / reference;
  if (ratio >= thresholds.greenRatio) return "success";
  if (ratio >= thresholds.yellowRatio) return "warning";
  return "destructive";
}

function semaphoreClasses(s: Semaphore) {
  if (s === "success") {
    return {
      border: "border-l-[hsl(var(--success))]",
      text: "text-[hsl(var(--success))]",
      bar: "bg-[hsl(var(--success))]",
      label: "Acima da média",
    };
  }
  if (s === "warning") {
    return {
      border: "border-l-amber-500",
      text: "text-amber-500",
      bar: "bg-amber-500",
      label: "Próximo da média",
    };
  }
  return {
    border: "border-l-destructive",
    text: "text-destructive",
    bar: "bg-destructive",
    label: "Abaixo do esperado",
  };
}

const PAGE_SIZE = 1000;

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function pickWithHierarchy(
  txValue: number | null,
  manualValue: number | null,
  legacyValue: number | null
): number {
  const tx = Number(txValue) || 0;
  const manual = Number(manualValue) || 0;
  const legacy = Number(legacyValue) || 0;
  if (tx > 0) return tx;
  if (manual > 0) return manual;
  return legacy;
}

function aggregateProduction(p: ProductionRow): AggregatedTotals {
  const txTotal =
    (Number(p.tx_basic_total) || 0) +
    (Number(p.tx_extra_total) || 0) +
    (Number(p.tx_products_total) || 0);
  const manualTotal =
    (Number(p.manual_basic_total) || 0) +
    (Number(p.manual_extra_total) || 0) +
    (Number(p.manual_products_total) || 0);

  let basic: number, extra: number, products: number;

  if (txTotal > 0) {
    basic = Number(p.tx_basic_total) || 0;
    extra = Number(p.tx_extra_total) || 0;
    products = Number(p.tx_products_total) || 0;
  } else if (manualTotal > 0) {
    basic = Number(p.manual_basic_total) || 0;
    extra = Number(p.manual_extra_total) || 0;
    products = Number(p.manual_products_total) || 0;
  } else if (
    p.services_basic_total !== null ||
    p.services_extra_total !== null ||
    p.products_total !== null
  ) {
    basic = Number(p.services_basic_total) || 0;
    extra = Number(p.services_extra_total) || 0;
    products = Number(p.products_total) || 0;
  } else {
    // último fallback — não há separação básico/extra
    basic = Number(p.services_total) || 0;
    extra = 0;
    products = Number(p.products_total) || 0;
  }

  const total = basic + extra + products;
  const clients = pickWithHierarchy(p.tx_clients_count, p.manual_clients_count, p.clients_count);
  const commission =
    (Number(p.tx_commission_earned) || 0) > 0
      ? Number(p.tx_commission_earned) || 0
      : Number(p.commission_earned) || 0;

  return { basic, extra, products, total, clients, commission };
}

function getDateRange(period: DeepAnalysisPeriod, selectedYear: number) {
  const now = getManausDate();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "current_month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start, end: today };
  }
  if (period === "last_3_months") {
    const start = new Date(today);
    start.setDate(start.getDate() - 89);
    return { start, end: today };
  }
  // year
  const start = new Date(selectedYear, 0, 1);
  const isCurrentYear = selectedYear === today.getFullYear();
  const end = isCurrentYear ? today : new Date(selectedYear, 11, 31);
  return { start, end };
}

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PERIOD_LABEL: Record<DeepAnalysisPeriod, string> = {
  current_month: "Mês atual",
  last_3_months: "Últimos 3 meses",
  year: "Ano",
};

export default function BarberDeepAnalysis({
  barberId,
  organizationId,
  period,
  selectedYear,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [barberTotals, setBarberTotals] = useState<AggregatedTotals>({
    basic: 0,
    extra: 0,
    products: 0,
    total: 0,
    clients: 0,
    commission: 0,
  });
  const [houseAverages, setHouseAverages] = useState<{
    clients: number;
    products: number;
    extra: number;
    total: number;
  }>({ clients: 0, products: 0, extra: 0, total: 0 });
  const [houseMaxes, setHouseMaxes] = useState<{
    clients: number;
    products: number;
    extra: number;
    total: number;
  }>({ clients: 0, products: 0, extra: 0, total: 0 });
  const [retention, setRetention] = useState<number | null>(null);
  const [clientMetrics, setClientMetrics] = useState<ClientMetrics>({
    atendimentos: 0,
    servicos: 0,
    unicos: 0,
  });
  const [houseClientAvg, setHouseClientAvg] = useState<number>(0);
  const [houseClientMax, setHouseClientMax] = useState<number>(1);
  const [recentDays, setRecentDays] = useState<
    Array<{
      date: string;
      revenue: number;
      clients: number; // atendimentos distintos do dia (sale_transactions)
      servicos: number; // total de serviços vendidos no dia
      commission: number;
      dailyGoal: number;
    }>
  >([]);
  const [vitalMetrics, setVitalMetrics] = useState<VitalMetrics>({
    uniqueClients: 0,
    ticketMedio: 0,
    recurringPct: 0,
    newCount: 0,
    returningCount: 0,
    subscriptionCount: 0,
    subscriptionRevenue: 0,
    houseUniqueClientsAvg: 0,
    houseTicketMedioAvg: 0,
    houseSubscriptionCountAvg: 0,
    hasItemizedData: false,
  });
  const [portfolioQuality, setPortfolioQuality] = useState<PortfolioQuality>({
    phoneCoveragePct: 0,
    visitsPerClient: 0,
    productPenetrationPct: 0,
  });

  const { start, end } = useMemo(
    () => getDateRange(period, selectedYear),
    [period, selectedYear]
  );

  useEffect(() => {
    if (!barberId || !organizationId) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberId, organizationId, period, selectedYear]);

  async function fetchPaginated<T>(
    queryFactory: (from: number, to: number) => any
  ): Promise<T[]> {
    const all: T[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error("[BarberDeepAnalysis] erro paginado:", error);
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as T[]));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return all;
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const startIso = toIsoDate(start);
      const endIso = toIsoDate(end);

      // 1) Produções da organização no período (para barbeiro + média da casa)
      const productions = await fetchPaginated<ProductionRow>((f, t) =>
        supabase
          .from("daily_productions")
          .select(
            `id, date, barber_id,
             tx_basic_total, tx_extra_total, tx_products_total,
             manual_basic_total, manual_extra_total, manual_products_total,
             services_basic_total, services_extra_total, products_total, services_total,
             tx_clients_count, manual_clients_count, clients_count,
             tx_commission_earned, commission_earned`
          )
          .eq("organization_id", organizationId!)
          .gte("date", startIso)
          .lte("date", endIso)
          .range(f, t)
      );

      // Agregação por barbeiro
      const perBarber = new Map<string, AggregatedTotals>();
      for (const p of productions) {
        const agg = aggregateProduction(p);
        const cur = perBarber.get(p.barber_id) ?? {
          basic: 0,
          extra: 0,
          products: 0,
          total: 0,
          clients: 0,
          commission: 0,
        };
        cur.basic += agg.basic;
        cur.extra += agg.extra;
        cur.products += agg.products;
        cur.total += agg.total;
        cur.clients += agg.clients;
        cur.commission += agg.commission;
        perBarber.set(p.barber_id, cur);
      }

      const selected = perBarber.get(barberId) ?? {
        basic: 0,
        extra: 0,
        products: 0,
        total: 0,
        clients: 0,
        commission: 0,
      };
      setBarberTotals(selected);

      // Média e máximo da casa (somente barbeiros com alguma atividade)
      const others = Array.from(perBarber.values()).filter((v) => v.total > 0 || v.clients > 0);
      const count = Math.max(others.length, 1);
      const sum = others.reduce(
        (acc, v) => {
          acc.clients += v.clients;
          acc.products += v.products;
          acc.extra += v.extra;
          acc.total += v.total;
          return acc;
        },
        { clients: 0, products: 0, extra: 0, total: 0 }
      );
      setHouseAverages({
        clients: sum.clients / count,
        products: sum.products / count,
        extra: sum.extra / count,
        total: sum.total / count,
      });
      setHouseMaxes({
        clients: Math.max(selected.clients, ...others.map((v) => v.clients), 1),
        products: Math.max(selected.products, ...others.map((v) => v.products), 1),
        extra: Math.max(selected.extra, ...others.map((v) => v.extra), 1),
        total: Math.max(selected.total, ...others.map((v) => v.total), 1),
      });

      // 2) Buscar TODAS as transações itemizadas da organização no período
      // (uma única query — usada para atendimentos, métricas vitais,
      // qualidade de carteira, retenção e histórico recente)
      const serviceTx = await fetchPaginated<ServiceTxRow>((f, t) =>
        supabase
          .from("sale_transactions")
          .select(
            "barber_id, created_at, mobile_phone, daily_production_id, item_type, is_new_client, price_sold"
          )
          .eq("organization_id", organizationId!)
          .gte("created_at", start.toISOString())
          .lte("created_at", new Date(end.getTime() + 24 * 3600 * 1000 - 1).toISOString())
          .range(f, t)
      );

      // Subconjunto só de serviços (mantém compat com lógicas legadas)
      const serviceOnly = serviceTx.filter((t) => t.item_type === "service");

      // Agregação "clientes" por barbeiro — baseada em SERVIÇOS (manter ticket histórico)
      const perBarberClients = new Map<
        string,
        { atendimentos: Set<string>; servicos: number; phones: Set<string> }
      >();
      for (const t of serviceOnly) {
        if (!t.barber_id) continue;
        const cur =
          perBarberClients.get(t.barber_id) ??
          { atendimentos: new Set<string>(), servicos: 0, phones: new Set<string>() };
        cur.atendimentos.add(t.created_at);
        cur.servicos += 1;
        const phone = (t.mobile_phone || "").replace(/\D/g, "");
        if (phone.length >= 8) cur.phones.add(phone);
        perBarberClients.set(t.barber_id, cur);
      }

      const selectedClients =
        perBarberClients.get(barberId) ??
        { atendimentos: new Set<string>(), servicos: 0, phones: new Set<string>() };

      const selectedAtendimentos = selectedClients.atendimentos.size;
      const selectedServicos = selectedClients.servicos;
      const selectedUnicos = selectedClients.phones.size;

      // Fallback legado: se não houver transações itemizadas, usar clients_count agregado
      const finalAtendimentos =
        selectedAtendimentos > 0 ? selectedAtendimentos : selected.clients;
      const finalServicos = selectedServicos > 0 ? selectedServicos : selected.clients;

      setClientMetrics({
        atendimentos: finalAtendimentos,
        servicos: finalServicos,
        unicos: selectedUnicos,
      });

      // Média/máximo da casa por atendimentos distintos (com fallback p/ clients_count)
      const houseAtendimentosArr: number[] = [];
      const allBarberIds = new Set<string>([
        ...perBarber.keys(),
        ...perBarberClients.keys(),
      ]);
      allBarberIds.forEach((bid) => {
        const fromTx = perBarberClients.get(bid)?.atendimentos.size ?? 0;
        const fromDp = perBarber.get(bid)?.clients ?? 0;
        const v = fromTx > 0 ? fromTx : fromDp;
        if (v > 0) houseAtendimentosArr.push(v);
      });
      const houseAtendimentosAvg =
        houseAtendimentosArr.length > 0
          ? houseAtendimentosArr.reduce((a, b) => a + b, 0) / houseAtendimentosArr.length
          : 0;
      const houseAtendimentosMax = Math.max(
        finalAtendimentos,
        ...houseAtendimentosArr,
        1
      );
      setHouseClientAvg(houseAtendimentosAvg);
      setHouseClientMax(houseAtendimentosMax);

      // 3) Histórico recente: 5 últimos dias com produção
      const barberProductions = productions
        .filter((p) => p.barber_id === barberId)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 5);

      // Pré-computar atendimentos/serviços por dia (a partir de serviceTx)
      const perDayBarber = new Map<
        string,
        { atendimentos: Set<string>; servicos: number }
      >();
      for (const t of serviceOnly) {
        if (t.barber_id !== barberId) continue;
        // chave do dia em America/Manaus (offset -04:00)
        const d = new Date(t.created_at);
        const manaus = new Date(d.getTime() - 4 * 3600 * 1000);
        const dayKey = `${manaus.getUTCFullYear()}-${String(
          manaus.getUTCMonth() + 1
        ).padStart(2, "0")}-${String(manaus.getUTCDate()).padStart(2, "0")}`;
        const cur =
          perDayBarber.get(dayKey) ??
          { atendimentos: new Set<string>(), servicos: 0 };
        cur.atendimentos.add(t.created_at);
        cur.servicos += 1;
        perDayBarber.set(dayKey, cur);
      }

      // Buscar metas do(s) mês(es) envolvidos
      const monthsSet = new Set<string>();
      for (const p of barberProductions) {
        const d = new Date(p.date + "T12:00:00");
        monthsSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
      }
      const goalMap = new Map<string, { target: number; workDays: number }>();
      if (monthsSet.size > 0) {
        const { data: goals } = await supabase
          .from("monthly_goals")
          .select("month, year, target_commission, work_days")
          .eq("barber_id", barberId);
        (goals || []).forEach((g: any) => {
          goalMap.set(`${g.year}-${g.month}`, {
            target: Number(g.target_commission) || 0,
            workDays: Number(g.work_days) || 22,
          });
        });
      }

      setRecentDays(
        barberProductions.map((p) => {
          const agg = aggregateProduction(p);
          const d = new Date(p.date + "T12:00:00");
          const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
          const goal = goalMap.get(key);
          const dailyGoal = goal ? goal.target / Math.max(goal.workDays, 1) : 0;
          const dayMetrics = perDayBarber.get(p.date);
          const atendimentosDia = dayMetrics?.atendimentos.size ?? 0;
          const servicosDia = dayMetrics?.servicos ?? 0;
          return {
            date: p.date,
            revenue: agg.total,
            // fallback legado se o dia não tem transações itemizadas
            clients: atendimentosDia > 0 ? atendimentosDia : agg.clients,
            servicos: servicosDia > 0 ? servicosDia : agg.clients,
            commission: agg.commission,
            dailyGoal,
          };
        })
      );

      // 4) Taxa de Retenção — usa telefones únicos do barbeiro no período
      const phonesPeriod = selectedClients.phones;
      if (phonesPeriod.size === 0) {
        setRetention(null);
      } else {
        // Buscar telefones que esse barbeiro JÁ atendeu antes do período
        const priorTx = await fetchPaginated<{ mobile_phone: string | null }>((f, t) =>
          supabase
            .from("sale_transactions")
            .select("mobile_phone")
            .eq("organization_id", organizationId!)
            .eq("barber_id", barberId)
            .lt("created_at", start.toISOString())
            .not("mobile_phone", "is", null)
            .range(f, t)
        );
        const priorPhones = new Set<string>();
        for (const t of priorTx) {
          const phone = (t.mobile_phone || "").replace(/\D/g, "");
          if (phone.length >= 8) priorPhones.add(phone);
        }
        let recurrentes = 0;
        phonesPeriod.forEach((p) => {
          if (priorPhones.has(p)) recurrentes++;
        });
        setRetention((recurrentes / phonesPeriod.size) * 100);
      }

      // 5) Métricas Vitais + Qualidade de Carteira (toda org → médias da casa)
      type Agg = {
        phones: Set<string>;
        atendimentos: Set<string>; // distinct created_at across all item types
        atendimentosComProduto: Set<string>;
        atendimentosComTelefone: number;
        atendimentosTotal: number; // total de linhas distinct(created_at) (= atendimentos.size)
        newCount: number;
        returningCount: number;
        subscriptionCount: number;
        subscriptionRevenue: number;
        revenue: number; // soma de price_sold
      };
      const newAgg = (): Agg => ({
        phones: new Set(),
        atendimentos: new Set(),
        atendimentosComProduto: new Set(),
        atendimentosComTelefone: 0,
        atendimentosTotal: 0,
        newCount: 0,
        returningCount: 0,
        subscriptionCount: 0,
        subscriptionRevenue: 0,
        revenue: 0,
      });
      const perBarberVitals = new Map<string, Agg>();
      // marcar atendimentos com telefone usando set de created_at
      const phoneByAtend = new Map<string, Map<string, boolean>>();
      // tracking newClient por atendimento (1 vez por created_at, primeira flag truthy "ganha")
      const newFlagByAtend = new Map<string, Map<string, boolean | null>>();

      for (const t of serviceTx) {
        if (!t.barber_id) continue;
        const cur = perBarberVitals.get(t.barber_id) ?? newAgg();
        cur.atendimentos.add(t.created_at);
        const phone = (t.mobile_phone || "").replace(/\D/g, "");
        if (phone.length >= 8) cur.phones.add(phone);
        if (t.item_type === "product") cur.atendimentosComProduto.add(t.created_at);
        if (t.item_type === "subscription") {
          cur.subscriptionCount += 1;
          cur.subscriptionRevenue += Number(t.price_sold) || 0;
        }
        cur.revenue += Number(t.price_sold) || 0;

        // telefone por atendimento (qualquer linha do mesmo created_at com phone marca true)
        let pmap = phoneByAtend.get(t.barber_id);
        if (!pmap) { pmap = new Map(); phoneByAtend.set(t.barber_id, pmap); }
        if (!pmap.get(t.created_at)) pmap.set(t.created_at, phone.length >= 8);

        // is_new_client por atendimento
        let nmap = newFlagByAtend.get(t.barber_id);
        if (!nmap) { nmap = new Map(); newFlagByAtend.set(t.barber_id, nmap); }
        if (!nmap.has(t.created_at)) nmap.set(t.created_at, t.is_new_client);
        else if (nmap.get(t.created_at) == null && t.is_new_client != null) {
          nmap.set(t.created_at, t.is_new_client);
        }

        perBarberVitals.set(t.barber_id, cur);
      }
      // consolidar contagens por atendimento
      perBarberVitals.forEach((agg, bid) => {
        agg.atendimentosTotal = agg.atendimentos.size;
        const pmap = phoneByAtend.get(bid);
        if (pmap) {
          let withPhone = 0;
          pmap.forEach((v) => { if (v) withPhone++; });
          agg.atendimentosComTelefone = withPhone;
        }
        const nmap = newFlagByAtend.get(bid);
        if (nmap) {
          nmap.forEach((v) => {
            if (v === true) agg.newCount++;
            else if (v === false) agg.returningCount++;
          });
        }
      });

      const selfVitals = perBarberVitals.get(barberId) ?? newAgg();
      const othersVitals = Array.from(perBarberVitals.entries())
        .filter(([bid, a]) => bid !== barberId && a.atendimentosTotal > 0)
        .map(([, a]) => a);

      const houseUniqueAvg = othersVitals.length
        ? othersVitals.reduce((s, a) => s + a.phones.size, 0) / othersVitals.length
        : 0;
      const houseTicketAvg = (() => {
        const tickets = othersVitals
          .map((a) => (a.atendimentosTotal > 0 ? a.revenue / a.atendimentosTotal : 0))
          .filter((v) => v > 0);
        return tickets.length ? tickets.reduce((s, v) => s + v, 0) / tickets.length : 0;
      })();
      const houseSubsAvg = othersVitals.length
        ? othersVitals.reduce((s, a) => s + a.subscriptionCount, 0) / othersVitals.length
        : 0;

      const selfTicket =
        selfVitals.atendimentosTotal > 0
          ? selfVitals.revenue / selfVitals.atendimentosTotal
          : 0;
      const newPlusReturn = selfVitals.newCount + selfVitals.returningCount;
      const recurringPct =
        newPlusReturn > 0 ? (selfVitals.returningCount / newPlusReturn) * 100 : 0;

      setVitalMetrics({
        uniqueClients: selfVitals.phones.size,
        ticketMedio: selfTicket,
        recurringPct,
        newCount: selfVitals.newCount,
        returningCount: selfVitals.returningCount,
        subscriptionCount: selfVitals.subscriptionCount,
        subscriptionRevenue: selfVitals.subscriptionRevenue,
        houseUniqueClientsAvg: houseUniqueAvg,
        houseTicketMedioAvg: houseTicketAvg,
        houseSubscriptionCountAvg: houseSubsAvg,
        hasItemizedData: selfVitals.atendimentosTotal > 0,
      });

      setPortfolioQuality({
        phoneCoveragePct:
          selfVitals.atendimentosTotal > 0
            ? (selfVitals.atendimentosComTelefone / selfVitals.atendimentosTotal) * 100
            : 0,
        visitsPerClient:
          selfVitals.phones.size > 0
            ? selfVitals.atendimentosTotal / selfVitals.phones.size
            : 0,
        productPenetrationPct:
          selfVitals.atendimentosTotal > 0
            ? (selfVitals.atendimentosComProduto.size / selfVitals.atendimentosTotal) * 100
            : 0,
      });
    } catch (err) {
      console.error("[BarberDeepAnalysis] erro geral:", err);
    } finally {
      setLoading(false);
    }
  }

  const ticketMedio =
    clientMetrics.atendimentos > 0
      ? barberTotals.total / clientMetrics.atendimentos
      : 0;

  const mixData = [
    { name: "Serviços Básicos", value: barberTotals.basic, color: "hsl(var(--primary))" },
    { name: "Serviços Extras", value: barberTotals.extra, color: "hsl(var(--success))" },
    { name: "Produtos", value: barberTotals.products, color: "hsl(var(--accent))" },
  ].filter((d) => d.value > 0);

  const totalMix = mixData.reduce((s, d) => s + d.value, 0);

  const radarData = [
    {
      eixo: "Clientes",
      Barbeiro:
        houseClientMax > 0 ? (clientMetrics.atendimentos / houseClientMax) * 100 : 0,
      Casa: houseClientMax > 0 ? (houseClientAvg / houseClientMax) * 100 : 0,
      barberRaw: clientMetrics.atendimentos,
      houseRaw: houseClientAvg,
    },
    {
      eixo: "Produtos",
      Barbeiro: houseMaxes.products > 0 ? (barberTotals.products / houseMaxes.products) * 100 : 0,
      Casa: houseMaxes.products > 0 ? (houseAverages.products / houseMaxes.products) * 100 : 0,
      barberRaw: barberTotals.products,
      houseRaw: houseAverages.products,
    },
    {
      eixo: "Extras",
      Barbeiro: houseMaxes.extra > 0 ? (barberTotals.extra / houseMaxes.extra) * 100 : 0,
      Casa: houseMaxes.extra > 0 ? (houseAverages.extra / houseMaxes.extra) * 100 : 0,
      barberRaw: barberTotals.extra,
      houseRaw: houseAverages.extra,
    },
    {
      eixo: "Faturamento",
      Barbeiro: houseMaxes.total > 0 ? (barberTotals.total / houseMaxes.total) * 100 : 0,
      Casa: houseMaxes.total > 0 ? (houseAverages.total / houseMaxes.total) * 100 : 0,
      barberRaw: barberTotals.total,
      houseRaw: houseAverages.total,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ===== Semáforos das Métricas Vitais =====
  const volumeSem = getSemaphore(
    vitalMetrics.uniqueClients,
    vitalMetrics.houseUniqueClientsAvg
  );
  const ticketSem = getSemaphore(
    vitalMetrics.ticketMedio,
    vitalMetrics.houseTicketMedioAvg
  );
  const retentionSem: Semaphore =
    vitalMetrics.recurringPct >= 60
      ? "success"
      : vitalMetrics.recurringPct >= 40
        ? "warning"
        : "destructive";
  const subsSem = getSemaphore(
    vitalMetrics.subscriptionCount,
    vitalMetrics.houseSubscriptionCountAvg,
    { greenRatio: 1, yellowRatio: 0.5 }
  );

  return (
    <div className="space-y-6">
      {/* ===== MÉTRICAS VITAIS ===== */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Métricas Vitais
          </h3>
          {!vitalMetrics.hasItemizedData && (
            <Badge variant="outline" className="text-[10px]">
              sem dados itemizados
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <VitalCard
            icon={<Users className="w-5 h-5" />}
            label="Volume"
            value={vitalMetrics.uniqueClients.toString()}
            subtitle={`Clientes únicos · média casa ${vitalMetrics.houseUniqueClientsAvg.toFixed(0)}`}
            sem={volumeSem}
            progress={Math.min(
              100,
              vitalMetrics.houseUniqueClientsAvg > 0
                ? (vitalMetrics.uniqueClients / (vitalMetrics.houseUniqueClientsAvg * 1.5)) * 100
                : vitalMetrics.uniqueClients > 0
                  ? 100
                  : 0
            )}
          />
          <VitalCard
            icon={<Receipt className="w-5 h-5" />}
            label="Ticket Médio"
            value={formatBRL(vitalMetrics.ticketMedio)}
            subtitle={`Média casa ${formatBRL(vitalMetrics.houseTicketMedioAvg)}`}
            sem={ticketSem}
            progress={Math.min(
              100,
              vitalMetrics.houseTicketMedioAvg > 0
                ? (vitalMetrics.ticketMedio / (vitalMetrics.houseTicketMedioAvg * 1.5)) * 100
                : vitalMetrics.ticketMedio > 0
                  ? 100
                  : 0
            )}
          />
          <VitalCard
            icon={<UserCheck className="w-5 h-5" />}
            label="Recorrência"
            value={`${vitalMetrics.recurringPct.toFixed(0)}%`}
            subtitle={`${vitalMetrics.returningCount} recorrentes · ${vitalMetrics.newCount} novos`}
            sem={retentionSem}
            progress={vitalMetrics.recurringPct}
          />
          <VitalCard
            icon={<BadgeDollarSign className="w-5 h-5" />}
            label="Assinaturas"
            value={vitalMetrics.subscriptionCount.toString()}
            subtitle={
              vitalMetrics.subscriptionRevenue > 0
                ? `${formatBRL(vitalMetrics.subscriptionRevenue)} · média casa ${vitalMetrics.houseSubscriptionCountAvg.toFixed(1)}`
                : `Média casa ${vitalMetrics.houseSubscriptionCountAvg.toFixed(1)}`
            }
            sem={subsSem}
            progress={Math.min(
              100,
              vitalMetrics.houseSubscriptionCountAvg > 0
                ? (vitalMetrics.subscriptionCount / Math.max(vitalMetrics.houseSubscriptionCountAvg * 1.5, 1)) * 100
                : vitalMetrics.subscriptionCount > 0
                  ? 100
                  : 0
            )}
          />
        </div>
      </div>

      {/* ===== QUALIDADE DE CARTEIRA ===== */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Qualidade de Carteira
          </h3>
        </div>
        <Card>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
            <QualityItem
              icon={<Phone className="w-4 h-4" />}
              label="Cobertura de telefone"
              value={`${portfolioQuality.phoneCoveragePct.toFixed(0)}%`}
              progress={portfolioQuality.phoneCoveragePct}
              sem={
                portfolioQuality.phoneCoveragePct >= 80
                  ? "success"
                  : portfolioQuality.phoneCoveragePct >= 50
                    ? "warning"
                    : "destructive"
              }
              hint="Atendimentos com celular cadastrado"
            />
            <QualityItem
              icon={<Repeat className="w-4 h-4" />}
              label="Visitas / cliente"
              value={portfolioQuality.visitsPerClient.toFixed(2)}
              progress={Math.min(100, portfolioQuality.visitsPerClient * 33)}
              sem={
                portfolioQuality.visitsPerClient >= 2
                  ? "success"
                  : portfolioQuality.visitsPerClient >= 1.3
                    ? "warning"
                    : "destructive"
              }
              hint="Frequência média no período"
            />
            <QualityItem
              icon={<ShoppingBag className="w-4 h-4" />}
              label="Penetração de produto"
              value={`${portfolioQuality.productPenetrationPct.toFixed(0)}%`}
              progress={portfolioQuality.productPenetrationPct}
              sem={
                portfolioQuality.productPenetrationPct >= 30
                  ? "success"
                  : portfolioQuality.productPenetrationPct >= 15
                    ? "warning"
                    : "destructive"
              }
              hint="Atendimentos que incluíram produto"
            />
          </CardContent>
        </Card>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Ticket Médio
            </CardDescription>
            <CardTitle className="text-3xl">{formatBRL(ticketMedio)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Receita {formatBRL(barberTotals.total)} ÷ {clientMetrics.atendimentos} atendimentos
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Clientes Atendidos
            </CardDescription>
            <CardTitle className="text-3xl">{clientMetrics.atendimentos}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-0.5">
            <div>{clientMetrics.servicos} serviços vendidos</div>
            <div>{clientMetrics.unicos} clientes únicos (telefone)</div>
            <div className="text-xs opacity-70">Período: {PERIOD_LABEL[period]}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Repeat className="w-4 h-4" />
              Taxa de Retenção
            </CardDescription>
            <CardTitle className="text-3xl">
              {retention === null ? "—" : `${retention.toFixed(1)}%`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Clientes do período já atendidos antes
          </CardContent>
        </Card>
      </div>

      {/* Gráficos lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Mix de Receita</CardTitle>
            <CardDescription>
              Distribuição entre serviços básicos, extras e produtos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mixData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                Sem receita no período.
              </p>
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mixData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry: any) =>
                        `${((entry.value / totalMix) * 100).toFixed(0)}%`
                      }
                    >
                      {mixData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        `${formatBRL(Number(value))} (${((Number(value) / totalMix) * 100).toFixed(1)}%)`,
                        name,
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Radar de Habilidades</CardTitle>
            <CardDescription>
              Barbeiro vs. Média da Casa (escala normalizada 0–100)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="eixo"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  />
                  <Radar
                    name="Barbeiro"
                    dataKey="Barbeiro"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.5}
                  />
                  <Radar
                    name="Média da Casa"
                    dataKey="Casa"
                    stroke="hsl(var(--success))"
                    fill="hsl(var(--success))"
                    fillOpacity={0.15}
                  />
                  <Tooltip
                    formatter={(value: any, name: any, props: any) => {
                      const raw =
                        name === "Barbeiro" ? props.payload.barberRaw : props.payload.houseRaw;
                      const formatted =
                        props.payload.eixo === "Clientes"
                          ? `${Math.round(raw)} clientes`
                          : formatBRL(raw);
                      return [`${Number(value).toFixed(0)} pts (${formatted})`, name];
                    }}
                  />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Histórico Recente */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico Recente</CardTitle>
          <CardDescription>
            Últimos 5 dias trabalhados com humor da produção
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentDays.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum dia trabalhado no período.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Atendimentos</TableHead>
                  <TableHead className="text-right">Serviços</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Meta diária</TableHead>
                  <TableHead className="text-right">Humor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDays.map((day) => {
                  const ratio = day.dailyGoal > 0 ? day.commission / day.dailyGoal : 0;
                  let badge: { label: string; variant: "default" | "secondary" | "destructive"; icon: any } ;
                  if (day.dailyGoal === 0) {
                    badge = { label: "Sem meta", variant: "secondary", icon: null };
                  } else if (ratio >= 1) {
                    badge = { label: "Bateu meta", variant: "default", icon: TrendingUp };
                  } else if (ratio >= 0.7) {
                    badge = { label: "Próximo", variant: "secondary", icon: null };
                  } else {
                    badge = { label: "Abaixo", variant: "destructive", icon: TrendingDown };
                  }
                  const Icon = badge.icon;
                  const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR");
                  return (
                    <TableRow key={day.date}>
                      <TableCell className="font-medium">{dateLabel}</TableCell>
                      <TableCell className="text-right">{formatBRL(day.revenue)}</TableCell>
                      <TableCell className="text-right">{day.clients}</TableCell>
                      <TableCell className="text-right">{day.servicos}</TableCell>
                      <TableCell className="text-right">{formatBRL(day.commission)}</TableCell>
                      <TableCell className="text-right">
                        {day.dailyGoal > 0 ? formatBRL(day.dailyGoal) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={badge.variant} className="gap-1">
                          {Icon ? <Icon className="w-3 h-3" /> : null}
                          {badge.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VitalCard({
  icon,
  label,
  value,
  subtitle,
  sem,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  sem: Semaphore;
  progress: number;
}) {
  const cls = semaphoreClasses(sem);
  return (
    <Card className={`border-l-4 ${cls.border}`}>
      <CardContent className="pt-4 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
            <span className={cls.text}>{icon}</span>
            {label}
          </div>
          <Badge variant="outline" className={`text-[10px] ${cls.text} border-current`}>
            {cls.label}
          </Badge>
        </div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        <Progress value={Math.max(0, Math.min(100, progress))} className="h-1.5">
          <div className={`h-full ${cls.bar} transition-all`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </Progress>
      </CardContent>
    </Card>
  );
}

function QualityItem({
  icon,
  label,
  value,
  progress,
  sem,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress: number;
  sem: Semaphore;
  hint?: string;
}) {
  const cls = semaphoreClasses(sem);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cls.text}>{icon}</span>
          {label}
        </div>
        <span className={`text-sm font-bold ${cls.text}`}>{value}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full ${cls.bar} transition-all`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
      </div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
