import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ShieldAlert, AlertTriangle, TrendingDown, ListFilter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhone } from "@/lib/phoneUtils";

interface ManagerRescueReportProps {
  organizationId: string;
  from: Date;
  to: Date;
}

interface RescueTx {
  id: string;
  created_at: string;
  client_name: string | null;
  mobile_phone: string | null;
  item_name: string;
  price_sold: number;
  subscription_action: string | null;
  unit_id: string | null;
  unit_name: string;
}

interface UnitGroup {
  unit_id: string | null;
  unit_name: string;
  count: number;
  mrr: number;
  lastAt: string;
}

const WARN_THRESHOLD = 5;

const actionLabel = (a: string | null) => {
  switch (a) {
    case "new":
      return "Nova";
    case "renew":
      return "Renovação";
    case "upgrade":
      return "Upgrade";
    case "downgrade":
      return "Downgrade";
    default:
      return "—";
  }
};

export default function ManagerRescueReport({ organizationId, from, to }: ManagerRescueReportProps) {
  const [loading, setLoading] = useState(true);
  const [rescues, setRescues] = useState<RescueTx[]>([]);
  const [totalAdhesions, setTotalAdhesions] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const fromIso = `${format(from, "yyyy-MM-dd")}T00:00:00-04:00`;
    const toIso = `${format(to, "yyyy-MM-dd")}T23:59:59-04:00`;

    const load = async () => {
      setLoading(true);
      try {
        const [rescueRes, totalRes, unitsRes] = await Promise.all([
          supabase
            .from("sale_transactions")
            .select("id, created_at, client_name, mobile_phone, item_name, price_sold, subscription_action, unit_id")
            .eq("organization_id", organizationId)
            .eq("item_type", "subscription")
            // Regra de negócio: este relatório é estritamente de recuperações lançadas pelo gestor,
            // independente de source/origem do lançamento.
            .eq("attribution_source", "manager_rescue")
            .gte("created_at", fromIso)
            .lte("created_at", toIso)
            .order("created_at", { ascending: false }),
          supabase
            .from("sale_transactions")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("item_type", "subscription")
            .gte("created_at", fromIso)
            .lte("created_at", toIso),
          supabase
            .from("units")
            .select("id, name")
            .eq("organization_id", organizationId),
        ]);

        const unitMap = new Map<string, string>();
        (unitsRes.data || []).forEach((u: any) => unitMap.set(u.id, u.name));

        const list: RescueTx[] = (rescueRes.data || []).map((t: any) => ({
          ...t,
          unit_name: t.unit_id ? unitMap.get(t.unit_id) || "Unidade removida" : "Sem unidade",
        }));
        setRescues(list);
        setTotalAdhesions(totalRes.count || 0);
      } catch (err) {
        console.error("Erro carregando recuperações do gestor:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [organizationId, from.getTime(), to.getTime()]);

  const groups = useMemo<UnitGroup[]>(() => {
    const map = new Map<string, UnitGroup>();
    for (const r of rescues) {
      const key = r.unit_id || "__none__";
      const cur = map.get(key) || {
        unit_id: r.unit_id,
        unit_name: r.unit_name,
        count: 0,
        mrr: 0,
        lastAt: r.created_at,
      };
      cur.count += 1;
      cur.mrr += Number(r.price_sold || 0);
      if (new Date(r.created_at) > new Date(cur.lastAt)) cur.lastAt = r.created_at;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [rescues]);

  const totalMrr = useMemo(
    () => rescues.reduce((acc, r) => acc + Number(r.price_sold || 0), 0),
    [rescues]
  );

  if (loading) return null;
  if (rescues.length === 0) return null;

  const sharePct = totalAdhesions > 0 ? (rescues.length / totalAdhesions) * 100 : 0;

  return (
    <>
      <Card className="border-destructive/40 bg-destructive/5 shadow-card-custom">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              <div>
                <CardTitle className="text-lg">Recuperações do Gestor</CardTitle>
                <CardDescription>
                  Assinaturas que o gestor teve que lançar por falha da recepção ou do barbeiro
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setDetailsOpen(true)}
            >
              <ListFilter className="w-3.5 h-3.5" />
              Ver detalhes ({rescues.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">Recuperações no período</p>
              <p className="text-2xl font-bold text-destructive">{rescues.length}</p>
            </div>
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">MRR resgatado</p>
              <p className="text-2xl font-bold">
                R$ {totalMrr.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">% sobre total de adesões</p>
              <p className="text-2xl font-bold">
                {sharePct.toFixed(1)}% <span className="text-sm text-muted-foreground">de {totalAdhesions}</span>
              </p>
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-center">Recuperações</TableHead>
                  <TableHead className="text-right">MRR resgatado</TableHead>
                  <TableHead>Última recuperação</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const warn = g.count >= WARN_THRESHOLD;
                  return (
                    <TableRow key={g.unit_id || "none"}>
                      <TableCell className="font-medium">{g.unit_name}</TableCell>
                      <TableCell className="text-center font-semibold">{g.count}</TableCell>
                      <TableCell className="text-right">
                        R$ {g.mrr.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(g.lastAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {warn ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Falha operacional
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <TrendingDown className="w-3 h-3" />
                            Acompanhar
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Detalhes das Recuperações
            </DialogTitle>
            <DialogDescription>
              Lista completa de assinaturas lançadas pelo gestor no período.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rescues.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      {format(new Date(r.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">{r.client_name || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.mobile_phone ? formatPhone(r.mobile_phone) : "—"}
                    </TableCell>
                    <TableCell>{r.item_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {actionLabel(r.subscription_action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.unit_name}</TableCell>
                    <TableCell className="text-right font-semibold">
                      R$ {Number(r.price_sold).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
