import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Calendar, DollarSign } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dailyProductionSchema, type DailyProductionFormData } from "@/lib/validations/production";
import { getTodayString } from "@/lib/dateUtils";
import DivergenceModal from "./DivergenceModal";

interface DailyProductionFormProps {
  barberId: string;
  organizationId: string;
  onSuccess: () => void;
  initialData?: {
    id?: string;
    date: string;
    servicesBasicTotal: string;
    servicesExtraTotal: string;
    productsTotal: string;
    clientsCount: string;
    servicesCount: string;
    productsCount: string;
  };
}

export default function DailyProductionForm({ barberId, organizationId, onSuccess, initialData }: DailyProductionFormProps) {
  const [loading, setLoading] = useState(false);
  const [divergenceModal, setDivergenceModal] = useState<{
    open: boolean;
    manualTotal: number;
    txTotal: number;
    hasDivergence: boolean;
  }>({ open: false, manualTotal: 0, txTotal: 0, hasDivergence: false });

  // Formulário sempre começa ZERADO (caráter educativo)
  // Os valores do gestor (tx_*) NÃO são pré-preenchidos
  const form = useForm<DailyProductionFormData>({
    resolver: zodResolver(dailyProductionSchema),
    defaultValues: {
      date: initialData?.date || getTodayString(),
      // Quando editando, mostrar valores MANUAIS existentes
      // Quando criando novo, sempre começar zerado
      servicesBasicTotal: initialData ? Number(initialData.servicesBasicTotal) || 0 : 0,
      servicesExtraTotal: initialData ? Number(initialData.servicesExtraTotal) || 0 : 0,
      productsTotal: initialData ? Number(initialData.productsTotal) || 0 : 0,
      clientsCount: initialData ? Number(initialData.clientsCount) || 0 : 0,
      servicesCount: initialData ? Number(initialData.servicesCount) || 0 : 0,
      productsCount: initialData ? Number(initialData.productsCount) || 0 : 0,
    },
  });

  // Atualizar form quando initialData mudar (edição)
  useEffect(() => {
    if (initialData) {
      form.reset({
        date: initialData.date,
        servicesBasicTotal: Number(initialData.servicesBasicTotal) || 0,
        servicesExtraTotal: Number(initialData.servicesExtraTotal) || 0,
        productsTotal: Number(initialData.productsTotal) || 0,
        clientsCount: Number(initialData.clientsCount) || 0,
        servicesCount: Number(initialData.servicesCount) || 0,
        productsCount: Number(initialData.productsCount) || 0,
      });
    }
  }, [initialData, form]);

  const handleSubmit = async (data: DailyProductionFormData) => {
    setLoading(true);

    try {
      // Calcular total MANUAL declarado pelo barbeiro
      const manualTotal = data.servicesBasicTotal + data.servicesExtraTotal + data.productsTotal;

      // Buscar dados existentes para comparar com tx_* (Ao Vivo)
      const { data: existingProduction } = await supabase
        .from("daily_productions")
        .select("tx_basic_total, tx_extra_total, tx_products_total")
        .eq("barber_id", barberId)
        .eq("date", data.date)
        .maybeSingle();

      // Calcular total do gestor (Ao Vivo)
      const txTotal = existingProduction 
        ? (Number(existingProduction.tx_basic_total) || 0) + 
          (Number(existingProduction.tx_extra_total) || 0) + 
          (Number(existingProduction.tx_products_total) || 0)
        : 0;

      // Gravar nos campos MANUAIS (o valor OFICIAL para comissão)
      // E também atualizar os campos legados para exibição em dashboards
      const { error } = await supabase
        .from("daily_productions")
        .upsert({
          date: data.date,
          barber_id: barberId,
          organization_id: organizationId,
          // Campos MANUAIS (declaração do barbeiro)
          manual_basic_total: data.servicesBasicTotal,
          manual_extra_total: data.servicesExtraTotal,
          manual_products_total: data.productsTotal,
          manual_clients_count: data.clientsCount,
          manual_services_count: data.servicesCount,
          manual_products_count: data.productsCount,
          // Campos legados (valor OFICIAL = manual)
          services_basic_total: data.servicesBasicTotal,
          services_extra_total: data.servicesExtraTotal,
          products_total: data.productsTotal,
          clients_count: data.clientsCount,
          services_count: data.servicesCount,
          products_count: data.productsCount,
        }, {
          onConflict: "date,barber_id"
        });

      if (error) throw error;

      // Verificar divergência (> 5% de diferença)
      const divergenceThreshold = 0.05; // 5%
      let hasDivergence = false;

      if (txTotal > 0) {
        const percentDiff = Math.abs((manualTotal - txTotal) / txTotal);
        hasDivergence = percentDiff > divergenceThreshold;
      }

      // Mostrar modal de feedback (divergência ou fechamento perfeito)
      if (txTotal > 0) {
        setDivergenceModal({
          open: true,
          manualTotal,
          txTotal,
          hasDivergence
        });
      } else {
        // Sem dados do gestor para comparar - sucesso simples
        toast.success(initialData ? "Produção atualizada com sucesso!" : "Produção registrada com sucesso!");
      }
      
      // Limpar apenas se não está editando
      if (!initialData) {
        form.reset({
          date: getTodayString(),
          servicesBasicTotal: 0,
          servicesExtraTotal: 0,
          productsTotal: 0,
          clientsCount: 0,
          servicesCount: 0,
          productsCount: 0,
        });
      }
      
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar produção");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDivergenceModal = () => {
    setDivergenceModal(prev => ({ ...prev, open: false }));
  };

  return (
    <>
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            {initialData ? "Editar Produção Diária" : "Lançamento de Produção Diária"}
          </CardTitle>
          <CardDescription>
            {initialData ? "Corrija os dados do lançamento" : "Registre sua produção do dia"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Data
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="servicesBasicTotal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total em Serviços Básicos (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="servicesExtraTotal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total em Serviços Extras (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="productsTotal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total em Produtos (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="clientsCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qtd. Clientes</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="servicesCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qtd. Serviços Extras</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="productsCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qtd. Produtos</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando..." : "Salvar Lançamento"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <DivergenceModal
        open={divergenceModal.open}
        onClose={handleCloseDivergenceModal}
        manualTotal={divergenceModal.manualTotal}
        txTotal={divergenceModal.txTotal}
        hasDivergence={divergenceModal.hasDivergence}
      />
    </>
  );
}
