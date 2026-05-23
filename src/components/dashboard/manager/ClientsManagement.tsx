import { useState, useEffect, useMemo, useRef } from "react";
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
  MapPinOff,
  MapPin,
  Wand2,
  Upload,
} from "lucide-react";
import { formatPhone, isValidPhone, sanitizePhone } from "@/lib/phoneUtils";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOrganization } from "@/hooks/useOrganization";
import ClientDetailModal from "./ClientDetailModal";
import SubscriptionWizardModal from "./SubscriptionWizardModal";
import MigratedClientModal from "./MigratedClientModal";
import { toast } from "sonner";

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

interface UnitInfo {
  id: string;
  name: string;
}

interface ImportIssue {
  line: number;
  phone: string;
  reason: string;
}

interface OriginSuggestion {
  suggested_unit_id: string;
  suggested_unit_name: string;
  basis: string;
}

type FilterKey = "all" | "no_phone" | "incomplete_name" | "overdue" | "no_origin";

const OVERDUE_DAYS = 30;
const SUB_PAID_ACTIONS = new Set(["new", "renew", "upgrade", "downgrade"]);

export default function ClientsManagement() {
  const CLIENTS_PER_PAGE = 30;
  const { organizationId } = useOrganization();
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [originSuggestions, setOriginSuggestions] = useState<Map<string, OriginSuggestion>>(new Map());
  const [applyingAutoOrigin, setApplyingAutoOrigin] = useState(false);
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
  const [migratedModalOpen, setMigratedModalOpen] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

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
          .select("id, name, mobile_phone, subscription_plan_id, subscription_started_at, subscription_unit_id, migrated_from_legacy, created_at, updated_at")
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

      const { data: unitsData } = await supabase
        .from("units")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("name");

      const { data: suggData, error: suggErr } = await supabase
        .rpc("suggest_client_origin_units", { p_organization_id: organizationId });
      if (suggErr) console.warn("suggest_client_origin_units:", suggErr.message);
      const suggMap = new Map<string, OriginSuggestion>();
      for (const row of (suggData as any[]) || []) {
        if (row.client_id && row.suggested_unit_id) {
          suggMap.set(row.client_id, {
            suggested_unit_id: row.suggested_unit_id,
            suggested_unit_name: row.suggested_unit_name,
            basis: row.basis,
          });
        }
      }

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
      setUnits((unitsData as UnitInfo[]) || []);
      setOriginSuggestions(suggMap);
      setLastSubByPhone(subMap);
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    } finally {
      setLoading(false);
    }
  };

  const planMap = new Map(plans.map((p) => [p.id, p]));
  const unitMap = new Map(units.map((u) => [u.id, u]));

  const hasNoOrigin = (c: Client) => !c.subscription_unit_id;

  const updateClientUnit = async (clientId: string, unitId: string | null) => {
    const { error } = await supabase
      .from("clients")
      .update({ subscription_unit_id: unitId })
      .eq("id", clientId);
    if (error) {
      toast.error("Erro ao atualizar origem", { description: error.message });
      return;
    }
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, subscription_unit_id: unitId } : c)));
    toast.success(unitId ? "Origem atualizada" : "Origem removida");
  };

  const applyAutoOrigins = async () => {
    if (!organizationId) return;
    setApplyingAutoOrigin(true);
    try {
      const { data, error } = await supabase.rpc("apply_auto_origin_units", {
        p_organization_id: organizationId,
      });
      if (error) throw error;
      const result = (data || {}) as { updated_count?: number; skipped_count?: number };
      toast.success(`${result.updated_count ?? 0} clientes atualizados`, {
        description: result.skipped_count
          ? `${result.skipped_count} sem sugestão (sem histórico).`
          : undefined,
      });
      await fetchData();
    } catch (err: any) {
      toast.error("Erro ao atribuir origens", { description: err.message });
    } finally {
      setApplyingAutoOrigin(false);
    }
  };



  const normalizePlanName = (name: string) => name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const parseDateBRorISO = (raw: string): string | null => {
    const v = raw.trim();
    if (!v) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (iso) return v;
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return null;
  };

  const handleImportCsvFile = async (file: File) => {
    if (!organizationId) return;
    setImportingCsv(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) {
        toast.error("CSV vazio ou sem dados");
        return;
      }

      const planByNormalized = new Map(plans.map((p) => [normalizePlanName(p.name), p.id]));

      let created = 0, updated = 0, skipped = 0;
      const issues: ImportIssue[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const [nameRaw = "", phoneRaw = "", planRaw = "", dueRaw = ""] = cols;

        const phoneDigits = sanitizePhone(phoneRaw);
        if (!nameRaw || phoneDigits.length !== 11) { skipped++; issues.push({ line: i + 1, phone: phoneRaw, reason: "nome/telefone inválido" }); continue; }

        const planId = planByNormalized.get(normalizePlanName(planRaw)) || null;
        const startedAt = parseDateBRorISO(dueRaw);

        const { data: existing, error: qErr } = await supabase
          .from("clients")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("mobile_phone", phoneDigits)
          .maybeSingle();
        if (qErr) { skipped++; issues.push({ line: i + 1, phone: phoneDigits, reason: "erro ao buscar telefone na base" }); continue; }

        const payload: any = {
          organization_id: organizationId,
          name: nameRaw.trim(),
          mobile_phone: phoneDigits,
          subscription_plan_id: planId,
          migrated_from_legacy: true,
        };
        if (planId && startedAt) payload.subscription_started_at = startedAt;

        if (existing?.id) {
          const { data: current, error: currErr } = await supabase
            .from("clients")
            .select("name, subscription_plan_id, subscription_started_at")
            .eq("id", existing.id)
            .maybeSingle();
          if (currErr || !current) {
            skipped++; issues.push({ line: i + 1, phone: phoneDigits, reason: "não foi possível validar dados atuais" });
            continue;
          }

          const nameDiff = (current.name || "").trim() !== nameRaw.trim();
          const planDiff = (current.subscription_plan_id || null) !== (planId || null);
          const dateDiff = (current.subscription_started_at || null) !== (startedAt || null);

          if (nameDiff || planDiff || dateDiff) {
            const { error } = await supabase.from("clients").update(payload).eq("id", existing.id);
            if (!error) updated++; else { skipped++; issues.push({ line: i + 1, phone: phoneDigits, reason: "erro ao atualizar cadastro" }); }
          } else {
            // already consistent, proceed silently
          }
        } else {
          const { error } = await supabase.from("clients").insert(payload);
          if (!error) created++; else { skipped++; issues.push({ line: i + 1, phone: phoneDigits, reason: "erro ao criar cadastro" }); }
        }
      }

      setImportIssues(issues);
      toast.success("Importação concluída", { description: `${created} criados, ${updated} atualizados, ${skipped} ignorados.` });
      // Não bloquear o término do estado de importação com recarga pesada da tela
      // (evita sensação de "carregando infinito" em CSVs grandes).
      void fetchData();
    } catch (err: any) {
      toast.error("Erro ao importar CSV", { description: err?.message || "Falha inesperada" });
    } finally {
      setImportingCsv(false);
    }
  };
  const normalize = (str: string) =>
    str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const isIncompleteName = (name: string) => {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length < 2 || parts[0].length < 2;
  };

  const isNoPhone = (phone: string) => !phone || !isValidPhone(phone);

  /** Returns the most recent "last paid" date: max(last sale_transaction, subscription_started_at) */
  const getLastPaidDate = (c: Client): Date | null => {
    const txDate = c.mobile_phone ? lastSubByPhone.get(c.mobile_phone) : undefined;
    const migratedDate = c.subscription_started_at || null;
    const candidates: Date[] = [];
    if (txDate) candidates.push(new Date(txDate));
    if (migratedDate) candidates.push(parseISO(migratedDate));
    if (candidates.length === 0) return null;
    return new Date(Math.max(...candidates.map((d) => d.getTime())));
  };

  const isOverdue = (c: Client): boolean => {
    if (!c.subscription_plan_id) return false;
    const last = getLastPaidDate(c);
    if (!last) return true;
    const days = differenceInCalendarDays(new Date(), last);
    return days > OVERDUE_DAYS;
  };

  const counts = useMemo(() => {
    let noPhone = 0;
    let incomplete = 0;
    let overdue = 0;
    let noOrigin = 0;
    for (const c of clients) {
      if (isNoPhone(c.mobile_phone)) noPhone++;
      if (isIncompleteName(c.name)) incomplete++;
      if (isOverdue(c)) overdue++;
      if (hasNoOrigin(c)) noOrigin++;
    }
    return { noPhone, incomplete, overdue, noOrigin };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, lastSubByPhone]);

  const suggestedNoOriginCount = useMemo(() => {
    let n = 0;
    for (const c of clients) {
      if (hasNoOrigin(c) && originSuggestions.has(c.id)) n++;
    }
    return n;
  }, [clients, originSuggestions]);

  const hasSearch = search.trim().length > 0;

  const filtered = clients.filter((c) => {
    if (!hasSearch) {
      if (filter === "no_phone" && !isNoPhone(c.mobile_phone)) return false;
      if (filter === "incomplete_name" && !isIncompleteName(c.name)) return false;
      if (filter === "overdue" && !isOverdue(c)) return false;
      if (filter === "no_origin" && !hasNoOrigin(c)) return false;
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
    { key: "no_origin", label: "Sem origem", count: counts.noOrigin, icon: MapPinOff },
  ];

  const renderOverdueBadge = (c: Client) => {
    if (!isOverdue(c)) return null;
    const last = getLastPaidDate(c);
    const days = last ? differenceInCalendarDays(new Date(), last) : null;
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
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-9 shrink-0"
            onClick={() => setMigratedModalOpen(true)}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cliente migrado</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={() => csvInputRef.current?.click()}
            disabled={importingCsv}
          >
            {importingCsv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Importar CSV</span>
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportCsvFile(file);
              e.currentTarget.value = "";
            }}
          />
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
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

      {importIssues.length > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5">
          <p className="text-xs text-red-700 dark:text-red-300 font-medium">
            Importação com pendências: {importIssues.length} cliente(s) para revisão manual.
          </p>
          <div className="mt-1 space-y-1 max-h-28 overflow-auto">
            {importIssues.slice(0, 10).map((i, idx) => (
              <p key={`${i.line}-${idx}`} className="text-[11px] text-red-700 dark:text-red-300">
                Linha {i.line} • Tel: {i.phone || "-"} • {i.reason}
              </p>
            ))}
            {importIssues.length > 10 && (
              <p className="text-[11px] text-red-700 dark:text-red-300">...e mais {importIssues.length - 10} pendência(s).</p>
            )}
          </div>
        </div>
      )}

      {!hasSearch && filter === "no_origin" && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            <strong>{counts.noOrigin}</strong> cliente(s) sem origem.{" "}
            A origem é recalculada automaticamente toda madrugada com base nos{" "}
            <strong>últimos 3 atendimentos</strong> (barbeiro majoritário, desempate pelo mais recente).
            Clique para forçar agora.
          </div>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 h-8 shrink-0"
            disabled={applyingAutoOrigin}
            onClick={applyAutoOrigins}
          >
            {applyingAutoOrigin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            Recalcular origens agora
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
            const noOrigin = hasNoOrigin(client);
            const suggestion = originSuggestions.get(client.id);
            const currentUnitName = client.subscription_unit_id ? unitMap.get(client.subscription_unit_id)?.name : null;

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
                      {client.migrated_from_legacy && (
                        <Badge variant="outline" className="gap-1 text-xs shrink-0 border-blue-500/40 text-blue-600 dark:text-blue-400">
                          <Database className="w-3 h-3" />
                          Migrado
                        </Badge>
                      )}
                      {noOrigin ? (
                        suggestion ? (
                          <Badge variant="outline" className="gap-1 text-xs shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-300">
                            <MapPinOff className="w-3 h-3" />
                            Sem origem → sugerido: {suggestion.suggested_unit_name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs shrink-0 text-muted-foreground">
                            <MapPinOff className="w-3 h-3" />
                            Sem origem
                          </Badge>
                        )
                      ) : currentUnitName ? (
                        <Badge variant="outline" className="gap-1 text-xs shrink-0">
                          <MapPin className="w-3 h-3" />
                          {currentUnitName}
                        </Badge>
                      ) : null}
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

                  <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="ghost" className="gap-1.5 h-8">
                          <MapPin className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Origem</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
                        <DropdownMenuLabel className="text-xs">Unidade de origem</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {suggestion && noOrigin && (
                          <>
                            <DropdownMenuItem onClick={() => updateClientUnit(client.id, suggestion.suggested_unit_id)}>
                              <Wand2 className="w-3.5 h-3.5 mr-2" />
                              Usar sugestão: {suggestion.suggested_unit_name}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        {units.map((u) => (
                          <DropdownMenuItem
                            key={u.id}
                            onClick={() => updateClientUnit(client.id, u.id)}
                            className={client.subscription_unit_id === u.id ? "bg-accent" : ""}
                          >
                            {u.name}
                          </DropdownMenuItem>
                        ))}
                        {client.subscription_unit_id && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => updateClientUnit(client.id, null)} className="text-muted-foreground">
                              Remover origem
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  {!noPhone && (
                    <div className="shrink-0">
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

      <MigratedClientModal
        open={migratedModalOpen}
        onOpenChange={setMigratedModalOpen}
        organizationId={organizationId || ""}
        onComplete={fetchData}
      />
    </div>
  );
}
