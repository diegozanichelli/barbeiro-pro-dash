import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Scissors, Sparkles, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string | null;
  barberName: string;
  unitName?: string;
  year: number;
  month: number; // 1-12
}

interface Tx {
  id: string;
  created_at: string;
  item_name: string;
  item_type: string;
  service_category: string | null;
  price_sold: number;
  client_name: string | null;
  source: string;
}

const monthNames = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function BarberPeriodDetailModal({
  open, onOpenChange, barberId, barberName, unitName, year, month,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);

  useEffect(() => {
    if (!open || !barberId) return;
    (async () => {
      setLoading(true);
      const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;

      const all: Tx[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("sale_transactions")
          .select("id, created_at, item_name, item_type, service_category, price_sold, client_name, source")
          .eq("barber_id", barberId)
          .gte("created_at", `${startDate}T00:00:00-04:00`)
          .lte("created_at", `${endDate}T23:59:59-04:00`)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) {
          console.error("Erro ao buscar transações:", error);
          break;
        }
        if (!data || data.length === 0) break;
        all.push(...(data as Tx[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setTxs(all);
      setLoading(false);
    })();
  }, [open, barberId, year, month]);

  // Totalizadores por categoria
  const totals = txs.reduce(
    (acc, t) => {
      const price = Number(t.price_sold) || 0;
      if (t.item_type === 'product') {
        acc.products += price;
        acc.productsCount += 1;
      } else if (t.item_type === 'subscription') {
        acc.subscriptions += price;
        acc.subscriptionsCount += 1;
      } else {
        // service
        if (t.service_category === 'extra') {
          acc.extra += price;
          acc.extraCount += 1;
        } else {
          acc.basic += price;
          acc.basicCount += 1;
        }
      }
      acc.total += price;
      return acc;
    },
    { basic: 0, extra: 0, products: 0, subscriptions: 0, total: 0,
      basicCount: 0, extraCount: 0, productsCount: 0, subscriptionsCount: 0 }
  );

  const categoryLabel = (t: Tx) => {
    if (t.item_type === 'product') return 'Produto';
    if (t.item_type === 'subscription') return 'Assinatura';
    return t.service_category === 'extra' ? 'Serviço extra' : 'Serviço básico';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{barberName}</DialogTitle>
          <DialogDescription>
            {unitName ? `${unitName} · ` : ''}Lançamentos de {monthNames[month - 1]} {year}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Totais por categoria */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Scissors className="w-4 h-4 text-primary" />
                    <p className="text-xs text-muted-foreground">Serviços básicos</p>
                  </div>
                  <p className="text-base font-bold">{formatBRL(totals.basic)}</p>
                  <p className="text-[11px] text-muted-foreground">{totals.basicCount} lançamentos</p>
                </CardContent>
              </Card>
              <Card className="bg-success/5 border-success/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-success" />
                    <p className="text-xs text-muted-foreground">Serviços extras</p>
                  </div>
                  <p className="text-base font-bold">{formatBRL(totals.extra)}</p>
                  <p className="text-[11px] text-muted-foreground">{totals.extraCount} lançamentos</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-blue-500" />
                    <p className="text-xs text-muted-foreground">Produtos</p>
                  </div>
                  <p className="text-base font-bold">{formatBRL(totals.products)}</p>
                  <p className="text-[11px] text-muted-foreground">{totals.productsCount} lançamentos</p>
                </CardContent>
              </Card>
              <Card className="bg-muted border-border">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Total no período</p>
                  <p className="text-base font-bold">{formatBRL(totals.total)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {txs.length} lançamentos
                    {totals.subscriptionsCount > 0 && ` · ${totals.subscriptionsCount} assinatura(s)`}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Lista de lançamentos */}
            {txs.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhum lançamento encontrado neste período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txs.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs">
                          {format(new Date(t.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="font-medium">{t.item_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {categoryLabel(t)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.client_name?.trim() || '—'}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatBRL(Number(t.price_sold) || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
