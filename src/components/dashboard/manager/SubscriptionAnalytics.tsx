import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getManausDate } from "@/lib/dateUtils";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, UserPlus, RefreshCw, Brain, Pencil, HelpCircle } from "lucide-react";
import SubscriptionEditModal from "./SubscriptionEditModal";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useOrganization } from "@/hooks/useOrganization";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SubscriptionScopeBanner, SubscriptionScopeFooter } from "./SubscriptionScopeInfo";

const ACTION_COLORS: Record<string, string> = {
  new: "#22c55e",
  renew: "#3b82f6",
  upgrade: "#10b981",
  downgrade: "#ef4444",
};

const ACTION_LABELS: Record<string, string> = {
  new: "Nova",
  renew: "Renovação",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
};

const ACTION_BADGE_CLASS: Record<string, string> = {
  new: "bg-green-500/20 text-green-400 border-green-500/30",
  renew: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  upgrade: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  downgrade: "bg-red-500/20 text-red-400 border-red-500/30",
};

const DONUT_COLORS = ["#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

interface SubscriptionTransaction {
  id: string;
  created_at: string;
  subscription_action: string | null;
  downgrade_reason: string | null;
  is_new_client: boolean | null;
  item_name: string;
  client_name: string | null;
  mobile_phone: string | null;
  price_sold: number;
  barbers: { name: string } | null;
  subscription_plans: { name: string } | null;
  subscription_plan_id: string | null;
  units: { name: string } | null;
}

export default function SubscriptionAnalytics() {
  const { organizationId } = useOrganization();
  const manausNow = useMemo(() => getManausDate(), []);
  const [selectedMonth, setSelectedMonth] = useState(manausNow.getMonth());
  const [selectedYear, setSelectedYear] = useState(manausNow.getFullYear());
  const [transactions, setTransactions] = useState<SubscriptionTransaction[]>([]);
  const [totalNewClients, setTotalNewClients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState<SubscriptionTransaction | null>(null);

  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const years = Array.from({ length: 3 }, (_, i) => manausNow.getFullYear() - 1 + i);

  useEffect(() => {
    if (!organizationId) return;
    fetchData();
  }, [selectedMonth, selectedYear, organizationId]);

  const fetchData = async () => {
    if (!organizationId) return;
    setLoading(true);
    const refDate = new Date(selectedYear, selectedMonth, 1);
    const start = startOfMonth(refDate).toISOString();
    const end = endOfMonth(refDate).toISOString();

    const [subRes, newClientsRes] = await Promise.all([
      supabase
        .from("sale_transactions")
        .select("id, created_at, subscription_action, downgrade_reason, is_new_client, item_name, client_name, mobile_phone, price_sold, subscription_plan_id, barbers(name), subscription_plans(name), units(name)")
        .eq("organization_id", organizationId)
        .eq("item_type", "subscription")
        .eq("source", "manager") // Single source of truth: only manager-recorded subscriptions
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false }),
      // Count UNIQUE new clients by phone (not by transaction count).
      // A single new client buying haircut + product + subscription would inflate
      // the denominator if we counted rows. Transactions without mobile_phone are
      // dropped from this count since we cannot distinguish unique customers.
      supabase
        .from("sale_transactions")
        .select("mobile_phone")
        .eq("organization_id", organizationId)
        .eq("is_new_client", true)
        .eq("source", "manager")
        .gte("created_at", start)
        .lte("created_at", end),
    ]);

    if (!subRes.error) setTransactions((subRes.data as unknown as SubscriptionTransaction[]) || []);
    const uniquePhones = new Set(
      (newClientsRes.data || [])
        .map((r: any) => r.mobile_phone)
        .filter(Boolean)
    );
    setTotalNewClients(uniquePhones.size);
    setLoading(false);
  };

  // Metrics
  const { counts, revenue } = useMemo(() => {
    const c = { new: 0, renew: 0, upgrade: 0, downgrade: 0 };
    const r = { new: 0, renew: 0, upgrade: 0, downgrade: 0 };
    transactions.forEach((t) => {
      const action = t.subscription_action as keyof typeof c;
      if (action && action in c) {
        c[action]++;
        r[action] += Number(t.price_sold) || 0;
      }
    });
    return { counts: c, revenue: r };
  }, [transactions]);

  // Downgrade reasons
  const downgradeData = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((t) => {
      if (t.subscription_action === "downgrade" && t.downgrade_reason) {
        map[t.downgrade_reason] = (map[t.downgrade_reason] || 0) + 1;
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  // Funnel
  const funnelData = useMemo(() => {
    const newSubs = transactions.filter((t) => t.subscription_action === "new" && t.is_new_client).length;
    return [
      { name: "Clientes Novos Atendidos", value: totalNewClients },
      { name: "Assinaturas Vendidas", value: newSubs },
    ];
  }, [transactions, totalNewClients]);

  const conversionRate = totalNewClients > 0
    ? ((funnelData[1].value / totalNewClients) * 100).toFixed(1)
    : "0";

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
                <CardDescription>Movimentação da carteira, conversão e motivos de downgrade</CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-24 bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-24 bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      <SubscriptionScopeBanner scope="portfolio" />

      {/* Summary Cards */}
      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Novas Assinaturas" count={counts.new} amount={revenue.new} icon={<UserPlus className="w-5 h-5 text-green-400" />} color="border-green-500/30" tooltip="Inclui toda assinatura com ação = 'nova' no mês — barbeiros + recepção, clientes novos e da casa." />
          <SummaryCard label="Renovações" count={counts.renew} amount={revenue.renew} icon={<RefreshCw className="w-5 h-5 text-blue-400" />} color="border-blue-500/30" tooltip="Assinantes que renovaram o mesmo plano no período." />
          <SummaryCard label="Upgrades" count={counts.upgrade} amount={revenue.upgrade} icon={<TrendingUp className="w-5 h-5 text-emerald-400" />} color="border-emerald-500/30" tooltip="Assinantes que migraram para um plano de maior valor." />
          <SummaryCard label="Downgrades" count={counts.downgrade} amount={revenue.downgrade} icon={<TrendingDown className="w-5 h-5 text-red-400" />} color="border-red-500/30" tooltip="Assinantes que migraram para um plano de menor valor." />
        </div>
      </TooltipProvider>

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
                    <TableHead>Motivo</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => {
                    const action = t.subscription_action || "new";
                    const zonedDate = toZonedTime(new Date(t.created_at), "America/Manaus");
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs whitespace-nowrap">{format(zonedDate, "dd/MM HH:mm")}</TableCell>
                        <TableCell className="text-sm">{t.units?.name || "—"}</TableCell>
                        <TableCell className="text-sm">{t.client_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ACTION_BADGE_CLASS[action] || ""}>
                            {ACTION_LABELS[action] || action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{t.subscription_plans?.name || t.item_name}</TableCell>
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
        transaction={editingTransaction}
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
