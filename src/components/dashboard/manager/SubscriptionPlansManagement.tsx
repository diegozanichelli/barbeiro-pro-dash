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

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

export default function SubscriptionPlansManagement() {
  const { organizationId } = useOrganization();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);

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
  }, [organizationId]);

  const handleSave = async (name: string, price: number) => {
    if (!organizationId) return;

    if (editingPlan) {
      const { error } = await supabase
        .from("subscription_plans")
        .update({ name, price })
        .eq("id", editingPlan.id);
      if (error) throw error;
      toast.success("Plano atualizado!");
    } else {
      const { error } = await supabase
        .from("subscription_plans")
        .insert({ name, price, organization_id: organizationId });
      if (error) throw error;
      toast.success("Plano criado!");
    }
    fetchPlans();
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
                  <TableCell>R$ {Number(plan.price).toFixed(2)}</TableCell>
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
        onSave={handleSave}
      />
    </Card>
  );
}
