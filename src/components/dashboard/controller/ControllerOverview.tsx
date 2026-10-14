import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Loader2,
  Users,
  Wallet,
  CreditCard,
  Globe,
  Building2,
  RefreshCw,
  XCircle,
  FileSpreadsheet,
} from "lucide-react";
import { brl } from "@/lib/currency";
import { fetchAllRows } from "@/lib/supabasePagination";
import {
  getManausDate,
  manausDayStart,
  manausDayEnd,
  formatManausDateTime,
  TIMEZONE,
} from "@/lib/dateUtils";
import { formatInTimeZone } from "date-fns-tz";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhone } from "@/lib/phoneUtils";

interface Props {
  organizationId: string;
}

interface SubTx {
  id: string;
  created_at: string;
  price_sold: number | null;
  subscription_action: string | null;
  attribution_source: string | null;
  client_name: string | null;
  mobile_phone: string | null;
  item_name: string | null;
  subscription_plan_id: string | null;
  unit_id: string | null;
  import_batch_id: string | null;
}

interface Batch {
  id: string;
  created_at: string;
  file_name: string | null;
  row_count: number | null;
  total_value: number | null;
}

// Classificação de origem de um movimento (espelha o controllerOriginLabel do
// Ao Vivo): cancelamento, renov. automática, nova adesão online, balcão.
type Origin = "cancel" | "auto_recurring" | "online" | "reception" | "outro";

function originOf(t: SubTx): Origin {
  if (t.subscription_action === "cancel") return "cancel";
  if (t.attribution_source === "auto_recurring") return "auto_recurring";
  if (t.attribution_source === "online") return "online";
  if (t.attribution_source === "reception") return "reception";
  return "outro";
}

const ORIGIN_META: Record<Origin, { label: string; className: string; color: string }> = {
  reception: { label: "Balcão", className: "bg-amber-500/15 text-amber-500 border-amber-500/30", color: "#f59e0b" },
  online: { label: "Nova adesão online", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", color: "#10b981" },
  auto_recurring: { label: "Renov. automática", className: "bg-blue-500/15 text-blue-400 border-blue-500/30", color: "#3b82f6" },
  cancel: { label: "Cancelamento", className: "bg-red-500/15 text-red-400 border-red-500/30", color: "#ef4444" },
  outro: { label: "Outro", className: "bg-muted text-muted-foreground border-border", color: "#94a3b8" },
};

// Lista os últimos N meses (yyyy-MM) a partir do mês corrente de Manaus.
function lastMonths(n: number): { key: string; label: string }[] {
  const now = getManausDate();
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    // Rótulo direto do Date local (sem reaplicar fuso, que deslocaria o mês em
    // navegadores a leste de Manaus e rotularia o mês errado).
    out.push({ key, label: format(d, "MMM/yyyy", { locale: ptBR }) });
  }
  return out;
}

