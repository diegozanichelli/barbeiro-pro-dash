import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calculator, Calendar, DollarSign, TrendingUp, Users } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getManausDate } from "@/lib/dateUtils";

interface BarberPayrollData {
  barberId: string;
  barberName: string;
  unitName: string;
  subscriptionCommissionRate: number;
  // Faturamento
  totalServices: number;
  totalProducts: number;
  totalSubscriptions: number;
  totalRevenue: number;
  // Comissões
  productionCommission: number; // Serviços + Produtos (já calculadas)
  subscriptionCommission: number; // Total Assinaturas * Taxa
  totalToPay: number;
}

export default function MonthlyPayroll() {
  const now = getManausDate();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const startDate = startOfMonth(new Date(selectedYear, selectedMonth - 1));
  const endDate = endOfMonth(new Date(selectedYear, selectedMonth - 1));

  // Buscar barbeiros com suas taxas
  const { data: barbers = [], isLoading: loadingBarbers } = useQuery({
    queryKey: ["barbers-payroll"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barbers")
        .select("id, name, subscription_commission_rate, units(name)")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Buscar produções do mês (comissões já calculadas)
  const { data: productions = [], isLoading: loadingProductions } = useQuery({
    queryKey: ["payroll-productions", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_productions")
        .select("barber_id, services_basic_total, services_extra_total, products_total, commission_earned")
        .gte("date", format(startDate, "yyyy-MM-dd"))
        .lte("date", format(endDate, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
  });

  // Buscar vendas de assinaturas do mês
  const { data: subscriptionSales = [], isLoading: loadingSubscriptions } = useQuery({
    queryKey: ["payroll-subscriptions", selectedMonth, selectedYear],
    queryFn: async () => {
      const startDateStr = format(startDate, "yyyy-MM-dd");
      const endDateStr = format(endDate, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("sale_transactions")
        .select("barber_id, price_sold")
        .eq("item_type", "subscription")
        .gte("created_at", startDateStr)
        .lte("created_at", endDateStr + "T23:59:59");
      if (error) throw error;
      return data || [];
    },
  });

  // Calcular dados do payroll
  const payrollData: BarberPayrollData[] = useMemo(() => {
    return barbers.map((barber) => {
      // Filtrar produções do barbeiro
      const barberProductions = productions.filter((p) => p.barber_id === barber.id);
      
      // Somar valores de produção
      const totalServices = barberProductions.reduce(
        (sum, p) => sum + (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0),
        0
      );
      const totalProducts = barberProductions.reduce(
        (sum, p) => sum + (Number(p.products_total) || 0),
        0
      );
      const productionCommission = barberProductions.reduce(
        (sum, p) => sum + (Number(p.commission_earned) || 0),
        0
      );

      // Somar vendas de assinaturas
      const barberSubscriptions = subscriptionSales.filter((s) => s.barber_id === barber.id);
      const totalSubscriptions = barberSubscriptions.reduce(
        (sum, s) => sum + (Number(s.price_sold) || 0),
        0
      );

      // Calcular comissão de assinaturas com a taxa do barbeiro
      const subscriptionRate = Number(barber.subscription_commission_rate) || 0;
      const subscriptionCommission = (totalSubscriptions * subscriptionRate) / 100;

      // Total a pagar
      const totalToPay = productionCommission + subscriptionCommission;

      return {
        barberId: barber.id,
        barberName: barber.name,
        unitName: (barber.units as any)?.name || "-",
        subscriptionCommissionRate: subscriptionRate,
        totalServices,
        totalProducts,
        totalSubscriptions,
        totalRevenue: totalServices + totalProducts + totalSubscriptions,
        productionCommission,
        subscriptionCommission,
        totalToPay,
      };
    });
  }, [barbers, productions, subscriptionSales]);

  // Totais gerais
  const totals = useMemo(() => {
    return payrollData.reduce(
      (acc, b) => ({
        revenue: acc.revenue + b.totalRevenue,
        production: acc.production + b.productionCommission,
        subscriptions: acc.subscriptions + b.subscriptionCommission,
        total: acc.total + b.totalToPay,
      }),
      { revenue: 0, production: 0, subscriptions: 0, total: 0 }
    );
  }, [payrollData]);

  const isLoading = loadingBarbers || loadingProductions || loadingSubscriptions;

  const months = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
  ];

  const years = [2024, 2025, 2026, 2027];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Header com seletores */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" />
                Fechamento Mensal (Payroll)
              </CardTitle>
              <CardDescription>
                Cálculo da folha de pagamento por barbeiro
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={String(selectedMonth)}
                onValueChange={(v) => setSelectedMonth(Number(v))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => setSelectedYear(Number(v))}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Faturamento Total</p>
                <p className="text-xl font-bold">{formatCurrency(totals.revenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">A Pagar Dia 01</p>
                <p className="text-xl font-bold text-blue-500">
                  {formatCurrency(totals.production)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Calendar className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">A Pagar Dia 15</p>
                <p className="text-xl font-bold text-purple-500">
                  {formatCurrency(totals.subscriptions)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <DollarSign className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total a Pagar</p>
                <p className="text-xl font-bold text-green-500">
                  {formatCurrency(totals.total)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Fechamento */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />
            Detalhamento por Barbeiro
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barbeiro</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">
                      <div className="flex flex-col items-end">
                        <span>Faturamento</span>
                        <span className="text-xs text-muted-foreground">(Cadeira)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-blue-500">A Pagar Dia 01</span>
                        <span className="text-xs text-muted-foreground">(Produção)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-purple-500">A Pagar Dia 15</span>
                        <span className="text-xs text-muted-foreground">(Assinaturas)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-green-500 font-bold">Total</span>
                        <span className="text-xs text-muted-foreground">a Pagar</span>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollData.map((barber) => (
                    <TableRow key={barber.barberId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{barber.barberName}</span>
                          {barber.subscriptionCommissionRate > 0 && (
                            <Badge variant="outline" className="w-fit mt-1 text-xs">
                              Assin: {barber.subscriptionCommissionRate}%
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {barber.unitName}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-medium">
                            {formatCurrency(barber.totalRevenue)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            S: {formatCurrency(barber.totalServices)} | 
                            P: {formatCurrency(barber.totalProducts)} | 
                            A: {formatCurrency(barber.totalSubscriptions)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium text-blue-500">
                          {formatCurrency(barber.productionCommission)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium text-purple-500">
                          {formatCurrency(barber.subscriptionCommission)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-bold text-green-500 text-lg">
                          {formatCurrency(barber.totalToPay)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Linha de Totais */}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={2}>TOTAL GERAL</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.revenue)}
                    </TableCell>
                    <TableCell className="text-right text-blue-500">
                      {formatCurrency(totals.production)}
                    </TableCell>
                    <TableCell className="text-right text-purple-500">
                      {formatCurrency(totals.subscriptions)}
                    </TableCell>
                    <TableCell className="text-right text-green-500 text-lg">
                      {formatCurrency(totals.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
