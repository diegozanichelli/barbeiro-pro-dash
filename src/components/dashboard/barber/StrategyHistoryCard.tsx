import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, AlertTriangle, Swords } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  barberId: string;
}

interface Execution {
  id: string;
  date: string;
  strategy_id: string;
  strategy_name: string;
  clients_in_agenda: number | null;
  result_clients: number | null;
  result_revenue: number | null;
  result_avg_ticket: number | null;
  result_extras_ratio: number | null;
  result_commission: number | null;
  result_vs_target_pct: number | null;
  result_calculated_at: string | null;
}

const fmtBRL = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export default function StrategyHistoryCard({ barberId }: Props) {
  const [rows, setRows] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("war_plan_executions")
        .select("id, date, strategy_id, strategy_name, clients_in_agenda, result_clients, result_revenue, result_avg_ticket, result_extras_ratio, result_commission, result_vs_target_pct, result_calculated_at")
        .eq("barber_id", barberId)
        .order("date", { ascending: false })
        .limit(60);
      if (mounted) {
        setRows((data as Execution[]) || []);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [barberId]);

  const aggregated = useMemo(() => {
    const map = new Map<string, { name: string; n: number; ticket: number; vsTarget: number; extras: number; commission: number }>();
    for (const r of rows) {
      if (!r.result_calculated_at) continue;
      const k = r.strategy_id;
      const cur = map.get(k) || { name: r.strategy_name, n: 0, ticket: 0, vsTarget: 0, extras: 0, commission: 0 };
      cur.n++;
      cur.ticket += Number(r.result_avg_ticket || 0);
      cur.vsTarget += Number(r.result_vs_target_pct || 0);
      cur.extras += Number(r.result_extras_ratio || 0) * 100;
      cur.commission += Number(r.result_commission || 0);
      map.set(k, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id, name: v.name, n: v.n,
        avgTicket: v.ticket / v.n,
        avgVsTarget: v.vsTarget / v.n,
        avgExtras: v.extras / v.n,
        totalCommission: v.commission,
      }))
      .sort((a, b) => b.avgVsTarget - a.avgVsTarget);
  }, [rows]);

  const winner = aggregated[0];
  const loser = aggregated.length >= 2 ? aggregated[aggregated.length - 1] : null;

  const filtered = filter === "all" ? rows : rows.filter(r => r.strategy_id === filter);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Swords className="w-5 h-5 text-primary" /> Histórico de Estratégias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Swords className="w-5 h-5 text-primary" /> Histórico de Estratégias</CardTitle>
          <CardDescription>Aqui aparecem as estratégias do Plano de Guerra que você usou e o resultado real de cada dia.</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground">
          Nenhum plano de guerra registrado ainda. Gere o plano de hoje pra começar o histórico.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Swords className="w-5 h-5 text-primary" /> Histórico de Estratégias</CardTitle>
        <CardDescription>O que cada estratégia rendeu pra você (ticket, volume, extras e % da meta).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Resumo campeã/fraca */}
        {(winner || loser) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {winner && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Trophy className="w-4 h-4" /> Estratégia campeã
                </div>
                <div className="mt-1 text-foreground font-bold">{winner.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {winner.n} uso(s) · ticket médio {fmtBRL(winner.avgTicket)} · {winner.avgVsTarget.toFixed(0)}% da meta
                </div>
              </div>
            )}
            {loser && loser.id !== winner?.id && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <AlertTriangle className="w-4 h-4" /> Mais fraca
                </div>
                <div className="mt-1 text-foreground font-bold">{loser.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {loser.n} uso(s) · ticket médio {fmtBRL(loser.avgTicket)} · {loser.avgVsTarget.toFixed(0)}% da meta
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filtro */}
        {aggregated.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={filter === "all" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilter("all")}
            >
              Todas ({rows.length})
            </Badge>
            {aggregated.map(s => (
              <Badge
                key={s.id}
                variant={filter === s.id ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilter(s.id)}
              >
                {s.name} ({s.n})
              </Badge>
            ))}
          </div>
        )}

        {/* Tabela */}
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Estratégia</th>
                <th className="px-3 py-2 font-medium text-right">Clientes</th>
                <th className="px-3 py-2 font-medium text-right">Ticket</th>
                <th className="px-3 py-2 font-medium text-right">Extras%</th>
                <th className="px-3 py-2 font-medium text-right">Comissão</th>
                <th className="px-3 py-2 font-medium text-right">vs Meta</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const vs = r.result_vs_target_pct;
                const vsColor = vs == null
                  ? "text-muted-foreground"
                  : vs >= 100 ? "text-emerald-600 dark:text-emerald-400"
                  : vs >= 80 ? "text-amber-600 dark:text-amber-400"
                  : "text-destructive";
                const calculated = !!r.result_calculated_at;
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap">{format(parseISO(r.date), "dd/MM (EEE)", { locale: ptBR })}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-medium">{r.strategy_name}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{calculated ? (r.result_clients ?? 0) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{calculated ? fmtBRL(r.result_avg_ticket) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{calculated ? `${((r.result_extras_ratio ?? 0) * 100).toFixed(0)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{calculated ? fmtBRL(r.result_commission) : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${vsColor}`}>
                      {calculated && vs != null ? `${vs.toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Resultados consolidados a cada novo plano gerado. % vs meta = comissão do dia ÷ meta diária.
        </p>
      </CardContent>
    </Card>
  );
}
