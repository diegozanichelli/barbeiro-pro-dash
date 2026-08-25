import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, CreditCard } from "lucide-react";
import SubscriptionPlanModal from "./SubscriptionPlanModal";
import { useOrganization } from "@/hooks/useOrganization";
import { brl } from "@/lib/currency";

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

interface CatalogService {
  id: string;
  name: string;
}

export default function SubscriptionPlansManagement() {
  const { organizationId } = useOrganization();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [availableServices, setAvailableServices] = useState<CatalogService[]>([]);
  const [planServiceIds, setPlanServiceIds] = useState<Record<string, string[]>>({});

  const fetchPlans = async () => {
    if (!organizationId) return;
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("id, name, price, active")
      .eq("organization_id", organizationId)
      .order("name");

    if (error) {
      toast.error("Erro ao carregar planos");
    } else {
      setPlans(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
    fetchServices();
    fetchPlanServiceLinks();
  }, [organizationId]);

  const fetchServices = async () => {
    if (!organizationId) return;
    const { data, error } = await supabase
      .from("catalog_services")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name");

    if (error) {
      toast.error("Erro ao carregar serviços");
      return;
    }

    setAvailableServices(data || []);
  };

  const fetchPlanServiceLinks = async () => {
    if (!organizationId) return;

    const { data, error } = await supabase
      .from("subscription_plan_services")
      .select("subscription_plan_id, catalog_service_id")
      .eq("organization_id", organizationId);

    if (error) {
      console.error("Erro ao carregar vínculos de planos:", error);
      return;
    }

    const grouped = (data || []).reduce<Record<string, string[]>>((acc, row) => {
      if (!acc[row.subscription_plan_id]) acc[row.subscription_plan_id] = [];
      acc[row.subscription_plan_id].push(row.catalog_service_id);
      return acc;
    }, {});

    setPlanServiceIds(grouped);
  };

  const handleSave = async (name: string, price: number, serviceIds: string[]) => {
    if (!organizationId) return;

    let planId = editingPlan?.id;

    if (editingPlan) {
      const { error } = await supabase
        .from("subscription_plans")
        .update({ name, price })
        .eq("id", editingPlan.id);
      if (error) throw error;
      toast.success("Plano atualizado!");
    } else {
      const { data: insertedPlan, error } = await supabase
        .from("subscription_plans")
        .insert({ name, price, organization_id: organizationId })
        .select("id")
        .single();
      if (error) throw error;
      if (insertedPlan?.id) planId = insertedPlan.id;
      toast.success("Plano criado!");
    }

    if (planId) {
      const { error: deleteError } = await supabase
        .from("subscription_plan_services")
        .delete()
        .eq("subscription_plan_id", planId);

      if (deleteError) throw deleteError;

      if (serviceIds.length > 0) {
        const payload = serviceIds.map((serviceId) => ({
          organization_id: organizationId,
          subscription_plan_id: planId,
          catalog_service_id: serviceId,
        }));

        const { error: insertError } = await supabase
          .from("subscription_plan_services")
          .insert(payload);

        if (insertError) throw insertError;
      }
    }

    fetchPlans();
    fetchPlanServiceLinks();
  };

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    const { error } = await supabase
      .from("subscription_plans")
      .update({ active: !plan.active })
      .eq("id", plan.id);

    if (error) {
      toast.error("Erro ao atualizar status");
    } else {
      toast.success(plan.active ? "Plano desativado" : "Plano ativado");
      fetchPlans();
    }
  };

  const openCreate = () => {
    setEditingPlan(null);
    setModalOpen(true);
  };

  const openEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setModalOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Planos de Assinatura
          </CardTitle>
          <CardDescription>Cadastre os planos disponíveis para venda</CardDescription>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Plano
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
        ) : plans.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Nenhum plano cadastrado</p>
            <p className="text-xs mt-1">Clique em "Novo Plano" para começar</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>{brl(Number(plan.price))}</TableCell>
                  <TableCell>
                    <Switch
                      checked={plan.active}
                      onCheckedChange={() => handleToggleActive(plan)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(plan)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <SubscriptionPlanModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        plan={editingPlan}
        availableServices={availableServices}
        initialServiceIds={editingPlan ? (planServiceIds[editingPlan.id] || []) : []}
        onSave={handleSave}
      />
    </Card>
  );
}