export default function ControllerOverview({ organizationId }: Props) {
  const months = useMemo(() => lastMonths(6), []);
  const [monthKey, setMonthKey] = useState(months[0]?.key ?? "");
  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState<SubTx[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [planName, setPlanName] = useState<Map<string, string>>(new Map());
  const [unitName, setUnitName] = useState<Map<string, string>>(new Map());
  const [activeByPlan, setActiveByPlan] = useState<{ plan: string; count: number }[]>([]);
  const [activeTotal, setActiveTotal] = useState(0);

  const monthStart = `${monthKey}-01`;
  const monthEnd = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${monthKey}-${String(last).padStart(2, "0")}`;
  }, [monthKey]);

  useEffect(() => {
    if (!organizationId || !monthKey) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [plansRes, unitsRes, batchesRes] = await Promise.all([
          supabase.from("subscription_plans").select("id, name").eq("organization_id", organizationId),
          supabase.from("units").select("id, name").eq("organization_id", organizationId),
          supabase
            .from("controller_import_batches")
            .select("id, created_at, file_name, row_count, total_value")
            .eq("organization_id", organizationId)
            .gte("created_at", manausDayStart(monthStart))
            .lte("created_at", manausDayEnd(monthEnd))
            .order("created_at", { ascending: false }),
        ]);
        if (cancelled) return;
        const pMap = new Map<string, string>();
        (plansRes.data || []).forEach((p: { id: string; name: string }) => pMap.set(p.id, p.name));
        const uMap = new Map<string, string>();
        (unitsRes.data || []).forEach((u: { id: string; name: string }) => uMap.set(u.id, u.name));
        setPlanName(pMap);
        setUnitName(uMap);
        setBatches((batchesRes.data as Batch[]) || []);

        const rows = await fetchAllRows<SubTx>(() =>
          supabase
            .from("sale_transactions")
            .select(
              "id, created_at, price_sold, subscription_action, attribution_source, client_name, mobile_phone, item_name, subscription_plan_id, unit_id, import_batch_id",
            )
            .eq("organization_id", organizationId)
            .eq("item_type", "subscription")
            // Só a movimentação da CONTROLADORIA (mesmo escopo do Ao Vivo):
            // origem controller/online/auto_recurring OU vinda de um lote de
            // importação. Exclui vendas normais de assinatura da recepção/barbeiro/
            // gestor, que o RLS do controlador também deixa ler mas não são dele.
            .or("attribution_source.in.(controller,online,auto_recurring),import_batch_id.not.is.null")
            .gte("created_at", manausDayStart(monthStart))
            .lte("created_at", manausDayEnd(monthEnd))
            .order("created_at", { ascending: false }) as never,
        );
        if (cancelled) return;
        setTxs(rows);

        // Assinantes ativos (clientes com plano vigente) — atributo do cliente.
        const clients = await fetchAllRows<{ subscription_plan_id: string | null }>(() =>
          supabase
            .from("clients")
            .select("subscription_plan_id")
            .eq("organization_id", organizationId)
            .not("subscription_plan_id", "is", null) as never,
        );
        if (cancelled) return;
        const byPlan = new Map<string, number>();
        clients.forEach((c) => {
          if (!c.subscription_plan_id) return;
          byPlan.set(c.subscription_plan_id, (byPlan.get(c.subscription_plan_id) || 0) + 1);
        });
        setActiveTotal(clients.length);
        setActiveByPlan(
          [...byPlan.entries()]
            .map(([id, count]) => ({ plan: pMap.get(id) || "Sem nome", count }))
            .sort((a, b) => b.count - a.count),
        );
      } catch (err) {
        console.error("Erro ao carregar painel da controladoria:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, monthKey, monthStart, monthEnd]);

  // KPIs do mês por origem.
  const kpis = useMemo(() => {
    const acc = {
      mrr: 0,
      reception: { count: 0, rev: 0 },
      online: { count: 0, rev: 0 },
      auto_recurring: { count: 0, rev: 0 },
      cancelCount: 0,
    };
    for (const t of txs) {
      const o = originOf(t);
      const price = Number(t.price_sold) || 0;
      if (o === "cancel") {
        acc.cancelCount++;
        continue;
      }
      acc.mrr += price;
      if (o === "reception" || o === "online" || o === "auto_recurring") {
        acc[o].count++;
        acc[o].rev += price;
      }
    }
    return acc;
  }, [txs]);

  // Faturamento diário empilhado por origem (para o gráfico).
  const chartData = useMemo(() => {
    const byDay = new Map<string, { dia: string; Balcão: number; Online: number; "Renov. auto": number }>();
    for (const t of txs) {
      const o = originOf(t);
      if (o === "cancel" || o === "outro") continue;
      const dk = formatInTimeZone(new Date(t.created_at), TIMEZONE, "dd");
      const row = byDay.get(dk) || { dia: dk, Balcão: 0, Online: 0, "Renov. auto": 0 };
      const price = Number(t.price_sold) || 0;
      if (o === "reception") row["Balcão"] += price;
      else if (o === "online") row["Online"] += price;
      else if (o === "auto_recurring") row["Renov. auto"] += price;
      byDay.set(dk, row);
    }
    return [...byDay.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  }, [txs]);

  const movementCount = txs.filter((t) => originOf(t) !== "cancel").length;

  return (
    <div className="space-y-4">
      {/* Cabeçalho com seletor de mês */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Painel da Controladoria</h2>
          <p className="text-xs text-muted-foreground">
            Movimentação de assinaturas, assinantes e histórico de importações.
          </p>
        </div>
        <Select value={monthKey} onValueChange={setMonthKey}>
          <SelectTrigger className="h-9 w-[150px] text-sm capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.key} value={m.key} className="capitalize">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando painel...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiCard icon={<Wallet className="w-4 h-4" />} label="MRR do mês" value={brl(kpis.mrr)} sub={`${movementCount} lançamentos`} accent="text-primary" />
            <KpiCard icon={<Users className="w-4 h-4" />} label="Assinantes ativos" value={String(activeTotal)} sub={`${activeByPlan.length} planos`} accent="text-foreground" />
            <KpiCard icon={<RefreshCw className="w-4 h-4" />} label="Renov. automática" value={brl(kpis.auto_recurring.rev)} sub={`${kpis.auto_recurring.count} cobranças`} accent="text-blue-400" />
            <KpiCard icon={<Globe className="w-4 h-4" />} label="Nova adesão online" value={brl(kpis.online.rev)} sub={`${kpis.online.count} adesões`} accent="text-emerald-500" />
            <KpiCard icon={<Building2 className="w-4 h-4" />} label="Balcão" value={brl(kpis.reception.rev)} sub={`${kpis.reception.count} lançamentos`} accent="text-amber-500" />
            <KpiCard icon={<XCircle className="w-4 h-4" />} label="Cancelamentos" value={String(kpis.cancelCount)} sub="churn do mês" accent="text-red-400" />
          </div>

          {/* Gráfico: faturamento diário por origem */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" /> Faturamento diário por origem
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              {chartData.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-6 text-center">
                  Nenhum lançamento de assinatura neste mês.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v}`} width={54} />
                    <Tooltip
                      formatter={(v: number) => brl(v)}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Balcão" stackId="a" fill={ORIGIN_META.reception.color} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Online" stackId="a" fill={ORIGIN_META.online.color} />
                    <Bar dataKey="Renov. auto" stackId="a" fill={ORIGIN_META.auto_recurring.color} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Assinantes ativos por plano */}
          {activeByPlan.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" /> Assinantes ativos por plano
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1.5">
                {activeByPlan.map((p) => (
                  <div key={p.plan} className="flex items-center justify-between text-xs">
                    <span className="text-foreground/80 truncate pr-2">{p.plan}</span>
                    <span className="font-semibold tabular-nums">{p.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Histórico de importações do mês */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground" /> Importações do mês
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {batches.length === 0 ? (
                <p className="text-xs text-muted-foreground px-4 py-4">Nenhuma importação neste mês.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Arquivo</TableHead>
                      <TableHead className="text-right">Linhas</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatManausDateTime(b.created_at, "dd/MM HH:mm")}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[200px]">{b.file_name || "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{b.row_count ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {brl(Number(b.total_value) || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Histórico de lançamentos (movimentos) */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" /> Histórico de lançamentos ({txs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {txs.length === 0 ? (
                <p className="text-xs text-muted-foreground px-4 py-4">Nenhum lançamento neste mês.</p>
              ) : (
                <div className="max-h-[60vh] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txs.map((t) => {
                        const o = originOf(t);
                        const meta = ORIGIN_META[o];
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatManausDateTime(t.created_at, "dd/MM")}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="min-w-0">
                                <p className="truncate max-w-[160px]">{t.client_name || "—"}</p>
                                {t.mobile_phone && (
                                  <p className="text-[10px] text-muted-foreground">{formatPhone(t.mobile_phone)}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs truncate max-w-[140px]">
                              {t.subscription_plan_id ? planName.get(t.subscription_plan_id) || t.item_name : t.item_name || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                                {meta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold tabular-nums">
                              {o === "cancel" ? "—" : brl(Number(t.price_sold) || 0)}
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
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className={accent}>{icon}</span>
          <span className="text-[10px] uppercase tracking-wide">{label}</span>
        </div>
        <p className={`text-lg font-bold mt-1 ${accent}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
