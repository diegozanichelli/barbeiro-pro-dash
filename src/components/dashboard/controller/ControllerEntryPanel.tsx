import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  CalendarDays,
  Search,
  XCircle,
  CreditCard,
  Globe,
  Trash2,
  Loader2,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { brl } from "@/lib/currency";
import { formatPhone, sanitizePhone } from "@/lib/phoneUtils";
import {
  getControllerDefaultDays,
  getManausDate,
  manausDayStart,
  manausDayEnd,
  MANAUS_OFFSET,
} from "@/lib/dateUtils";
import { addMonths, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { serializeCycleMetadata } from "@/lib/subscriptionCycle";
import { registerClientOrThrow } from "@/lib/clientRegistry";
import { useClientAutocomplete } from "@/hooks/useClientAutocomplete";
import ControllerCsvImport from "./ControllerCsvImport";

type EntryMode = "cancel" | "auto_recurring" | "online";

interface ControllerEntryPanelProps {
  organizationId: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
}

interface Unit {
  id: string;
  name: string;
}

interface SelectedClient {
  id: string;
  name: string;
  mobile_phone: string;
  subscription_plan_id: string | null;
  subscription_unit_id: string | null;
}

interface DayEntry {
  id: string;
  created_at: string;
  client_name: string | null;
  mobile_phone: string | null;
  item_name: string;
  price_sold: number;
  subscription_action: string | null;
  attribution_source: string | null;
  previous_plan_id: string | null;
  unit_id: string | null;
}

const prettyDay = (key: string) =>
  format(parseISO(key), "EEEE, dd/MM", { locale: ptBR });

const entryTypeLabel = (e: DayEntry): { label: string; className: string } => {
  if (e.subscription_action === "cancel")
    return { label: "Cancelamento", className: "border-destructive/40 text-destructive" };
  if (e.attribution_source === "online")
    return { label: "Venda online", className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" };
  if (e.attribution_source === "auto_recurring")
    return { label: "Renovação automática", className: "border-blue-500/40 text-blue-600 dark:text-blue-400" };
  return { label: e.subscription_action || "—", className: "" };
};

export default function ControllerEntryPanel({ organizationId }: ControllerEntryPanelProps) {
  const [mode, setMode] = useState<EntryMode>("cancel");

  // Datas sugeridas (regra do dia anterior) + data escolhida (editável).
  const suggestedDays = useMemo(() => getControllerDefaultDays(), []);
  const [selectedDate, setSelectedDate] = useState<string>(
    () => suggestedDays[suggestedDays.length - 1]
  );

  // Catálogos.
  const [plans, setPlans] = useState<Plan[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const unitsById = useMemo(() => {
    const m = new Map<string, string>();
    units.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [units]);
  const plansById = useMemo(() => {
    const m = new Map<string, Plan>();
    plans.forEach((p) => m.set(p.id, p));
    return m;
  }, [plans]);

  // Busca de cliente.
  const [phoneInput, setPhoneInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
  const { nameSuggestions, phoneSuggestions, loading: searchLoading } = useClientAutocomplete({
    organizationId,
    nameQuery: selectedClient ? "" : nameInput,
    phoneQuery: selectedClient ? "" : phoneInput,
    enabled: !selectedClient,
  });
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    return [...phoneSuggestions, ...nameSuggestions].filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [phoneSuggestions, nameSuggestions]);

  // Campos do formulário.
  const [chosenPlanId, setChosenPlanId] = useState<string>("");
  const [chosenUnitId, setChosenUnitId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Lista do que já foi lançado no dia.
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Id do controlador logado — a lista do dia mostra só o que ELE lançou
  // (as linhas carimbadas com created_by = seu uid), evitando exibir e tentar
  // apagar renovações automáticas que o gestor lançou.
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // ---- carregar catálogos ----
  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const [plansRes, unitsRes] = await Promise.all([
        supabase
          .from("subscription_plans")
          .select("id, name, price")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .order("price", { ascending: true }),
        supabase
          .from("units")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .order("name"),
      ]);
      setPlans((plansRes.data || []).map((p) => ({ id: p.id, name: p.name, price: Number(p.price) || 0 })));
      setUnits((unitsRes.data || []) as Unit[]);
    })();
  }, [organizationId]);

  // ---- carregar lançamentos do dia ----
  const loadDayEntries = useCallback(async () => {
    if (!organizationId || !selectedDate || !userId) return;
    setLoadingEntries(true);
    try {
      const { data, error } = await supabase
        .from("sale_transactions")
        .select(
          "id, created_at, client_name, mobile_phone, item_name, price_sold, subscription_action, attribution_source, previous_plan_id, unit_id"
        )
        .eq("organization_id", organizationId)
        .eq("item_type", "subscription")
        .eq("created_by", userId)
        .in("attribution_source", ["controller", "online", "auto_recurring"])
        .gte("created_at", manausDayStart(selectedDate))
        .lte("created_at", manausDayEnd(selectedDate))
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDayEntries((data || []) as DayEntry[]);
    } catch (err) {
      console.error("Erro ao carregar lançamentos do dia:", err);
    } finally {
      setLoadingEntries(false);
    }
  }, [organizationId, selectedDate, userId]);

  useEffect(() => {
    loadDayEntries();
  }, [loadDayEntries]);

  // ---- selecionar cliente ----
  const handleSelectClient = async (clientId: string) => {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, mobile_phone, subscription_plan_id, subscription_unit_id")
      .eq("id", clientId)
      .maybeSingle();
    if (error || !data) {
      toast.error("Não foi possível carregar o cliente.");
      return;
    }
    const client = data as SelectedClient;
    setSelectedClient(client);
    setPhoneInput(client.mobile_phone || "");
    setNameInput(client.name || "");
    setChosenPlanId(client.subscription_plan_id || "");
    setChosenUnitId(client.subscription_unit_id || "");
  };

  const clearClient = () => {
    setSelectedClient(null);
    setPhoneInput("");
    setNameInput("");
    setChosenPlanId("");
    setChosenUnitId("");
    setReason("");
  };

  const resolvedUnitName = useMemo(() => {
    const id = chosenUnitId || selectedClient?.subscription_unit_id || "";
    return id ? unitsById.get(id) || "Unidade removida" : "";
  }, [chosenUnitId, selectedClient, unitsById]);

  const resetAfterSubmit = () => {
    clearClient();
    loadDayEntries();
  };

  const createdAtIso = `${selectedDate}T12:00:00${MANAUS_OFFSET}`;

  // ---- submissões ----
  const submitCancel = async () => {
    if (!selectedClient) return;
    const planId = selectedClient.subscription_plan_id;
    const { error: txErr } = await supabase.from("sale_transactions").insert({
      organization_id: organizationId,
      barber_id: null,
      item_type: "subscription",
      item_name: "Cancelamento de assinatura",
      subscription_action: "cancel",
      attribution_source: "controller",
      source: "manager",
      price_sold: 0,
      commission_rate_used: 0,
      commission_amount: 0,
      subscription_plan_id: planId,
      previous_plan_id: planId,
      unit_id: chosenUnitId || selectedClient.subscription_unit_id || null,
      client_name: selectedClient.name,
      mobile_phone: selectedClient.mobile_phone,
      is_new_client: false,
      created_at: createdAtIso,
    });
    if (txErr) throw txErr;

    const { error: cliErr } = await supabase
      .from("clients")
      .update({
        subscription_plan_id: null,
        subscription_cancelled_at: createdAtIso,
        subscription_cancel_reason: reason.trim() || null,
      })
      .eq("id", selectedClient.id);
    if (cliErr) throw cliErr;

    toast.success(`Cancelamento registrado para ${selectedClient.name}.`);
  };

  const submitAutoRecurring = async () => {
    if (!selectedClient) return;
    const plan = chosenPlanId ? plansById.get(chosenPlanId) : null;
    if (!plan) {
      toast.error("Selecione o plano da renovação.");
      return;
    }
    const anchor = parseISO(selectedDate);
    const { error: txErr } = await supabase.from("sale_transactions").insert({
      organization_id: organizationId,
      barber_id: null,
      item_type: "subscription",
      item_name: `Assinatura ${plan.name}`,
      subscription_action: "renew",
      attribution_source: "auto_recurring",
      source: "manager",
      price_sold: plan.price,
      commission_rate_used: 0,
      commission_amount: 0,
      subscription_plan_id: plan.id,
      unit_id: chosenUnitId || selectedClient.subscription_unit_id || null,
      client_name: selectedClient.name,
      mobile_phone: selectedClient.mobile_phone,
      is_new_client: false,
      created_at: createdAtIso,
      description: serializeCycleMetadata(anchor, addMonths(anchor, 1)),
    });
    if (txErr) throw txErr;

    // Mantém o vínculo de plano do cliente (renovação não muda plano).
    if (selectedClient.subscription_plan_id !== plan.id) {
      await supabase
        .from("clients")
        .update({ subscription_plan_id: plan.id })
        .eq("id", selectedClient.id);
    }

    toast.success(`Renovação automática registrada para ${selectedClient.name}.`);
  };

  const submitOnline = async () => {
    const plan = chosenPlanId ? plansById.get(chosenPlanId) : null;
    if (!plan) {
      toast.error("Selecione o plano da venda online.");
      return;
    }

    // Cliente pode ser novo: garante o cadastro.
    const name = (selectedClient?.name || nameInput).trim();
    const phone = sanitizePhone(selectedClient?.mobile_phone || phoneInput);
    if (name.length < 3 || phone.length < 8) {
      toast.error("Informe nome e telefone válidos do cliente.");
      return;
    }

    // Detecta se o cliente já existe ANTES de cadastrar: define is_new_client
    // corretamente (não inflar métrica de cliente novo) e guarda o plano anterior
    // para o desfazer restaurar o estado certo.
    const { data: existingRow, error: existingErr } = await supabase
      .from("clients")
      .select("id, subscription_unit_id, subscription_plan_id")
      .eq("organization_id", organizationId)
      .eq("mobile_phone", phone)
      .maybeSingle();
    if (existingErr) throw existingErr;

    const existed = !!existingRow;
    const prevPlanId = existingRow?.subscription_plan_id ?? null;

    // Garante o cadastro (cria se novo, reaproveita se já existe).
    await registerClientOrThrow({ organizationId, clientName: name, mobilePhone: phone });

    // Recupera o id (o cadastro pode ter acabado de criar o cliente).
    let clientRow = existingRow;
    if (!clientRow) {
      const { data: fetched, error: fetchErr } = await supabase
        .from("clients")
        .select("id, subscription_unit_id, subscription_plan_id")
        .eq("organization_id", organizationId)
        .eq("mobile_phone", phone)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      clientRow = fetched;
    }

    const unitId = chosenUnitId || clientRow?.subscription_unit_id || null;
    const anchor = parseISO(selectedDate);

    const { error: txErr } = await supabase.from("sale_transactions").insert({
      organization_id: organizationId,
      barber_id: null,
      item_type: "subscription",
      item_name: `Assinatura ${plan.name}`,
      subscription_action: "new",
      attribution_source: "online",
      source: "manager",
      price_sold: plan.price,
      commission_rate_used: 0,
      commission_amount: 0,
      subscription_plan_id: plan.id,
      previous_plan_id: prevPlanId,
      unit_id: unitId,
      client_name: name,
      mobile_phone: phone,
      is_new_client: !existed,
      created_at: createdAtIso,
      description: serializeCycleMetadata(anchor, addMonths(anchor, 1)),
    });
    if (txErr) throw txErr;

    if (clientRow?.id) {
      const { error: updErr } = await supabase
        .from("clients")
        .update({
          subscription_plan_id: plan.id,
          subscription_started_at: createdAtIso,
          subscription_cancelled_at: null,
          subscription_cancel_reason: null,
          ...(unitId ? { subscription_unit_id: unitId } : {}),
        })
        .eq("id", clientRow.id);
      if (updErr) throw updErr;
    }

    toast.success(`Venda online registrada para ${name}.`);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (mode === "cancel") {
        if (!selectedClient) {
          toast.error("Selecione o cliente que cancelou.");
          return;
        }
        await submitCancel();
      } else if (mode === "auto_recurring") {
        if (!selectedClient) {
          toast.error("Selecione o cliente da renovação.");
          return;
        }
        await submitAutoRecurring();
      } else {
        await submitOnline();
      }
      resetAfterSubmit();
    } catch (err) {
      console.error("Erro ao lançar movimento:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao registrar o lançamento.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- desfazer um lançamento ----
  const handleUndo = async (entry: DayEntry) => {
    if (!confirm("Remover este lançamento?")) return;
    try {
      // Reverte o estado do cliente quando aplicável, antes de apagar o evento.
      if (entry.mobile_phone) {
        if (entry.subscription_action === "cancel") {
          await supabase
            .from("clients")
            .update({
              subscription_plan_id: entry.previous_plan_id,
              subscription_cancelled_at: null,
              subscription_cancel_reason: null,
            })
            .eq("organization_id", organizationId)
            .eq("mobile_phone", entry.mobile_phone);
        } else if (entry.subscription_action === "new" && entry.attribution_source === "online") {
          // Restaura o plano anterior (null se era cliente realmente novo),
          // em vez de zerar sempre — não derruba quem já era assinante. Só zera
          // a data de início quando o cliente não tinha plano antes (adesão nova
          // de fato); se já era assinante, preserva a data original.
          await supabase
            .from("clients")
            .update({
              subscription_plan_id: entry.previous_plan_id,
              ...(entry.previous_plan_id ? {} : { subscription_started_at: null }),
            })
            .eq("organization_id", organizationId)
            .eq("mobile_phone", entry.mobile_phone);
        }
      }

      const { error } = await supabase.from("sale_transactions").delete().eq("id", entry.id);
      if (error) throw error;
      toast.success("Lançamento removido.");
      loadDayEntries();
    } catch (err) {
      console.error("Erro ao remover lançamento:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao remover o lançamento.");
    }
  };

  const canSubmit =
    !!selectedDate &&
    !submitting &&
    (mode === "online"
      ? !!chosenPlanId && (!!selectedClient || (nameInput.trim().length >= 3 && sanitizePhone(phoneInput).length >= 8))
      : mode === "auto_recurring"
        ? !!selectedClient && !!chosenPlanId
        : !!selectedClient);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Seletor de data */}
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="w-5 h-5 text-primary" />
            Data do lançamento
          </CardTitle>
          <CardDescription>
            Você lança o movimento do dia anterior. Na segunda, lance sábado e domingo. Pode ajustar a data se precisar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {suggestedDays.map((day) => (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={selectedDate === day ? "default" : "outline"}
                onClick={() => setSelectedDate(day)}
                className="capitalize"
              >
                {prettyDay(day)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="controller-date" className="text-xs text-muted-foreground shrink-0">
              Outra data:
            </Label>
            <Input
              id="controller-date"
              type="date"
              value={selectedDate}
              max={format(getManausDate(), "yyyy-MM-dd")}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="max-w-[180px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Importação em lote do relatório do gateway (renovações automáticas) */}
      <ControllerCsvImport
        organizationId={organizationId}
        plans={plans}
        units={units}
        onImported={loadDayEntries}
      />

      {/* Formulário por tipo de evento */}
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle className="text-base">Novo lançamento</CardTitle>
          <CardDescription>
            Busque o cliente pelo telefone ou nome — a unidade é identificada automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as EntryMode); setChosenPlanId(selectedClient?.subscription_plan_id || ""); }}>
            <TabsList className="grid w-full grid-cols-3 h-auto gap-1 p-1">
              <TabsTrigger value="cancel" className="flex items-center gap-1 text-xs sm:text-sm">
                <XCircle className="w-3.5 h-3.5" /> Cancelamento
              </TabsTrigger>
              <TabsTrigger value="auto_recurring" className="flex items-center gap-1 text-xs sm:text-sm">
                <CreditCard className="w-3.5 h-3.5" /> Renov. automática
              </TabsTrigger>
              <TabsTrigger value="online" className="flex items-center gap-1 text-xs sm:text-sm">
                <Globe className="w-3.5 h-3.5" /> Venda online
              </TabsTrigger>
            </TabsList>

            {/* Busca / seleção de cliente — comum aos três modos */}
            <div className="mt-4 space-y-3">
              {selectedClient ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold truncate">{selectedClient.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedClient.mobile_phone ? formatPhone(selectedClient.mobile_phone) : "sem telefone"}
                    </p>
                    <p className="text-xs flex items-center gap-1 text-muted-foreground">
                      <Building2 className="w-3 h-3" />
                      {resolvedUnitName || "Unidade não informada"}
                    </p>
                    {selectedClient.subscription_plan_id && (
                      <p className="text-xs text-muted-foreground">
                        Plano atual: {plansById.get(selectedClient.subscription_plan_id)?.name || "—"}
                      </p>
                    )}
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={clearClient}>
                    Trocar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Telefone</Label>
                      <Input
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="(92) 9..."
                        inputMode="tel"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="Nome do cliente"
                      />
                    </div>
                  </div>
                  {(phoneInput || nameInput) && (
                    <div className="rounded-lg border border-border divide-y">
                      {searchLoading ? (
                        <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
                        </div>
                      ) : suggestions.length > 0 ? (
                        suggestions.slice(0, 6).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleSelectClient(s.id)}
                            className="w-full text-left p-2.5 hover:bg-accent/60 flex items-center justify-between gap-2"
                          >
                            <span className="font-medium text-sm truncate">{s.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {s.mobile_phone ? formatPhone(s.mobile_phone) : ""}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                          <Search className="w-3.5 h-3.5" />
                          {mode === "online"
                            ? "Nenhum cliente encontrado — um novo cadastro será criado ao registrar."
                            : "Nenhum cliente encontrado."}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Campos específicos por modo */}
              {mode === "cancel" && (
                <div className="space-y-1">
                  <Label className="text-xs">Motivo do cancelamento (opcional)</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ex.: insatisfação, mudança de cidade..."
                  />
                </div>
              )}

              {(mode === "auto_recurring" || mode === "online") && (
                <div className="space-y-1">
                  <Label className="text-xs">Plano</Label>
                  <Select value={chosenPlanId} onValueChange={setChosenPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o plano" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {brl(p.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Unidade: necessária quando o cliente não tem origem definida */}
              {mode === "online" && !resolvedUnitName && (
                <div className="space-y-1">
                  <Label className="text-xs">Unidade (cliente sem histórico)</Label>
                  <Select value={chosenUnitId} onValueChange={setChosenUnitId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Registrando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Registrar lançamento
                  </>
                )}
              </Button>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Lançamentos do dia */}
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle className="text-base capitalize">
            Lançado em {prettyDay(selectedDate)}
          </CardTitle>
          <CardDescription>
            {dayEntries.length} lançamento{dayEntries.length === 1 ? "" : "s"} neste dia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingEntries ? (
            <div className="py-6 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : dayEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nada lançado neste dia ainda.
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayEntries.map((e) => {
                    const t = entryTypeLabel(e);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">
                          <div className="min-w-0">
                            <p className="truncate">{e.client_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {e.mobile_phone ? formatPhone(e.mobile_phone) : ""}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={t.className}>
                            {t.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.unit_id ? unitsById.get(e.unit_id) || "—" : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {brl(Number(e.price_sold || 0))}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handleUndo(e)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
