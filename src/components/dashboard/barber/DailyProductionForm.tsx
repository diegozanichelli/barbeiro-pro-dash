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

// Helper component for mobile-friendly numeric input
function MobileNumericInput({
  value,
  onChange,
  placeholder,
  isDecimal = false,
  ...props
}: {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  isDecimal?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [displayValue, setDisplayValue] = useState(value === 0 ? "" : isDecimal ? value.toFixed(2) : String(value));

  useEffect(() => {
    // Sync when external value changes (e.g. form reset)
    setDisplayValue(value === 0 ? "" : isDecimal ? value.toFixed(2) : String(value));
  }, [value, isDecimal]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all text on focus for easy replacement
    setTimeout(() => e.target.select(), 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    if (raw === "") {
      setDisplayValue("");
      onChange(0);
      return;
    }

    // Allow digits, comma, dot
    const cleaned = raw.replace(/[^\d.,]/g, "");
    setDisplayValue(cleaned);

    const parsed = parseFloat(cleaned.replace(",", "."));
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    // Format on blur
    if (displayValue === "" || displayValue === "0") {
      setDisplayValue("");
      onChange(0);
      return;
    }
    const parsed = parseFloat(displayValue.replace(",", ".")) || 0;
    onChange(parsed);
    setDisplayValue(parsed === 0 ? "" : isDecimal ? parsed.toFixed(2) : String(parsed));
  };

  return (
    <Input
      type="text"
      inputMode={isDecimal ? "decimal" : "numeric"}
      pattern={isDecimal ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder || (isDecimal ? "0,00" : "0")}
      autoComplete="off"
      {...props}
    />
  );
}

export default function DailyProductionForm({ barberId, organizationId, onSuccess, initialData }: DailyProductionFormProps) {
  const [loading, setLoading] = useState(false);
  const [divergenceModal, setDivergenceModal] = useState<{
    open: boolean;
    manualTotal: number;
    txTotal: number;
    hasDivergence: boolean;
  }>({ open: false, manualTotal: 0, txTotal: 0, hasDivergence: false });

  const form = useForm<DailyProductionFormData>({
    resolver: zodResolver(dailyProductionSchema),
    defaultValues: {
      date: initialData?.date || getTodayString(),
      servicesBasicTotal: initialData ? Number(initialData.servicesBasicTotal) || 0 : 0,
      servicesExtraTotal: initialData ? Number(initialData.servicesExtraTotal) || 0 : 0,
      productsTotal: initialData ? Number(initialData.productsTotal) || 0 : 0,
      clientsCount: initialData ? Number(initialData.clientsCount) || 0 : 0,
      servicesCount: initialData ? Number(initialData.servicesCount) || 0 : 0,
      productsCount: initialData ? Number(initialData.productsCount) || 0 : 0,
    },
  });

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
      const manualTotal = data.servicesBasicTotal + data.servicesExtraTotal + data.productsTotal;

      const { data: existingProduction } = await supabase
        .from("daily_productions")
        .select("tx_basic_total, tx_extra_total, tx_products_total")
        .eq("barber_id", barberId)
        .eq("date", data.date)
        .maybeSingle();

      const txTotal = existingProduction 
        ? (Number(existingProduction.tx_basic_total) || 0) + 
          (Number(existingProduction.tx_extra_total) || 0) + 
          (Number(existingProduction.tx_products_total) || 0)
        : 0;

      const { error } = await supabase
        .from("daily_productions")
        .upsert({
          date: data.date,
          barber_id: barberId,
          organization_id: organizationId,
          manual_basic_total: data.servicesBasicTotal,
          manual_extra_total: data.servicesExtraTotal,
          manual_products_total: data.productsTotal,
          manual_clients_count: data.clientsCount,
          manual_services_count: data.servicesCount,
          manual_products_count: data.productsCount,
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

      const divergenceThreshold = 0.05;
      let hasDivergence = false;

      if (txTotal > 0) {
        const percentDiff = Math.abs((manualTotal - txTotal) / txTotal);
        hasDivergence = percentDiff > divergenceThreshold;
      }

      if (txTotal > 0) {
        setDivergenceModal({
          open: true,
          manualTotal,
          txTotal,
          hasDivergence
        });
      } else {
        toast.success(initialData ? "Produção atualizada com sucesso!" : "Produção registrada com sucesso!");
      }
      
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
                        <MobileNumericInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="0,00"
                          isDecimal
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
                        <MobileNumericInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="0,00"
                          isDecimal
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
                      <MobileNumericInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="0,00"
                        isDecimal
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
                        <MobileNumericInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="0"
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
                        <MobileNumericInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="0"
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
                        <MobileNumericInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="0"
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
