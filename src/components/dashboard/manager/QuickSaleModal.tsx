import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface QuickSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string;
  barberName: string;
  organizationId: string;
  onSuccess: () => void;
}

type SaleType = "basic" | "extra" | "product";

export default function QuickSaleModal({
  open,
  onOpenChange,
  barberId,
  barberName,
  organizationId,
  onSuccess,
}: QuickSaleModalProps) {
  const [value, setValue] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("basic");
  const [clientsCount, setClientsCount] = useState("1");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const numericValue = parseFloat(value.replace(",", "."));
    const numericClients = parseInt(clientsCount) || 1;

    if (isNaN(numericValue) || numericValue <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    setIsLoading(true);

    try {
      const today = new Date().toISOString().split("T")[0];

      // Check if there's already a production for today
      const { data: existingProduction } = await supabase
        .from("daily_productions")
        .select("*")
        .eq("barber_id", barberId)
        .eq("date", today)
        .single();

      if (existingProduction) {
        // Update existing production
        const updateData: Record<string, number> = {
          clients_count: existingProduction.clients_count + numericClients,
        };

        if (saleType === "basic") {
          updateData.services_basic_total =
            (existingProduction.services_basic_total || 0) + numericValue;
          updateData.services_count = existingProduction.services_count + 1;
        } else if (saleType === "extra") {
          updateData.services_extra_total =
            (existingProduction.services_extra_total || 0) + numericValue;
          updateData.services_count = existingProduction.services_count + 1;
        } else {
          updateData.products_total =
            existingProduction.products_total + numericValue;
          updateData.products_count = existingProduction.products_count + 1;
        }

        const { error } = await supabase
          .from("daily_productions")
          .update(updateData)
          .eq("id", existingProduction.id);

        if (error) throw error;
      } else {
        // Create new production
        const { error } = await supabase
          .from("daily_productions")
          .insert({
            barber_id: barberId,
            organization_id: organizationId,
            date: today,
            clients_count: numericClients,
            services_count: saleType !== "product" ? 1 : 0,
            products_count: saleType === "product" ? 1 : 0,
            services_basic_total: saleType === "basic" ? numericValue : 0,
            services_extra_total: saleType === "extra" ? numericValue : 0,
            products_total: saleType === "product" ? numericValue : 0,
          });

        if (error) throw error;
      }

      toast.success(`Venda registrada para ${barberName}`);
      setValue("");
      setClientsCount("1");
      setSaleType("basic");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error registering sale:", error);
      toast.error("Erro ao registrar venda");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Venda Rápida - {barberName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="value">Valor (R$)</Label>
            <Input
              id="value"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="text-2xl font-bold text-center h-14"
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <Label>Tipo de Venda</Label>
            <RadioGroup
              value={saleType}
              onValueChange={(v) => setSaleType(v as SaleType)}
              className="grid grid-cols-3 gap-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="basic" id="basic" />
                <Label htmlFor="basic" className="cursor-pointer text-sm">
                  Serviço Básico
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="extra" id="extra" />
                <Label htmlFor="extra" className="cursor-pointer text-sm">
                  Serviço Extra
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="product" id="product" />
                <Label htmlFor="product" className="cursor-pointer text-sm">
                  Produto
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clients">Clientes Atendidos</Label>
            <Input
              id="clients"
              type="number"
              min="1"
              value={clientsCount}
              onChange={(e) => setClientsCount(e.target.value)}
              className="w-24"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Registrar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
