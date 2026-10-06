import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/useOrganization";
import { formatPhone } from "@/lib/phoneUtils";
import { CalendarClock, Loader2, Building2, CheckCircle2, CalendarSync } from "lucide-react";
import { toast } from "sonner";

interface FlaggedClient {
  id: string;
  name: string;
  mobile_phone: string;
  subscription_due_date: string | null;
  subscription_due_policy: string | null;
  subscription_last_payment_at: string | null;
  subscription_last_late_days: number | null;
  subscription_payment_shift_flagged_at: string | null;
  subscription_unit_id: string | null;
  subscription_plans: { name: string } | null;
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

export default function SubscriptionDueDateReport() {
  const { organizationId } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<FlaggedClient[]>([]);
  const [units, setUnits] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const fetchData = useMemo(
    () => async () => {
      if (!organizationId) return;
      setLoading(true);
      try {
        const [{ data: unitRows }, { data, error }] = await Promise.all([
          supabase
            .from("units")
            .select("id, name")
            .eq("organization_id", organizationId),
          supabase
            .from("clients")
            .select(
              "id, name, mobile_phone, subscription_due_date, subscription_due_policy, subscription_last_payment_at, subscription_last_late_days, subscription_payment_shift_flagged_at, subscription_unit_id, subscription_plans(name)",
            )
            .eq("organization_id", organizationId)
            .not("subscription_plan_id", "is", null)
            .or(
              "subscription_payment_shift_flagged_at.not.is.null,subscription_due_policy.eq.follow_payment",
            ),
        ]);
        if (error) throw error;
        const unitMap: Record<string, string> = {};
        (unitRows || []).forEach((u: { id: string; name: string }) => (unitMap[u.id] = u.name));
        setUnits(unitMap);
        // Mais atrasados primeiro.
        const sorted = ((data as FlaggedClient[]) || []).sort(
          (a, b) => (b.subscription_last_late_days ?? 0) - (a.subscription_last_late_days ?? 0),
        );
        setRows(sorted);
      } catch (err) {
        console.error("Erro ao carregar datas de vencimento:", err);
        toast.error("Não foi possível carregar os clientes marcados.");
      } finally {
        setLoading(false);
      }
    },
    [organizationId],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Marca "cliente solicitou troca": a próxima renovação re-ancora na data de pagamento.
  const requestDateChange = async (c: FlaggedClient) => {
    setActing(c.id);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ subscription_due_policy: "follow_payment" })
        .eq("id", c.id);
      if (error) throw error;
      toast.success(`Troca de data marcada para ${c.name}. A próxima renovação vai ajustar o vencimento.`);
      await fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível marcar a troca de data.");
    } finally {
      setActing(null);
    }
  };

  // Dispensa o alerta (mantém a data; limpa a flag de atraso).
  const dismissFlag = async (c: FlaggedClient) => {
    setActing(c.id);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ subscription_payment_shift_flagged_at: null })
        .eq("id", c.id);
      if (error) throw error;
      toast.success(`Alerta dispensado para ${c.name}.`);
      await fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível dispensar o alerta.");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
              <CalendarClock className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Datas de Vencimento</CardTitle>
              <CardDescription>
                Clientes que pagaram com mais de 10 dias de atraso (o vencimento foi mantido) ou que
                já estão marcados para trocar a data do contrato. Decida manter ou trocar a data.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2" />
              <p className="text-muted-foreground">Nenhum cliente com data a revisar.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead className="text-center">Vencimento</TableHead>
                    <TableHead className="text-center">Último pgto.</TableHead>
                    <TableHead className="text-center">Atraso</TableHead>
                    <TableHead className="text-center">Situação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => {
                    const pending = c.subscription_due_policy === "follow_payment";
                    const late = c.subscription_last_late_days ?? 0;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          <div>{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.mobile_phone ? formatPhone(c.mobile_phone) : "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            {c.subscription_unit_id
                              ? units[c.subscription_unit_id] || "Unidade removida"
                              : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{c.subscription_plans?.name || "—"}</TableCell>
                        <TableCell className="text-center">{fmtDate(c.subscription_due_date)}</TableCell>
                        <TableCell className="text-center">
                          {fmtDate(c.subscription_last_payment_at)}
                        </TableCell>
                        <TableCell className="text-center">
                          {late > 0 ? (
                            <span className="font-semibold text-destructive">
                              {late} {late === 1 ? "dia" : "dias"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {pending ? (
                            <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
                              Troca solicitada
                            </Badge>
                          ) : (
                            <Badge variant="outline">Atraso &gt; 10 dias</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {!pending && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acting === c.id}
                                onClick={() => requestDateChange(c)}
                              >
                                <CalendarSync className="w-3.5 h-3.5 mr-1" />
                                Trocar data
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={acting === c.id}
                              onClick={() => dismissFlag(c)}
                            >
                              {acting === c.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "Dispensar"
                              )}
                            </Button>
                          </div>
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
    </div>
  );
}
