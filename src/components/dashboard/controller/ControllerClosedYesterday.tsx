import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, CalendarCheck } from "lucide-react";
import { brl } from "@/lib/currency";
import { fetchAllRows } from "@/lib/supabasePagination";
import {
  getControllerDefaultDays,
  getTodayString,
  manausDayStart,
  manausDayEnd,
  TIMEZONE,
} from "@/lib/dateUtils";
import { formatInTimeZone } from "date-fns-tz";
import { formatPhone } from "@/lib/phoneUtils";
import { originOf, ORIGIN_META } from "./ControllerOverview";

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
  import_batch_id: string | null;
}

// "yyyy-MM-dd" → "DD/MM". Rótulo humano dos dias anteriores.
const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;

export default function ControllerClosedYesterday({ organizationId }: Props) {
  // Recalcula o(s) dia(s) anterior(es) na virada do dia (caso o controlador
  // deixe a tela aberta) — getControllerDefaultDays depende da data atual.
  const [todayKey, setTodayKey] = useState(() => getTodayString());
  useEffect(() => {
    const id = setInterval(() => {
      const k = getTodayString();
      setTodayKey((p) => (p === k ? p : k));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const days = useMemo(() => getControllerDefaultDays(), [todayKey]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [txs, setTxs] = useState<SubTx[]>([]);
  const [planName, setPlanName] = useState<Map<string, string>>(new Map());

  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];
  const label = days.map(dm).join(" + ");

  useEffect(() => {
    if (!organizationId || days.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const plansRes = await supabase
          .from("subscription_plans")
          .select("id, name")
          .eq("organization_id", organizationId);
        if (cancelled) return;
        const pMap = new Map<string, string>();
        (plansRes.data || []).forEach((p: { id: string; name: string }) => pMap.set(p.id, p.name));
        setPlanName(pMap);

        const rows = await fetchAllRows<SubTx>(() =>
          supabase
            .from("sale_transactions")
            .select(
              "id, created_at, price_sold, subscription_action, attribution_source, client_name, mobile_phone, item_name, subscription_plan_id, import_batch_id",
            )
            .eq("organization_id", organizationId)
            .eq("item_type", "subscription")
            // Mesmo escopo da controladoria (igual ao Ao Vivo e ao painel do mês).
            .or("attribution_source.in.(controller,online,auto_recurring),import_batch_id.not.is.null")
            .gte("created_at", manausDayStart(rangeStart))
            .lte("created_at", manausDayEnd(rangeEnd))
            .order("created_at", { ascending: false }) as never,
        );
        if (cancelled) return;
        // "Fechadas" = vendas; cancelamento não é fechamento de assinatura.
        // Filtra no JS (não no banco) para não descartar linhas com ação nula.
        setTxs(rows.filter((r) => originOf(r) !== "cancel"));
      } catch (err) {
        console.error("Erro ao carregar assinaturas do dia anterior:", err);
        if (!cancelled) {
          // Não apresenta dado obsoleto como se fosse do dia atual: limpa e marca erro.
          setTxs([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, days, rangeStart, rangeEnd]);

  const totals = useMemo(() => {
    let count = 0;
    let rev = 0;
    const byOrigin = new Map<string, { count: number; rev: number }>();
    for (const t of txs) {
      const o = originOf(t);
      const price = Number(t.price_sold) || 0;
      count++;
      rev += price;
      const cur = byOrigin.get(o) || { count: 0, rev: 0 };
      cur.count++;
      cur.rev += price;
      byOrigin.set(o, cur);
    }
    return { count, rev, byOrigin };
  }, [txs]);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-primary" />
            Assinaturas fechadas — dia anterior ({label})
          </span>
          {!loading && !error && (
            <span className="text-xs font-normal text-muted-foreground">
              {totals.count} · {brl(totals.rev)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="text-xs text-red-400 px-4 py-4">
            Não foi possível carregar as assinaturas do dia anterior. Tente recarregar a página.
          </p>
        ) : txs.length === 0 ? (
          <p className="text-xs text-muted-foreground px-4 py-4">
            Nenhuma assinatura fechada em {label}.
          </p>
        ) : (
          <>
            {/* Mini-breakdown por origem */}
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {[...totals.byOrigin.entries()]
                .filter(([o]) => o !== "cancel")
                .map(([o, v]) => {
                  const meta = ORIGIN_META[o as keyof typeof ORIGIN_META];
                  return (
                    <Badge key={o} variant="outline" className={`text-[10px] ${meta.className}`}>
                      {meta.label}: {v.count} · {brl(v.rev)}
                    </Badge>
                  );
                })}
            </div>
            <div className="max-h-[40vh] overflow-auto">
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
                          {formatInTimeZone(new Date(t.created_at), TIMEZONE, "dd/MM")}
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
                          {brl(Number(t.price_sold) || 0)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
