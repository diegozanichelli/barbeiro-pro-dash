import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Users, Crown, Phone } from "lucide-react";
import { formatPhone } from "@/lib/phoneUtils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOrganization } from "@/hooks/useOrganization";
import ClientDetailModal from "./ClientDetailModal";

interface Client {
  id: string;
  name: string;
  mobile_phone: string;
  subscription_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PlanInfo {
  id: string;
  name: string;
  price: number;
}

export default function ClientsManagement() {
  const { organizationId } = useOrganization();
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (organizationId) fetchData();
  }, [organizationId]);

  const fetchData = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [clientsRes, plansRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, mobile_phone, subscription_plan_id, created_at, updated_at")
          .eq("organization_id", organizationId)
          .order("name"),
        supabase
          .from("subscription_plans")
          .select("id, name, price")
          .eq("organization_id", organizationId)
          .eq("active", true),
      ]);

      setClients((clientsRes.data || []) as Client[]);
      setPlans(plansRes.data || []);
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    } finally {
      setLoading(false);
    }
  };

  const planMap = new Map(plans.map((p) => [p.id, p]));

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.mobile_phone.includes(q.replace(/\D/g, ""))
    );
  });

  const handleClientClick = (client: Client) => {
    setSelectedClient(client);
    setModalOpen(true);
  };

  const subscribedCount = clients.filter((c) => c.subscription_plan_id).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            {clients.length} clientes • {subscribedCount} assinantes
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm">
              {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((client) => {
            const plan = client.subscription_plan_id
              ? planMap.get(client.subscription_plan_id)
              : null;

            return (
              <Card
                key={client.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleClientClick(client)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{client.name}</span>
                      {plan && (
                        <Badge variant="secondary" className="gap-1 text-xs shrink-0">
                          <Crown className="w-3 h-3" />
                          {plan.name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {formatPhone(client.mobile_phone)}
                      </span>
                      <span>
                        Desde {format(new Date(client.created_at), "dd/MM/yy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ClientDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        client={selectedClient}
        organizationId={organizationId || ""}
        onUpdated={fetchData}
      />
    </div>
  );
}
