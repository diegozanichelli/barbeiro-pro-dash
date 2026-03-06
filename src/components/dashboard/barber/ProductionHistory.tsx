import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, UserCheck, CalendarOff, XCircle, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ProductionHistoryProps {
  barberId: string;
  selectedMonth: number;
  selectedYear: number;
  onReview?: (date: string) => void;
}

interface DailyProduction {
  id: string;
  date: string;
  services_basic_total: number | null;
  services_extra_total: number | null;
  services_total: number | null;
  products_total: number;
  commission_earned: number;
  clients_count: number;
  services_count: number;
  products_count: number;
  confirmed_presence?: boolean;
  presence_type?: string | null;
  tx_basic_total?: number | null;
  tx_extra_total?: number | null;
  tx_products_total?: number | null;
}

interface SaleHistoryItem {
  id: string;
  created_at: string;
  client_name: string | null;
  item_name: string;
  item_type: string;
  price_sold: number;
}

export default function ProductionHistory({ 
  barberId, 
  selectedMonth, 
  selectedYear,
  onReview 
}: ProductionHistoryProps) {
  const [productions, setProductions] = useState<DailyProduction[]>([]);
  const [saleHistory, setSaleHistory] = useState<SaleHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProductions();
  }, [barberId, selectedMonth, selectedYear]);

  const fetchProductions = async () => {
    setLoading(true);
    
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);

    const [productionsResponse, salesResponse] = await Promise.all([
      supabase
        .from("daily_productions")
        .select("*")
        .eq("barber_id", barberId)
        .gte("date", format(firstDay, "yyyy-MM-dd"))
        .lte("date", format(lastDay, "yyyy-MM-dd"))
        .order("date", { ascending: false }),
      supabase
        .from("sale_transactions")
        .select("id, created_at, client_name, item_name, item_type, price_sold")
        .eq("barber_id", barberId)
        .gte("created_at", `${format(firstDay, "yyyy-MM-dd")}T00:00:00-04:00`)
        .lte("created_at", `${format(lastDay, "yyyy-MM-dd")}T23:59:59-04:00`)
        .order("created_at", { ascending: false }),
    ]);

    if (productionsResponse.error) {
      console.error("Erro ao buscar produções:", productionsResponse.error);
    } else {
      setProductions(productionsResponse.data || []);
    }

    if (salesResponse.error) {
      console.error("Erro ao buscar histórico de vendas:", salesResponse.error);
    } else {
      setSaleHistory(salesResponse.data || []);
    }
    
    setLoading(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value);
  };

  const getServicesTotal = (production: DailyProduction) => {
    if (production.services_basic_total !== null || production.services_extra_total !== null) {
      return (production.services_basic_total || 0) + (production.services_extra_total || 0);
    }
    return production.services_total || 0;
  };

  if (loading) {
    return (
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Meu Histórico de Lançamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Meu Histórico de Lançamentos
        </CardTitle>
        <CardDescription>
          Visualize e confirme seus lançamentos de {format(new Date(selectedYear, selectedMonth - 1), "MMMM 'de' yyyy", { locale: ptBR })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {productions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhum lançamento encontrado para este mês.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Serv. Básicos</TableHead>
                  <TableHead className="text-right">Serv. Extras</TableHead>
                  <TableHead className="text-right">Produtos</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productions.map((production) => (
                  <TableRow key={production.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {format(new Date(production.date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                        {production.confirmed_presence && production.commission_earned === 0 && (
                          production.presence_type === 'day_off' ? (
                            <Badge className="text-xs bg-blue-500/20 text-blue-500 border-blue-500/30">
                              <CalendarOff className="w-3 h-3 mr-1" />Folga
                            </Badge>
                          ) : production.presence_type === 'absence' ? (
                            <Badge className="text-xs bg-red-500/20 text-red-500 border-red-500/30">
                              <XCircle className="w-3 h-3 mr-1" />Falta
                            </Badge>
                          ) : (
                            <Badge className="text-xs bg-orange-500/20 text-orange-500 border-orange-500/30">
                              <UserCheck className="w-3 h-3 mr-1" />Presente
                            </Badge>
                          )
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(production.services_basic_total || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(production.services_extra_total || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(production.products_total || 0)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-success">
                      {formatCurrency(production.commission_earned)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onReview?.(production.date)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Ver e confirmar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-8">
          <h3 className="text-base font-semibold mb-3">Histórico de vendas</h3>
          {saleHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">
              Nenhuma venda encontrada para este mês.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data e hora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Item comprado</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saleHistory.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">
                        {format(new Date(sale.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>{sale.client_name?.trim() || "Cliente não informado"}</TableCell>
                      <TableCell>{sale.item_name}</TableCell>
                      <TableCell className="capitalize">{sale.item_type}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(sale.price_sold || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
