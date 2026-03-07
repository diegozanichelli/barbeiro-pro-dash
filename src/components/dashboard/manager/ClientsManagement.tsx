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
  const CLIENTS_PER_PAGE = 30;
  const { organizationId } = useOrganization();
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (organizationId) fetchData();
  }, [organizationId]);

  const fetchData = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      // Fetch all clients (handle > 1000 rows via pagination)
      let allClients: Client[] = [];
      let from = 0;
      const PAGE_SIZE = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("clients")
          .select("id, name, mobile_phone, subscription_plan_id, created_at, updated_at")
          .eq("organization_id", organizationId)
          .order("name")
          .range(from, from + PAGE_SIZE - 1);
        
        if (error) throw error;
        allClients = [...allClients, ...(data || [])];
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const { data: plansData } = await supabase
        .from("subscription_plans")
        .select("id, name, price")
        .eq("organization_id", organizationId)
        .eq("active", true);

      setClients(allClients as Client[]);
      setPlans(plansData || []);
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    } finally {
      setLoading(false);
    }
  };

  const planMap = new Map(plans.map((p) => [p.id, p]));

  const normalize = (str: string) =>
    str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filtered = clients.filter((c) => {
    const q = search.trim();
    if (!q) return true;
    const qNorm = normalize(q);
    const nameMatch = normalize(c.name || "").includes(qNorm);
    const digitsOnly = q.replace(/\D/g, "");
    const phoneMatch = digitsOnly.length > 0 && (c.mobile_phone || "").includes(digitsOnly);
    return nameMatch || phoneMatch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / CLIENTS_PER_PAGE));
  const pageStart = (currentPage - 1) * CLIENTS_PER_PAGE;
  const paginatedClients = filtered.slice(pageStart, pageStart + CLIENTS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, organizationId]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
        <>
        <div className="grid gap-2">
          {paginatedClients.map((client) => {
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

        {filtered.length > CLIENTS_PER_PAGE && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Mostrando {pageStart + 1}–{Math.min(pageStart + CLIENTS_PER_PAGE, filtered.length)} de {filtered.length} clientes
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </button>
              <span className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
        </>
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
