import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganization } from "@/hooks/useOrganization";
import { useReportsFilter } from "@/contexts/reportsFilter";
import { fetchAllRows } from "@/lib/supabasePagination";
import { manausDayStart, manausDayEnd, toDateKey } from "@/lib/dateUtils";
import { isLegacyImport, isCancellation, isOnlineAdhesion, isAutoRecurring } from "@/lib/metricsRules";
import { brl } from "@/lib/currency";
import { Building2, LogIn, Repeat, LogOut, TrendingUp, Loader2, Store, Globe } from "lucide-react";
import AutoRecurringReport from "./AutoRecurringReport";

interface MovementTx {
  unit_id: string | null;
  item_type: string | null;
  subscription_action: string | null;
  attribution_source: string | null;
  price_sold: number | null;
}

interface UnitMovement {
  unitId: string | null;
  unitName: string;
  entradasBalcao: number;
  entradasOnline: number;
  renovManual: number;
  renovAuto: number;
  cancelamentos: number;
  receita: number;
}

const isNew = (tx: MovementTx) =>
  tx.item_type === "subscription" && tx.subscription_action === "new" && !isLegacyImport(tx);

const isRenewal = (tx: MovementTx) =>
  tx.item_type === "subscription" &&
  (tx.subscription_action === "renew" ||
    tx.subscription_action === "upgrade" ||
    tx.subscription_action === "downgrade");

export default function SubscriptionMovementReport() {
  const { organizationId } = useOrganization();
  const { month, year, unitId } = useReportsFilter();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UnitMovement[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);

  const { startISO, endISO, fromDate, toDate } = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    return {
      startISO: manausDayStart(toDateKey(first)),
      endISO: manausDayEnd(toDateKey(last)),
      fromDate: first,
      toDate: last,
    };
  }, [month, year]);

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("units")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setUnits(data || []));
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || units.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const txs = await fetchAllRows<MovementTx>(() => {
          let q = supabase
            .from("sale_transactions")
            .select("unit_id, item_type, subscription_action, attribution_source, price_sold")
            .eq("organization_id", organizationId)
            .eq("item_type", "subscription")
            .gte("created_at", startISO)
            .lte("created_at", endISO);
          if (unitId !== "all") q = q.eq("unit_id", unitId);
          return q as never;
        });
        if (cancelled) return;

        const map = new Map<string, UnitMovement>();
        const ensure = (id: string | null, name: string) => {
          const key = id || "unknown";
          if (!map.has(key)) {
            map.set(key, {
              unitId: id,
              unitName: name,
              entradasBalcao: 0,
              entradasOnline: 0,
              renovManual: 0,
              renovAuto: 0,
              cancelamentos: 0,
              receita: 0,
            });
          }
          return map.get(key)!;
        };

        const unitName = (id: string | null) =>
          id ? units.find((u) => u.id === id)?.name || "Unidade removida" : "Não informada";

        for (const tx of txs) {
          const row = ensure(tx.unit_id, unitName(tx.unit_id));
          if (isCancellation(tx)) {
            row.cancelamentos++;
            continue;
          }
          // Importação de histórico não é movimento do período: não entra em
          // contagem nem em receita (alinha com isNew, que já a exclui).
          if (isLegacyImport(tx)) continue;
          row.receita += Number(tx.price_sold || 0);
          if (isNew(tx)) {
            if (isOnlineAdhesion(tx)) row.entradasOnline++;
            else row.entradasBalcao++;
          } else if (isRenewal(tx)) {
            if (isAutoRecurring(tx)) row.renovAuto++;
            else row.renovManual++;
          }
        }

        const result = Array.from(map.values())
          .filter(
            (u) =>
              u.entradasBalcao + u.entradasOnline + u.renovManual + u.renovAuto + u.cancelamentos > 0
          )
          .sort(
            (a, b) =>
              b.entradasBalcao + b.entradasOnline - (a.entradasBalcao + a.entradasOnline)
          );
        setRows(result);
      } catch (err) {
        console.error("Erro ao carregar movimentação de assinaturas:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, units, startISO, endISO, unitId]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.entradas += r.entradasBalcao + r.entradasOnline;
        acc.online += r.entradasOnline;
        acc.renovacoes += r.renovManual + r.renovAuto;
        acc.auto += r.renovAuto;
        acc.cancelamentos += r.cancelamentos;
        acc.receita += r.receita;
        return acc;
      },
      { entradas: 0, online: 0, renovacoes: 0, auto: 0, cancelamentos: 0, receita: 0 }
    );
  }, [rows]);

  const saldo = totals.entradas - totals.cancelamentos;

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
              <Repeat className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Movimentação de Assinaturas</CardTitle>
              <CardDescription>
                Entradas (balcão + online), renovações (manual + automática) e cancelamentos por
                unidade — unificando recepção e controladoria no mesmo período.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-secondary/40 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <LogIn className="w-4 h-4" />
                <p className="text-xs">Entradas</p>
              </div>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {totals.entradas}
              </p>
              <p className="text-xs text-muted-foreground">{totals.online} online</p>
            </div>
            <div className="rounded-lg border bg-secondary/40 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Repeat className="w-4 h-4" />
                <p className="text-xs">Renovações</p>
              </div>
              <p className="text-2xl font-bold">{totals.renovacoes}</p>
              <p className="text-xs text-muted-foreground">{totals.auto} automáticas</p>
            </div>
            <div className="rounded-lg border bg-secondary/40 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <LogOut className="w-4 h-4" />
                <p className="text-xs">Cancelamentos</p>
              </div>
              <p className="text-2xl font-bold text-destructive">{totals.cancelamentos}</p>
              <p className="text-xs text-muted-foreground">
                Saldo líquido: <span className={saldo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>{saldo >= 0 ? "+" : ""}{saldo}</span>
              </p>
            </div>
            <div className="rounded-lg border bg-secondary/40 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="w-4 h-4" />
                <p className="text-xs">Receita de assinaturas</p>
              </div>
              <p className="text-2xl font-bold">{brl(totals.receita)}</p>
            </div>
          </div>

          {/* Tabela por unidade */}
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Repeat className="w-10 h-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Nenhum movimento de assinatura neste período.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-center">
                      <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> Balcão</span>
                    </TableHead>
                    <TableHead className="text-center">
                      <span className="inline-flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Online</span>
                    </TableHead>
                    <TableHead className="text-center">Renov. manual</TableHead>
                    <TableHead className="text-center">Renov. auto</TableHead>
                    <TableHead className="text-center">Cancel.</TableHead>
                    <TableHead className="text-center">Saldo</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((u) => {
                    const entradas = u.entradasBalcao + u.entradasOnline;
                    const saldoU = entradas - u.cancelamentos;
                    return (
                      <TableRow key={u.unitId || "unknown"}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            {u.unitName}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{u.entradasBalcao}</TableCell>
                        <TableCell className="text-center text-emerald-600 dark:text-emerald-400">
                          {u.entradasOnline}
                        </TableCell>
                        <TableCell className="text-center">{u.renovManual}</TableCell>
                        <TableCell className="text-center text-blue-600 dark:text-blue-400">
                          {u.renovAuto}
                        </TableCell>
                        <TableCell className="text-center text-destructive">{u.cancelamentos}</TableCell>
                        <TableCell className="text-center font-semibold">
                          <span className={saldoU >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                            {saldoU >= 0 ? "+" : ""}{saldoU}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{brl(u.receita)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco dedicado às renovações automáticas (reaproveitado) */}
      {organizationId && (
        <AutoRecurringReport organizationId={organizationId} from={fromDate} to={toDate} />
      )}
    </div>
  );
}
