import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { getManausDate } from "@/lib/dateUtils";
import { isNewSubscription, isValidOpportunity } from "@/lib/metricsRules";
import { normalizePhoneForMetrics } from "@/lib/normalizers";
import { useOrganization } from "@/hooks/useOrganization";
import { Crown, Users, Target, Loader2, Star, AlertTriangle, Trophy, HelpCircle, UserPlus, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPhone } from "@/lib/phoneUtils";
import { SubscriptionScopeBanner, SubscriptionScopeFooter } from "./SubscriptionScopeInfo";
import SubscriptionWizardModal from "./SubscriptionWizardModal";

interface UnitOption { id: string; name: string; }
interface DataHealth {
  totalInPeriod: number;
  txSemUnidade: number;
  novoSemTelefone: number;
  novaAdesaoSemTelefone: number;
  novaAdesaoSemIsNewClient: number;
}

interface BarberClientDrilldown {
  barberId: string;
  barberName: string;
  unitName: string;
  opportunities: Array<{ phone: string; name: string; converted: boolean; attendances: number }>;
}

interface BarberPerformance {
  barberId: string;
  barberName: string;
  unitName: string;
  opportunities: number;          // pessoas únicas com is_new_client=true
  rawNewAttendances: number;      // total de lançamentos marcados como cliente novo (sem deduplicação por celular)
  newClientAdhesions: number;     // assinaturas action='new' AND is_new_client=true
  totalAdhesions: number;         // assinaturas action='new' (qualquer cliente)
  strictConversion: number;       // newClientAdhesions / opportunities
  penetration: number;            // totalAdhesions / opportunities
  isReception?: boolean;
}

