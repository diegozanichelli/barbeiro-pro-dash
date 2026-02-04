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

interface DailyProductionFormProps {
  barberId: string;
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

export default function DailyProductionForm({ barberId, onSuccess, initialData }: DailyProductionFormProps) {
  const [loading, setLoading] = useState(false);

  const form = useForm<DailyProductionFormData>({
    resolver: zodResolver(dailyProductionSchema),
    defaultValues: {
      date: initialData?.date || getTodayString(),
      servicesBasicTotal: Number(initialData?.servicesBasicTotal) || 0,
      servicesExtraTotal: Number(initialData?.servicesExtraTotal) || 0,
      productsTotal: Number(initialData?.productsTotal) || 0,
      clientsCount: Number(initialData?.clientsCount) || 0,
      servicesCount: Number(initialData?.servicesCount) || 0,
      productsCount: Number(initialData?.productsCount) || 0,
    },
  });

  // Atualizar form quando initialData mudar
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
      // Buscar organization_id do barbeiro
      const { data: barberData } = await supabase
        .from("barbers")
        .select("organization_id")
        .eq("id", barberId)
        .single();

      if (!barberData?.organization_id) {
        toast.error("Erro: barbeiro sem organização vinculada");
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("daily_productions")
        .upsert({
          date: data.date,
          barber_id: barberId,
          organization_id: barberData.organization_id,
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

      toast.success(initialData ? "Produção atualizada com sucesso!" : "Produção registrada com sucesso!");
      
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

  return (
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
  );
}
