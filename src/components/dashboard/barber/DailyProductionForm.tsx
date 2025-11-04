import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Calendar, DollarSign } from "lucide-react";
import { format } from "date-fns";

interface DailyProductionFormProps {
  barberId: string;
  onSuccess: () => void;
}

export default function DailyProductionForm({ barberId, onSuccess }: DailyProductionFormProps) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    servicesBasicTotal: "",
    servicesExtraTotal: "",
    productsTotal: "",
    clientsCount: "",
    servicesCount: "",
    productsCount: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          date,
          barber_id: barberId,
          organization_id: barberData.organization_id,
          services_basic_total: Number(formData.servicesBasicTotal) || 0,
          services_extra_total: Number(formData.servicesExtraTotal) || 0,
          products_total: Number(formData.productsTotal) || 0,
          clients_count: Number(formData.clientsCount) || 0,
          services_count: Number(formData.servicesCount) || 0,
          products_count: Number(formData.productsCount) || 0,
        }, {
          onConflict: "date,barber_id"
        });

      if (error) throw error;

      toast.success("Produção registrada com sucesso!");
      setFormData({
        servicesBasicTotal: "",
        servicesExtraTotal: "",
        productsTotal: "",
        clientsCount: "",
        servicesCount: "",
        productsCount: "",
      });
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
          Lançamento de Produção Diária
        </CardTitle>
        <CardDescription>Registre sua produção do dia</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="date" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Data
            </Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="servicesBasicTotal">Total em Serviços Básicos (R$)</Label>
              <Input
                id="servicesBasicTotal"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.servicesBasicTotal}
                onChange={(e) => setFormData({ ...formData, servicesBasicTotal: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicesExtraTotal">Total em Serviços Extras (R$)</Label>
              <Input
                id="servicesExtraTotal"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.servicesExtraTotal}
                onChange={(e) => setFormData({ ...formData, servicesExtraTotal: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="productsTotal">Total em Produtos (R$)</Label>
            <Input
              id="productsTotal"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.productsTotal}
              onChange={(e) => setFormData({ ...formData, productsTotal: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientsCount">Qtd. Clientes</Label>
              <Input
                id="clientsCount"
                type="number"
                placeholder="0"
                value={formData.clientsCount}
                onChange={(e) => setFormData({ ...formData, clientsCount: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicesCount">Qtd. Serviços Extras</Label>
              <Input
                id="servicesCount"
                type="number"
                placeholder="0"
                value={formData.servicesCount}
                onChange={(e) => setFormData({ ...formData, servicesCount: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productsCount">Qtd. Produtos</Label>
              <Input
                id="productsCount"
                type="number"
                placeholder="0"
                value={formData.productsCount}
                onChange={(e) => setFormData({ ...formData, productsCount: e.target.value })}
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : "Salvar Lançamento"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
