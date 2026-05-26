import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { formatManausDateTime, getManausDate } from "@/lib/dateUtils";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, UserPlus, RefreshCw, Brain, Pencil, HelpCircle, AlertCircle, ArrowUpRight, ArrowDownRight, Wallet, Users, Database } from "lucide-react";
import SubscriptionEditModal from "./SubscriptionEditModal";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useOrganization } from "@/hooks/useOrganization";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SubscriptionScopeBanner, SubscriptionScopeFooter } from "./SubscriptionScopeInfo";
import { toast } from "sonner";

const ACTION_LABELS: Record<string, string> = {
  new: "Nova",
  renew: "Renovação",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  legacy_import: "Migrado",
};

const ACTION_BADGE_CLASS: Record<string, string> = {
  new: "bg-green-500/20 text-green-400 border-green-500/30",
  renew: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  upgrade: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  downgrade: "bg-red-500/20 text-red-400 border-red-500/30",
  legacy_import: "bg-muted text-muted-foreground border-border",
};

const DONUT_COLORS = ["#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

interface Unit { id: string; name: string }

interface IntelTransaction {
  id: string;
  created_at: string;
  subscription_action: string | null;
  downgrade_reason: string | null;
  is_new_client: boolean | null;
  item_name: string;
  client_name: string | null;
  mobile_phone: string | null;
  price_sold: number;
  previous_price: number | null;
  source: string | null;
  subscription_plan_id: string | null;
  plan_name: string | null;
  previous_plan_id: string | null;
  previous_plan_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  barber_name: string | null;
}

interface IntelPayload {
  counts: { new: number; renew: number; upgrade: number; downgrade: number };
  revenue: { new: number; renew: number; upgrade: number; downgrade: number };
  mrr_delta: number;
  mrr_delta_known_count?: number;
  mrr_delta_unknown_count?: number;
  downgrade_reasons: { name: string; value: number }[];
  total_new_clients: number;
  new_subs_to_new: number;
  conversion_rate: number;
  transactions: IntelTransaction[];
}

interface PortfolioPayload {
  mrr_total: number;
  active_subscribers: number;
  legacy_count: number;
  legacy_mrr: number;
  app_acquired_count: number;
  app_acquired_mrr: number;
}

export default function SubscriptionAnalytics() {
  const { organizationId } = useOrganization();
  const [manausNow, setManausNow] = useState(() => getManausDate());
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null);

  // Refresh manausNow if user keeps the page open across month change
  useEffect(() => {
    const id = setInterval(() => setManausNow(getManausDate()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(manausNow.getMonth());
  const [selectedYear, setSelectedYear] = useState(manausNow.getFullYear());
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<"manager" | "all">("all");
  const [units, setUnits] = useState<Unit[]>([]);
  const [data, setData] = useState<IntelPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState<IntelTransaction | null>(null);

  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const years = Array.from({ length: 3 }, (_, i) => manausNow.getFullYear() - 1 + i);

  useEffect(() => {
    if (!organizationId) return;
    supabase.from("units").select("id, name").eq("status", "active").order("name").then(({ data }) => {
      if (data) setUnits(data);
    });
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear, selectedUnit, sourceFilter, organizationId]);

  const fetchData = async () => {
    setLoading(true);
    // Janela Manaus em datas puras YYYY-MM-DD
    const refDate = new Date(selectedYear, selectedMonth, 1);
    const startStr = format(startOfMonth(refDate), "yyyy-MM-dd");
    const endStr = format(endOfMonth(refDate), "yyyy-MM-dd");

    const unitParam = selectedUnit === "all" ? null : selectedUnit;

    const [intel, port] = await Promise.all([
      supabase.rpc("get_subscription_intelligence", {
        p_start_date: startStr,
        p_end_date: endStr,
        p_unit_id: unitParam,
        p_source_filter: sourceFilter === "all" ? null : sourceFilter,
      }),
      supabase.rpc("get_subscription_portfolio_overview", { p_unit_id: unitParam }),
    ]);

    if (intel.error) {
      console.error("Erro ao carregar Inteligência:", intel.error);
      toast.error("Falha ao carregar dados da Inteligência de Assinaturas");
      setData(null);
    } else {
      setData(intel.data as unknown as IntelPayload);
    }

    if (port.error) {
      console.error("Erro ao carregar carteira:", port.error);
      setPortfolio(null);
    } else {
      setPortfolio(port.data as unknown as PortfolioPayload);
    }
    setLoading(false);
  };

  const counts = data?.counts ?? { new: 0, renew: 0, upgrade: 0, downgrade: 0 };
  const revenue = data?.revenue ?? { new: 0, renew: 0, upgrade: 0, downgrade: 0 };
  const downgradeData = data?.downgrade_reasons ?? [];
  const totalNewClients = data?.total_new_clients ?? 0;
  const newSubsToNew = data?.new_subs_to_new ?? 0;
  const conversionRate = data?.conversion_rate ?? 0;
  const mrrDelta = data?.mrr_delta ?? 0;
  const mrrKnown = data?.mrr_delta_known_count ?? 0;
  const mrrUnknown = data?.mrr_delta_unknown_count ?? 0;
  const totalUpDown = counts.upgrade + counts.downgrade;
  const transactions = data?.transactions ?? [];

  const funnelData = useMemo(() => ([
    { name: "Clientes Novos Atendidos", value: totalNewClients },
    { name: "Assinaturas a Novos", value: newSubsToNew },
  ]), [totalNewClients, newSubsToNew]);

  // Sanity check (defesa em profundidade — backend já garante ≤100%)
  const conversionWarning = newSubsToNew > totalNewClients;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
                <Brain className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <CardTitle>Inteligência de Assinaturas</CardTitle>
                <CardDescription>Movimentação da carteira, conversão e Δ MRR — fuso Manaus</CardDescription>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div>
                <Label className="text-[10px] text-muted-foreground">Mês</Label>
                <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
                  <SelectTrigger className="w-24 bg-secondary"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Ano</Label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                  <SelectTrigger className="w-24 bg-secondary"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Unidade</Label>
                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                  <SelectTrigger className="w-40 bg-secondary"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Unidades</SelectItem>
                    {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Origem</Label>
                <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
                  <SelectTrigger className="w-44 bg-secondary"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as origens (padrão)</SelectItem>
                    <SelectItem value="manager">Apenas Gestor (auditoria)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1 max-w-[180px] leading-tight">
                  Lente de auditoria. A base global inclui Gestor + Barbeiro (legado).
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <SubscriptionScopeBanner scope="portfolio" />

      {conversionWarning && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Inconsistência detectada: assinaturas a clientes novos ({newSubsToNew}) maior que oportunidades ({totalNewClients}).
            Verifique flag <code>is_new_client</code> sem celular.
          </AlertDescription>
        </Alert>
      )}

      {mrrUnknown > 0 && totalUpDown > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-xs">
            <strong>{mrrUnknown}</strong> de <strong>{totalUpDown}</strong> upgrades/downgrades estão sem plano anterior registrado e ficaram de fora do Δ MRR.
            Use o botão de editar na tabela abaixo para corrigir, ou confirme se a ação correta não seria "Nova adesão".
          </AlertDescription>
        </Alert>
      )}

      {/* ============ VISÃO GERAL DA CARTEIRA ============ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Visão Geral da Carteira
          </h3>
          <span className="text-[10px] text-muted-foreground">· foto atual (independente do mês)</span>
        </div>
        <TooltipProvider delayDuration={150}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-l-4 border-primary/60 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">MRR Total da Carteira</p>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Sobre MRR Total"><HelpCircle className="w-3 h-3 text-muted-foreground opacity-60" /></button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Soma do preço dos planos de <strong>todos</strong> os assinantes ativos da carteira (legados + adquiridos no app). Ignora filtro de origem.
                      </TooltipContent>
                    </UITooltip>
                  </div>
                  <p className="text-3xl font-bold text-primary">
                    {(portfolio?.mrr_total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">receita recorrente mensal</p>
                </div>
                <Wallet className="w-7 h-7 text-primary opacity-70" />
              </CardContent>
            </Card>

            <Card className="border-l-4 border-blue-500/40">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Assinantes Ativos</p>
                  <p className="text-3xl font-bold">{portfolio?.active_subscribers ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {portfolio && portfolio.active_subscribers > 0 ? (
                      <>App: <strong>{portfolio.app_acquired_count}</strong> · Legado: <strong>{portfolio.legacy_count}</strong></>
                    ) : "sem assinantes cadastrados"}
                  </p>
                </div>
                <Users className="w-7 h-7 text-blue-400 opacity-70" />
              </CardContent>
            </Card>

            <Card className="border-l-4 border-muted-foreground/40 bg-muted/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">Base Legada (Importada)</p>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Sobre base legada"><HelpCircle className="w-3 h-3 text-muted-foreground opacity-60" /></button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Assinantes trazidos via importação CSV (vindos de sistema antigo). Não contam como nova venda nem entram na conversão do mês.
                      </TooltipContent>
                    </UITooltip>
                  </div>
                  <p className="text-2xl font-bold text-muted-foreground">{portfolio?.legacy_count ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {(portfolio?.legacy_mrr ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    {portfolio && portfolio.mrr_total > 0 && (
                      <> · {Math.round((portfolio.legacy_mrr / portfolio.mrr_total) * 100)}% da carteira</>
                    )}
                  </p>
                </div>
                <Database className="w-7 h-7 text-muted-foreground opacity-70" />
              </CardContent>
            </Card>
          </div>
        </TooltipProvider>
      </div>

      {/* ============ PERFORMANCE DO MÊS ============ */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          Performance do Mês
        </h3>
        <span className="text-[10px] text-muted-foreground">· {months[selectedMonth]}/{selectedYear} — não inclui legados</span>
      </div>

      {/* Summary Cards */}
      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Novas Assinaturas" count={counts.new} amount={revenue.new} icon={<UserPlus className="w-5 h-5 text-green-400" />} color="border-green-500/30" tooltip="Toda assinatura com ação='nova' — barbeiros + recepção, clientes novos e da casa. Não inclui importações legadas." />
          <SummaryCard label="Renovações" count={counts.renew} amount={revenue.renew} icon={<RefreshCw className="w-5 h-5 text-blue-400" />} color="border-blue-500/30" tooltip="Assinantes que renovaram o mesmo plano." />
          <SummaryCard label="Upgrades" count={counts.upgrade} amount={revenue.upgrade} icon={<TrendingUp className="w-5 h-5 text-emerald-400" />} color="border-emerald-500/30" tooltip="Migração para plano de maior valor." />
          <SummaryCard label="Downgrades" count={counts.downgrade} amount={revenue.downgrade} icon={<TrendingDown className="w-5 h-5 text-red-400" />} color="border-red-500/30" tooltip="Migração para plano de menor valor." />
        </div>
      </TooltipProvider>

      {/* Δ MRR e Conversão lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={`border-l-4 ${mrrDelta >= 0 ? "border-emerald-500/40" : "border-red-500/40"}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">Δ MRR de Upgrades/Downgrades</p>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Sobre Δ MRR"><HelpCircle className="w-3 h-3 text-muted-foreground opacity-60" /></button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs space-y-1">
                    <p>Soma de (preço novo − preço anterior) para upgrades e downgrades com plano anterior conhecido.</p>
                    <p><strong>Cobertura:</strong> {mrrKnown} de {totalUpDown} movimentações têm plano anterior preenchido. {mrrUnknown > 0 && <span className="text-amber-400">{mrrUnknown} ficaram de fora.</span>}</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <p className={`text-2xl font-bold ${mrrDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {mrrDelta >= 0 ? "+" : ""}{mrrDelta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
              {mrrUnknown > 0 && (
                <p className="text-[10px] text-amber-400 mt-1">{mrrUnknown} sem plano anterior</p>
              )}
            </div>
            {mrrDelta >= 0 ? <ArrowUpRight className="w-6 h-6 text-emerald-400" /> : <ArrowDownRight className="w-6 h-6 text-red-400" />}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-primary/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Conversão (Assin. a novos ÷ Novos atendidos)</p>
              <p className="text-2xl font-bold">{conversionRate}%</p>
              <p className="text-[11px] text-muted-foreground">{newSubsToNew} / {totalNewClients}</p>
            </div>
            <Brain className="w-6 h-6 text-primary" />
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Downgrade Reasons */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Motivos de Downgrade</CardTitle>
          </CardHeader>
          <CardContent>
            {downgradeData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-10">Sem downgrades registrados neste período ✨</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={downgradeData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={4} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    {downgradeData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Funil de Conversão</CardTitle>
              <Badge variant="outline" className="text-lg font-bold">{conversionRate}%</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {totalNewClients === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-10">Sem dados de clientes novos neste período</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="name" type="category" width={160} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 8, 8, 0]} barSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentações Recentes</CardTitle>
          <CardDescription>Limite de 500 linhas mais recentes do período</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Nenhuma movimentação de assinatura neste período</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Δ</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => {
                    const action = t.subscription_action || "new";
                    const delta = (action === "upgrade" || action === "downgrade") && t.previous_price != null
                      ? Number(t.price_sold) - Number(t.previous_price)
                      : null;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs whitespace-nowrap">{formatManausDateTime(t.created_at, "dd/MM HH:mm")}</TableCell>
                        <TableCell className="text-sm">{t.unit_name || "—"}</TableCell>
                        <TableCell className="text-sm">{t.client_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ACTION_BADGE_CLASS[action] || ""}>
                            {ACTION_LABELS[action] || action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {t.previous_plan_name && (
                            <span className="text-xs text-muted-foreground">{t.previous_plan_name} → </span>
                          )}
                          {t.plan_name || t.item_name}
                        </TableCell>
                        <TableCell className="text-xs">
                          {delta != null ? (
                            <span className={delta >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {delta >= 0 ? "+" : ""}{delta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.downgrade_reason || "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTransaction(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SubscriptionScopeFooter />

      <SubscriptionEditModal
        open={!!editingTransaction}
        onOpenChange={(open) => { if (!open) setEditingTransaction(null); }}
        transaction={editingTransaction ? {
          id: editingTransaction.id,
          client_name: editingTransaction.client_name,
          subscription_action: editingTransaction.subscription_action,
          subscription_plan_id: editingTransaction.subscription_plan_id,
          downgrade_reason: editingTransaction.downgrade_reason,
          mobile_phone: editingTransaction.mobile_phone,
          subscription_plans: editingTransaction.plan_name ? { name: editingTransaction.plan_name } : null,
        } : null}
        onSaved={fetchData}
      />
    </div>
  );
}

function SummaryCard({ label, count, amount, icon, color, tooltip }: { label: string; count: number; amount?: number; icon: React.ReactNode; color: string; tooltip?: string }) {
  return (
    <Card className={`border-l-4 ${color}`}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            {tooltip && (
              <UITooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={`Sobre ${label}`}>
                    <HelpCircle className="w-3 h-3 text-muted-foreground opacity-60 hover:opacity-100" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
              </UITooltip>
            )}
          </div>
          <p className="text-2xl font-bold">{count}</p>
          {amount !== undefined && amount > 0 && (
            <p className="text-sm font-semibold text-primary">
              {amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          )}
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}
