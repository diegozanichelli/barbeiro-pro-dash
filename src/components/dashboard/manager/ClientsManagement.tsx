import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Search,
  Users,
  Crown,
  Phone,
  AlertTriangle,
  PhoneOff,
  UserX,
  RefreshCw,
  CreditCard,
  ArrowUpDown,
  Database,
} from "lucide-react";
import { formatPhone, isValidPhone } from "@/lib/phoneUtils";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOrganization } from "@/hooks/useOrganization";
import ClientDetailModal from "./ClientDetailModal";
import SubscriptionWizardModal from "./SubscriptionWizardModal";
import MigratedClientModal from "./MigratedClientModal";

interface Client {
  id: string;
  name: string;
  mobile_phone: string;
  subscription_plan_id: string | null;
  subscription_started_at: string | null;
  subscription_unit_id: string | null;
  migrated_from_legacy: boolean | null;
  created_at: string;
  updated_at: string;
}

interface PlanInfo {
  id: string;
  name: string;
  price: number;
}

type FilterKey = "all" | "no_phone" | "incomplete_name" | "overdue";

const OVERDUE_DAYS = 30;
const SUB_PAID_ACTIONS = new Set(["new", "renew", "upgrade", "downgrade"]);

export default function ClientsManagement() {
  const CLIENTS_PER_PAGE = 30;
  const { organizationId } = useOrganization();
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [lastSubByPhone, setLastSubByPhone] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<{
    phone: string;
    name: string;
    action: "new" | "renew" | "upgrade" | "downgrade";
    planId: string | null;
  } | null>(null);

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

      // Fetch latest subscription payments per phone (paginated, desc by created_at)
      const subMap = new Map<string, string>();
      let subFrom = 0;
      let subHasMore = true;
      while (subHasMore) {
        const { data: subs, error: subErr } = await supabase
          .from("sale_transactions")
          .select("mobile_phone, created_at, subscription_action")
          .eq("organization_id", organizationId)
          .eq("item_type", "subscription")
          .not("mobile_phone", "is", null)
          .order("created_at", { ascending: false })
          .range(subFrom, subFrom + PAGE_SIZE - 1);
        if (subErr) throw subErr;
        for (const tx of subs || []) {
          if (!tx.mobile_phone) continue;
          if (tx.subscription_action && !SUB_PAID_ACTIONS.has(tx.subscription_action)) continue;
          if (!subMap.has(tx.mobile_phone)) {
            subMap.set(tx.mobile_phone, tx.created_at);
          }
        }
        subHasMore = (subs?.length || 0) === PAGE_SIZE;
        subFrom += PAGE_SIZE;
      }

      setClients(allClients as Client[]);
      setPlans(plansData || []);
      setLastSubByPhone(subMap);
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    } finally {
      setLoading(false);
    }
  };

  const planMap = new Map(plans.map((p) => [p.id, p]));

  const normalize = (str: string) =>
    str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const isIncompleteName = (name: string) => {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length < 2 || parts[0].length < 2;
  };

  const isNoPhone = (phone: string) => !phone || !isValidPhone(phone);

  const isOverdue = (c: Client): boolean => {
    if (!c.subscription_plan_id) return false;
    const last = c.mobile_phone ? lastSubByPhone.get(c.mobile_phone) : undefined;
    if (!last) return true;
    const days = differenceInCalendarDays(new Date(), new Date(last));
    return days > OVERDUE_DAYS;
  };

  const counts = useMemo(() => {
    let noPhone = 0;
    let incomplete = 0;
    let overdue = 0;
    for (const c of clients) {
      if (isNoPhone(c.mobile_phone)) noPhone++;
      if (isIncompleteName(c.name)) incomplete++;
      if (isOverdue(c)) overdue++;
    }
    return { noPhone, incomplete, overdue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, lastSubByPhone]);

  const hasSearch = search.trim().length > 0;

  const filtered = clients.filter((c) => {
    if (!hasSearch) {
      if (filter === "no_phone" && !isNoPhone(c.mobile_phone)) return false;
      if (filter === "incomplete_name" && !isIncompleteName(c.name)) return false;
      if (filter === "overdue" && !isOverdue(c)) return false;
      return true;
    }

    const q = search.trim();
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
  }, [search, organizationId, filter]);

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

  const filterButtons: { key: FilterKey; label: string; count: number; icon?: any; alert?: boolean }[] = [
    { key: "all", label: "Todos", count: clients.length },
    { key: "no_phone", label: "Sem telefone", count: counts.noPhone, icon: PhoneOff },
    { key: "incomplete_name", label: "Nome incompleto", count: counts.incomplete, icon: UserX },
    { key: "overdue", label: `Inadimplentes >${OVERDUE_DAYS}d`, count: counts.overdue, icon: AlertTriangle, alert: true },
  ];

  const renderOverdueBadge = (c: Client) => {
    if (!isOverdue(c)) return null;
    const last = c.mobile_phone ? lastSubByPhone.get(c.mobile_phone) : undefined;
    const days = last ? differenceInCalendarDays(new Date(), new Date(last)) : null;
    return (
      <Badge variant="destructive" className="gap-1 text-xs shrink-0">
        <AlertTriangle className="w-3 h-3" />
        {days !== null ? `${days}d sem pagar` : "Sem pagamento"}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap gap-2">
        {filterButtons.map((f) => {
          const active = filter === f.key;
          const Icon = f.icon;
          const showAsDanger = f.alert && f.count > 0 && !active;
          return (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={active ? "default" : showAsDanger ? "destructive" : "outline"}
              onClick={() => setFilter(f.key)}
              className="gap-2 h-9"
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {f.label}
              <Badge
                variant={active ? "secondary" : "outline"}
                className="ml-1 text-[10px] px-1.5 py-0"
              >
                {f.count}
              </Badge>
            </Button>
          );
        })}
      </div>

      {hasSearch && filter !== "all" && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between gap-2">
          <span>
            Busca ativa — mostrando resultados em <strong>todos os clientes</strong>, ignorando o filtro{" "}
            <strong>{filterButtons.find((b) => b.key === filter)?.label}</strong>.
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs shrink-0"
            onClick={() => setSearch("")}
          >
            Limpar busca
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm">
              {hasSearch
                ? `Nenhum cliente encontrado para "${search.trim()}"`
                : filter !== "all"
                ? "Nenhum cliente neste filtro"
                : "Nenhum cliente cadastrado ainda"}
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
            const noPhone = isNoPhone(client.mobile_phone);
            const incompleteName = isIncompleteName(client.name);

            return (
              <Card
                key={client.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleClientClick(client)}
              >
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{client.name || "—"}</span>
                      {incompleteName && (
                        <Badge variant="outline" className="gap-1 text-xs shrink-0 border-amber-500/50 text-amber-600 dark:text-amber-400">
                          <UserX className="w-3 h-3" />
                          Nome incompleto
                        </Badge>
                      )}
                      {plan && (
                        <Badge variant="secondary" className="gap-1 text-xs shrink-0">
                          <Crown className="w-3 h-3" />
                          {plan.name}
                        </Badge>
                      )}
                      {renderOverdueBadge(client)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {noPhone ? (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <PhoneOff className="w-3 h-3" />
                          Sem telefone
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {formatPhone(client.mobile_phone)}
                        </span>
                      )}
                      <span>
                        Desde {format(new Date(client.created_at), "dd/MM/yy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>

                  {!noPhone && (
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant={isOverdue(client) ? "destructive" : "outline"}
                            className="gap-1.5 h-8"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">
                              {isOverdue(client) ? "Regularizar" : "Pagamento"}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
                          <DropdownMenuLabel className="text-xs">Registrar pagamento</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {plan ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setWizardPrefill({
                                  phone: client.mobile_phone,
                                  name: client.name,
                                  action: "renew",
                                  planId: client.subscription_plan_id,
                                });
                                setWizardOpen(true);
                              }}
                            >
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Renovar plano atual
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => {
                                setWizardPrefill({
                                  phone: client.mobile_phone,
                                  name: client.name,
                                  action: "new",
                                  planId: null,
                                });
                                setWizardOpen(true);
                              }}
                            >
                              <Crown className="w-4 h-4 mr-2" />
                              Reativar assinatura
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setWizardPrefill({
                                phone: client.mobile_phone,
                                name: client.name,
                                action: "upgrade",
                                planId: null,
                              });
                              setWizardOpen(true);
                            }}
                          >
                            <ArrowUpDown className="w-4 h-4 mr-2" />
                            Trocar de plano
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
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

      <SubscriptionWizardModal
        open={wizardOpen}
        onOpenChange={(o) => {
          setWizardOpen(o);
          if (!o) setWizardPrefill(null);
        }}
        organizationId={organizationId || ""}
        onComplete={() => {
          fetchData();
        }}
        prefillPhone={wizardPrefill?.phone}
        prefillName={wizardPrefill?.name}
        prefillAction={wizardPrefill?.action}
        prefillPlanId={wizardPrefill?.planId ?? undefined}
        prefillIsNewClient={false}
        startStep={wizardPrefill?.planId ? "attribution" : "client_type"}
      />
    </div>
  );
}