export default function SubscriptionPerformanceReport() {
  const manausNow = useMemo(() => getManausDate(), []);
  const { organizationId } = useOrganization();
  const [selectedMonth, setSelectedMonth] = useState(manausNow.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(manausNow.getFullYear());
  const [loading, setLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState<BarberPerformance[]>([]);
  const [receptionRow, setReceptionRow] = useState<BarberPerformance | null>(null);
  // Total geral DEDUPLICADO entre barbeiros (Set global)
  const [globalOpportunities, setGlobalOpportunities] = useState(0);
  const [globalNewClientAdhesions, setGlobalNewClientAdhesions] = useState(0);
  const [globalTotalAdhesions, setGlobalTotalAdhesions] = useState(0);
  // Filtro de unidade + saúde dos dados
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("all"); // "all" | "no_unit" | uuid
  const [dataHealth, setDataHealth] = useState<DataHealth>({
    totalInPeriod: 0,
    txSemUnidade: 0,
    novoSemTelefone: 0,
    novaAdesaoSemTelefone: 0,
    novaAdesaoSemIsNewClient: 0,
  });
  const [healthOpen, setHealthOpen] = useState(false);
  const [clientDrilldown, setClientDrilldown] = useState<Map<string, BarberClientDrilldown>>(new Map());
  const [selectedDrilldownBarberId, setSelectedDrilldownBarberId] = useState<string | null>(null);
  const [regularizationWizardOpen, setRegularizationWizardOpen] = useState(false);
  const [regularizationPrefill, setRegularizationPrefill] = useState<{
    phone: string;
    name: string;
    barberId: string;
  } | null>(null);

  const months = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
  ];

  const years = Array.from({ length: 3 }, (_, i) => getManausDate().getFullYear() - 1 + i);

  // Carrega lista de unidades para o filtro
  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const { data } = await supabase
        .from("units")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("name");
      if (data) setUnits(data);
    })();
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) fetchPerformanceData();
  }, [selectedMonth, selectedYear, organizationId, selectedUnitId]);

  const fetchPerformanceData = async () => {
    if (!organizationId) return;
    setLoading(true);

    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split("T")[0];

    // Filtros com timezone Manaus (UTC-4) explícito para evitar bordas erradas
    const startISO = `${startDate}T00:00:00-04:00`;
    const endISO = `${endDate}T23:59:59-04:00`;

    try {
      // TODO(metrics-ssot): centralizar regra de "oportunidade de conversão" em hook/util único
      // para evitar divergência entre relatórios (SubscriptionPerformance, UnitsComparison, etc).
      // Regra atual: is_new_client=true + mobile_phone válido no período, com deduplicação por celular.
      // Transações de barbeiros (filtra unit_id direto na tabela após backfill)
      let txQuery = supabase
        .from("sale_transactions")
        .select(`
          barber_id,
          unit_id,
          is_new_client,
          item_type,
          subscription_action,
          mobile_phone,
          client_name,
          barbers!sale_transactions_barber_id_fkey(name, units(name))
        `)
        .eq("organization_id", organizationId)
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .not("barber_id", "is", null);

      if (selectedUnitId === "no_unit") {
        txQuery = txQuery.is("unit_id", null);
      } else if (selectedUnitId !== "all") {
        txQuery = txQuery.eq("unit_id", selectedUnitId);
      }

      const { data: transactions, error: txError } = await txQuery;
      if (txError) throw txError;

      // Transações da recepção (sem barber_id)
      let recQuery = supabase
        .from("sale_transactions")
        .select("unit_id, is_new_client, item_type, subscription_action, mobile_phone")
        .eq("organization_id", organizationId)
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .is("barber_id", null);

      if (selectedUnitId === "no_unit") {
        recQuery = recQuery.is("unit_id", null);
      } else if (selectedUnitId !== "all") {
        recQuery = recQuery.eq("unit_id", selectedUnitId);
      }

      const { data: receptionTx, error: recError } = await recQuery;
      if (recError) throw recError;

      // Agrupar por barbeiro
      const barberMap = new Map<string, {
        name: string;
        unit: string;
        opportunityPhones: Set<string>;
        convertedPhones: Set<string>;
        regularizedPhones: Set<string>;
        newClientAdhesions: number;
        totalAdhesions: number;
        rawNewAttendances: number;
      }>();

      // Sets globais para deduplicar a visão organizacional
      const globalOpportunityPhones = new Set<string>();
      const globalRegularizedPhones = new Set<string>();
      let globalNewClientAdh = 0;
      let globalTotalAdh = 0;

      transactions?.forEach((tx) => {
        if (!tx.barber_id) return;

        const existing = barberMap.get(tx.barber_id) || {
          name: (tx.barbers as any)?.name || "Desconhecido",
          unit: (tx.barbers as any)?.units?.name || "Sem unidade",
          opportunityPhones: new Set<string>(),
          convertedPhones: new Set<string>(),
          regularizedPhones: new Set<string>(),
          newClientAdhesions: 0,
          totalAdhesions: 0,
          rawNewAttendances: 0,
        };

        const normalizedPhone = normalizePhoneForMetrics(tx.mobile_phone);
        if (tx.is_new_client === true) {
          existing.rawNewAttendances++;
        }

        if (isValidOpportunity(tx) && normalizedPhone) {
          existing.opportunityPhones.add(normalizedPhone);
          globalOpportunityPhones.add(normalizedPhone);
        }

        if (isNewSubscription(tx)) {
          existing.totalAdhesions++;
          globalTotalAdh++;
          if (tx.is_new_client === true) {
            existing.newClientAdhesions++;
            if (normalizedPhone) existing.convertedPhones.add(normalizedPhone);
            globalNewClientAdh++;
          }
        }
        if (
          tx.item_type === "subscription" &&
          tx.subscription_action === "legacy_import" &&
          normalizedPhone
        ) {
          existing.regularizedPhones.add(normalizedPhone);
          globalRegularizedPhones.add(normalizedPhone);
        }

        barberMap.set(tx.barber_id, existing);
      });

      const performance: BarberPerformance[] = Array.from(barberMap.entries()).map(
        ([barberId, data]) => {
          const opp = data.opportunityPhones.size;
          return {
            barberId,
            barberName: data.name,
            unitName: data.unit,
            opportunities: opp,
            rawNewAttendances: data.rawNewAttendances,
            newClientAdhesions: data.newClientAdhesions,
            totalAdhesions: data.totalAdhesions,
            strictConversion: opp > 0 ? (data.newClientAdhesions / opp) * 100 : 0,
            penetration: opp > 0 ? (data.totalAdhesions / opp) * 100 : 0,
          };
        }
      );

      // Ordena por conversão estrita desc, com penetração como desempate
      performance.sort((a, b) =>
        b.strictConversion - a.strictConversion || b.penetration - a.penetration
      );
      setPerformanceData(performance);

      // Recepção
      const receptionPhones = new Set<string>();
      let receptionNewClientAdh = 0;
      let receptionTotalAdh = 0;

      receptionTx?.forEach((tx) => {
        const normalizedPhone = normalizePhoneForMetrics(tx.mobile_phone);
        if (
          tx.item_type === "subscription" &&
          tx.subscription_action === "legacy_import" &&
          normalizedPhone
        ) {
          globalRegularizedPhones.add(normalizedPhone);
        }
        if (isValidOpportunity(tx) && normalizedPhone) {
          receptionPhones.add(normalizedPhone);
          globalOpportunityPhones.add(normalizedPhone);
        }
        if (isNewSubscription(tx)) {
          receptionTotalAdh++;
          globalTotalAdh++;
          if (tx.is_new_client === true) {
            receptionNewClientAdh++;
            globalNewClientAdh++;
          }
        }
      });

      const drilldownMap = new Map<string, BarberClientDrilldown>();
      for (const [barberId, data] of barberMap.entries()) {
        const phoneNameMap = new Map<string, string>();
        const attendanceCountMap = new Map<string, number>();
        (transactions || []).forEach((tx) => {
          const normalizedPhone = normalizePhoneForMetrics(tx.mobile_phone);
          if (tx.barber_id !== barberId || !normalizedPhone) return;
          const safeName = ((tx as any).client_name || "").trim();
          if (safeName && !phoneNameMap.has(normalizedPhone)) phoneNameMap.set(normalizedPhone, safeName);
          if (tx.is_new_client === true) attendanceCountMap.set(normalizedPhone, (attendanceCountMap.get(normalizedPhone) || 0) + 1);
        });

        const opportunities = Array.from(data.opportunityPhones)
          .sort()
          .map((phone) => ({
            phone,
            name: phoneNameMap.get(phone) || "Cliente sem nome",
            converted:
              data.convertedPhones.has(phone) ||
              data.regularizedPhones.has(phone) ||
              globalRegularizedPhones.has(phone),
            attendances: attendanceCountMap.get(phone) || 1,
          }));
        drilldownMap.set(barberId, {
          barberId,
          barberName: data.name,
          unitName: data.unit,
          opportunities,
        });
      }
      setClientDrilldown(drilldownMap);

      if (receptionPhones.size > 0 || receptionTotalAdh > 0) {
        const opp = receptionPhones.size;
        setReceptionRow({
          barberId: "__reception__",
          barberName: "Recepção",
          unitName: "Sem barbeiro atribuído",
          opportunities: opp,
          newClientAdhesions: receptionNewClientAdh,
          totalAdhesions: receptionTotalAdh,
          strictConversion: opp > 0 ? (receptionNewClientAdh / opp) * 100 : 0,
          penetration: opp > 0 ? (receptionTotalAdh / opp) * 100 : 0,
          isReception: true,
        });
      } else {
        setReceptionRow(null);
      }

      setGlobalOpportunities(globalOpportunityPhones.size);
      setGlobalNewClientAdhesions(globalNewClientAdh);
      setGlobalTotalAdhesions(globalTotalAdh);

      // Saúde dos dados — calculado a partir do mesmo conjunto exibido
      const allTx = [
        ...(transactions ?? []).map((t: any) => ({ ...t, _hasBarber: true })),
        ...(receptionTx ?? []).map((t: any) => ({ ...t, _hasBarber: false })),
      ];
      const health: DataHealth = {
        totalInPeriod: allTx.length,
        txSemUnidade: allTx.filter((t) => !t.unit_id).length,
        novoSemTelefone: allTx.filter(
          (t) => t.is_new_client === true && !normalizePhoneForMetrics(t.mobile_phone || null)
        ).length,
        novaAdesaoSemTelefone: allTx.filter(
          (t) =>
            isNewSubscription(t) &&
            (!t.mobile_phone || t.mobile_phone === "")
        ).length,
        novaAdesaoSemIsNewClient: allTx.filter(
          (t) =>
            isNewSubscription(t) &&
            t.is_new_client !== true
        ).length,
      };
      setDataHealth(health);
    } catch (error) {
      console.error("Erro ao buscar dados de performance:", error);
    } finally {
      setLoading(false);
    }
  };

  // Badge para Conversão estrita (≤100%)
  const getStrictBadge = (rate: number, opportunities: number, sales: number) => {
    if (opportunities === 0) {
      if (sales > 0) {
        return (
          <Badge variant="destructive" className="text-xs gap-1 font-medium">
            <AlertTriangle className="w-3 h-3" />
            <span>Sem oport. ({sales} vendas)</span>
          </Badge>
        );
      }
      return (
        <Badge variant="secondary" className="text-xs gap-1">
          <span>N/A</span>
        </Badge>
      );
    }

    if (rate >= 30) {
      return (
        <Badge className="bg-success text-white text-xs gap-1 font-semibold">
          <Trophy className="w-3 h-3" />
          <span>Elite ({rate.toFixed(0)}%)</span>
        </Badge>
      );
    }
    if (rate >= 10) {
      return (
        <Badge className="bg-warning text-warning-foreground text-xs gap-1 font-medium">
          <Star className="w-3 h-3" />
          <span>Na Média ({rate.toFixed(0)}%)</span>
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="text-xs gap-1 font-medium">
        <AlertTriangle className="w-3 h-3" />
        <span>Baixo ({rate.toFixed(0)}%)</span>
      </Badge>
    );
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const isCriticalCase = (opportunities: number, sales: number) =>
    opportunities >= 5 && sales === 0;

  const overallStrict = globalOpportunities > 0
    ? (globalNewClientAdhesions / globalOpportunities) * 100
    : 0;
  const overallPenetration = globalOpportunities > 0
    ? (globalTotalAdhesions / globalOpportunities) * 100
    : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Relatório de Conversão de Assinaturas</CardTitle>
              <CardDescription>
                Conversão Estrita (cliente novo → assinou) e Penetração (todas adesões ÷ oportunidades)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SubscriptionScopeBanner scope="conversion" />

          {/* Filters */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Mês</label>
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>{month.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Ano</label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 lg:col-span-1">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Unidade</label>
              <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as unidades</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                  <SelectItem value="no_unit">⚠️ Sem unidade (legado)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Saúde dos dados — colapsável e discreto */}
          {(() => {
            const totalIssues =
              dataHealth.txSemUnidade +
              dataHealth.novoSemTelefone +
              dataHealth.novaAdesaoSemTelefone +
              dataHealth.novaAdesaoSemIsNewClient;
            const hasIssues = totalIssues > 0;
            return (
              <div className="mb-6">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setHealthOpen((o) => !o)}
                  className="w-full justify-between text-xs h-auto py-2 px-3 border border-border/50 bg-muted/30 hover:bg-muted/60"
                >
                  <span className="flex items-center gap-2">
                    {hasIssues ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                        <span className="font-medium">
                          Saúde dos dados — {totalIssues} {totalIssues === 1 ? "ponto de atenção" : "pontos de atenção"}
                        </span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-success" />
                        <span className="font-medium">Saúde dos dados — tudo certo no período</span>
                      </>
                    )}
                  </span>
                  {healthOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
                {healthOpen && (
                  <div className="mt-2 rounded-md border border-border/50 bg-muted/20 p-3 space-y-2 text-xs">
                    <p className="text-muted-foreground">
                      Transações analisadas no período/filtro: <strong>{dataHealth.totalInPeriod}</strong>.
                      Os itens abaixo não entram nos cálculos de Conversão/Penetração e indicam dados faltantes na origem.
                      Também não entram neste relatório os lançamentos manuais de regularização (fora do Ao Vivo).
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-center justify-between bg-background/60 rounded px-2 py-1.5">
                        <span>Sem unidade vinculada</span>
                        <Badge variant={dataHealth.txSemUnidade > 0 ? "destructive" : "secondary"} className="text-[10px]">
                          {dataHealth.txSemUnidade}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between bg-background/60 rounded px-2 py-1.5">
                        <span>Cliente novo sem telefone</span>
                        <Badge variant={dataHealth.novoSemTelefone > 0 ? "destructive" : "secondary"} className="text-[10px]">
                          {dataHealth.novoSemTelefone}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between bg-background/60 rounded px-2 py-1.5">
                        <span>Nova adesão sem telefone</span>
                        <Badge variant={dataHealth.novaAdesaoSemTelefone > 0 ? "destructive" : "secondary"} className="text-[10px]">
                          {dataHealth.novaAdesaoSemTelefone}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between bg-background/60 rounded px-2 py-1.5">
                        <span>Nova adesão sem marcar "cliente novo"</span>
                        <Badge variant={dataHealth.novaAdesaoSemIsNewClient > 0 ? "destructive" : "secondary"} className="text-[10px]">
                          {dataHealth.novaAdesaoSemIsNewClient}
                        </Badge>
                      </div>
                    </div>
                    {hasIssues && (
                      <p className="text-muted-foreground italic pt-1">
                        Novos lançamentos já são bloqueados na origem. Os números acima representam
                        registros antigos (legado) que ainda precisam ser corrigidos manualmente.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Summary Cards (4) */}
          <TooltipProvider delayDuration={150}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Users className="w-4 h-4" />
                    <span className="text-xs">🎯 Oportunidades</span>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Sobre Oportunidades">
                          <HelpCircle className="w-3 h-3 opacity-60 hover:opacity-100" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Pessoas únicas (por celular) marcadas como "cliente novo" no período. Total
                        deduplicado: a mesma pessoa atendida por dois barbeiros conta uma única vez.
                      </TooltipContent>
                    </UITooltip>
                  </div>
                  <p className="text-2xl font-bold">{globalOpportunities}</p>
                  <p className="text-xs text-muted-foreground">Clientes Novos únicos</p>
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <UserPlus className="w-4 h-4" />
                    <span className="text-xs">👤 Ades. Cliente Novo</span>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Sobre Adesões de Cliente Novo">
                          <HelpCircle className="w-3 h-3 opacity-60 hover:opacity-100" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Assinaturas com ação = "nova" feitas para clientes marcados como novos,
                        registradas no período selecionado, independentemente da origem do lançamento.
                      </TooltipContent>
                    </UITooltip>
                  </div>
                  <p className="text-2xl font-bold">{globalNewClientAdhesions}</p>
                  <p className="text-xs text-muted-foreground">Novo cliente que assinou</p>
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Crown className="w-4 h-4" />
                    <span className="text-xs">👑 Ades. Totais</span>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Sobre Adesões Totais">
                          <HelpCircle className="w-3 h-3 opacity-60 hover:opacity-100" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Toda assinatura com ação = "nova" no mês (barbeiros + recepção), independentemente da origem do lançamento.
                      </TooltipContent>
                    </UITooltip>
                  </div>
                  <p className="text-2xl font-bold">{globalTotalAdhesions}</p>
                  <p className="text-xs text-muted-foreground">Toda nova adesão</p>
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Target className="w-4 h-4" />
                    <span className="text-xs">📉 Conv. / Penetração</span>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Sobre Conversão e Penetração">
                          <HelpCircle className="w-3 h-3 opacity-60 hover:opacity-100" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        <strong>Conversão Estrita</strong>: Ades. Cliente Novo ÷ Oportunidades. Mede
                        quantos novos viraram assinantes (sempre ≤100%).<br />
                        <strong>Penetração</strong>: Ades. Totais ÷ Oportunidades. Pode passar de
                        100% se vender muito para clientes da casa.
                      </TooltipContent>
                    </UITooltip>
                  </div>
                  <p className="text-2xl font-bold">
                    <span className="text-success">{overallStrict.toFixed(1)}%</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-primary">{overallPenetration.toFixed(1)}%</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Estrita / Penetração</p>
                </CardContent>
              </Card>
            </div>
          </TooltipProvider>

          {/* Performance Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : performanceData.length === 0 && !receptionRow ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Nenhum dado encontrado</p>
              <p className="text-sm">Selecione outro período ou registre atendimentos com clientes novos</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Barbeiro</TableHead>
                    <TableHead className="text-center">🎯 Oport.</TableHead>
                    <TableHead className="text-center">👤 Ades. Cliente Novo</TableHead>
                    <TableHead className="text-center">👑 Ades. Totais</TableHead>
                    <TableHead className="text-center">📉 Conv. Estrita</TableHead>
                    <TableHead className="text-center">📈 Penetração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceData.map((b) => (
                    <TableRow
                      key={b.barberId}
                      className={`cursor-pointer hover:bg-primary/5 ${isCriticalCase(b.opportunities, b.totalAdhesions) ? "bg-destructive/10" : ""}`}
                      onClick={() => setSelectedDrilldownBarberId(b.barberId)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border-2 border-primary/20">
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {getInitials(b.barberName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="font-medium underline underline-offset-2 decoration-dotted">{b.barberName}</span>
                            <p className="text-xs text-muted-foreground">{b.unitName}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-semibold text-lg ${
                          isCriticalCase(b.opportunities, b.totalAdhesions) ? "text-destructive" : ""
                        }`}>
                          {b.opportunities}
                          <span className="block text-[11px] text-muted-foreground">{b.rawNewAttendances} lanç.</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold text-lg">{b.newClientAdhesions}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold text-lg">{b.totalAdhesions}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {getStrictBadge(b.strictConversion, b.opportunities, b.totalAdhesions)}
                      </TableCell>
                      <TableCell className="text-center">
                        {b.opportunities > 0 ? (
                          <span className={`font-semibold ${b.penetration > 100 ? "text-primary" : ""}`}>
                            {b.penetration.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {receptionRow && (
                    <TableRow key="reception" className="bg-muted/30 border-t-2">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border-2 border-primary/20">
                            <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold">
                              RC
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{receptionRow.barberName}</p>
                            <p className="text-xs text-muted-foreground">{receptionRow.unitName}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold text-lg">{receptionRow.opportunities}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold text-lg">{receptionRow.newClientAdhesions}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold text-lg">{receptionRow.totalAdhesions}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {getStrictBadge(receptionRow.strictConversion, receptionRow.opportunities, receptionRow.totalAdhesions)}
                      </TableCell>
                      <TableCell className="text-center">
                        {receptionRow.opportunities > 0 ? (
                          <span className={`font-semibold ${receptionRow.penetration > 100 ? "text-primary" : ""}`}>
                            {receptionRow.penetration.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}


                    <Dialog open={!!selectedDrilldownBarberId} onOpenChange={(open) => !open && setSelectedDrilldownBarberId(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  Análise de clientes atendidos — {selectedDrilldownBarberId ? clientDrilldown.get(selectedDrilldownBarberId)?.barberName : ""}
                </DialogTitle>
                <DialogDescription>
                  Clientes novos atendidos no período selecionado para auditoria de conversão em assinatura.
                </DialogDescription>
              </DialogHeader>
              {selectedDrilldownBarberId && clientDrilldown.get(selectedDrilldownBarberId) && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Total de oportunidades únicas (celular): <strong>{clientDrilldown.get(selectedDrilldownBarberId)?.opportunities.length || 0}</strong>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                    {clientDrilldown.get(selectedDrilldownBarberId)?.opportunities.map((op) => (
                      <div key={op.phone} className="flex items-center justify-between rounded border px-3 py-2 bg-background/60">
                        <div>
                          <p className="text-sm font-medium">{op.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{formatPhone(op.phone)} • {op.attendances} lançamento(s) como novo</p>
                        </div>
                        {op.converted ? <Badge className="bg-success text-white">Virou assinante</Badge> : (
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive">Não converteu</Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRegularizationPrefill({
                                  phone: op.phone,
                                  name: op.name,
                                  barberId: selectedDrilldownBarberId,
                                });
                                setRegularizationWizardOpen(true);
                              }}
                            >
                              Dar baixa legado
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Conv. Estrita:</span>
            <div className="flex items-center gap-1">
              <Badge className="bg-success text-white text-xs gap-1">
                <Trophy className="w-3 h-3" />
                Elite
              </Badge>
              <span>&gt; 30%</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge className="bg-warning text-warning-foreground text-xs gap-1">
                <Star className="w-3 h-3" />
                Na Média
              </Badge>
              <span>10-29%</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="w-3 h-3" />
                Baixo
              </Badge>
              <span>&lt; 10%</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="w-3 h-3" />
                Sem oport.
              </Badge>
              <span>vendeu sem registrar cliente novo</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <SubscriptionWizardModal
        open={regularizationWizardOpen}
        onOpenChange={(o) => {
          setRegularizationWizardOpen(o);
          if (!o) setRegularizationPrefill(null);
        }}
        organizationId={organizationId || ""}
        onComplete={fetchPerformanceData}
        prefillPhone={regularizationPrefill?.phone}
        prefillName={regularizationPrefill?.name}
        prefillAction="legacy_import"
        prefillIsNewClient={false}
        prefillAttributionType="barber"
        prefillBarberId={regularizationPrefill?.barberId}
        startStep="attribution"
      />

      <SubscriptionScopeFooter />
    </div>
  );
}
