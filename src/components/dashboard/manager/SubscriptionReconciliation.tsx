import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Upload, CheckCircle2, AlertTriangle, XCircle, CalendarIcon, Loader2, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { brl } from "@/lib/currency";
import { formatPhone, sanitizePhone } from "@/lib/phoneUtils";
import { getManausDate, manausDayStart, manausDayEnd, toDateKey } from "@/lib/dateUtils";
import { useOrganization } from "@/hooks/useOrganization";
import { fetchAllRows } from "@/lib/supabasePagination";
import { registerClientOrThrow } from "@/lib/clientRegistry";

interface CsvRow {
  key: string;
  name: string;
  phone: string;
  amount: number;
  planLabel: string;
}

interface SystemTx {
  id: string;
  client_name: string | null;
  mobile_phone: string | null;
  item_name: string;
  price_sold: number;
  barber_id: string | null;
  unit_id: string | null;
  subscription_action: string | null;
  created_at: string;
}

interface BarberOption {
  id: string;
  name: string;
  unit_id: string;
}

interface UnitOption {
  id: string;
  name: string;
}

interface PlanOption {
  id: string;
  name: string;
  price: number;
}

interface PendingAssignment {
  barberId: string; // "reception" or barber uuid
  unitId: string;
  planId: string;
  action: "new" | "renew";
  selected: boolean;
}

const HEADER_ALIASES: Record<keyof Omit<CsvRow, "key">, string[]> = {
  name: ["nome", "cliente", "customer", "nome_cliente", "nome do cliente", "pagador", "payer"],
  phone: ["telefone", "celular", "phone", "mobile", "whatsapp", "fone", "telefone_celular"],
  amount: ["valor", "valor_pago", "valor pago", "total", "amount", "liquido", "valor_liquido", "valor liquido", "value", "preco", "preço"],
  planLabel: ["plano", "descricao", "descrição", "description", "item", "produto", "assinatura"],
};

const DATE_ALIASES = ["data", "data_pagamento", "data pagamento", "pagamento", "data_criacao", "data de criação", "date", "paid_at", "vencimento"];

const normalizeHeader = (h: string) =>
  h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^"|"$/g, "");

const splitCsvLine = (line: string, delimiter: string): string[] => {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((c) => c.trim().replace(/^"|"$/g, ""));
};

const parseAmount = (raw: string): number => {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const parseRowDate = (raw: string): string | null => {
  const v = (raw || "").trim();
  if (!v) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
};

export default function SubscriptionReconciliation() {
  const { organizationId } = useOrganization();
  const fileRef = useRef<HTMLInputElement>(null);

  const [refDate, setRefDate] = useState<string>(toDateKey(subDays(getManausDate(), 1)));
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [csvSkipped, setCsvSkipped] = useState(0);
  const [csvOutOfRange, setCsvOutOfRange] = useState(0);
  const [systemTx, setSystemTx] = useState<SystemTx[]>([]);
  const [barbers, setBarbers] = useState<BarberOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [assignments, setAssignments] = useState<Record<string, PendingAssignment>>({});

  useEffect(() => {
    if (!organizationId) return;
    const loadRefs = async () => {
      const [barbersRes, unitsRes, plansRes] = await Promise.all([
        supabase
          .from("barbers")
          .select("id, name, unit_id")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .order("name"),
        supabase
          .from("units")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .order("name"),
        supabase
          .from("subscription_plans")
          .select("id, name, price")
          .eq("organization_id", organizationId)
          .order("price"),
      ]);
      setBarbers(barbersRes.data || []);
      setUnits(unitsRes.data || []);
      setPlans((plansRes.data || []).map((p) => ({ ...p, price: Number(p.price) })));
    };
    void loadRefs();
  }, [organizationId]);

  const loadSystemTx = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const rows = await fetchAllRows<SystemTx>(() =>
        supabase
          .from("sale_transactions")
          .select("id, client_name, mobile_phone, item_name, price_sold, barber_id, unit_id, subscription_action, created_at")
          .eq("organization_id", organizationId)
          .eq("item_type", "subscription")
          .gte("created_at", manausDayStart(refDate))
          .lte("created_at", manausDayEnd(refDate))
          .order("created_at", { ascending: true })
      );
      setSystemTx(rows.map((r) => ({ ...r, price_sold: Number(r.price_sold) })));
    } catch (err: any) {
      toast.error("Erro ao carregar assinaturas do dia", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSystemTx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, refDate]);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        toast.error("Arquivo vazio ou sem dados");
        return;
      }
      const delimiter = (lines[0].match(/;/g)?.length || 0) > (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
      const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);

      const findIdx = (aliases: string[]) => {
        for (const alias of aliases) {
          const exact = headers.indexOf(alias);
          if (exact >= 0) return exact;
        }
        for (let i = 0; i < headers.length; i++) {
          if (aliases.some((a) => headers[i].includes(a))) return i;
        }
        return -1;
      };

      const idxName = findIdx(HEADER_ALIASES.name);
      const idxPhone = findIdx(HEADER_ALIASES.phone);
      const idxAmount = findIdx(HEADER_ALIASES.amount);
      const idxPlan = findIdx(HEADER_ALIASES.planLabel);
      const idxDate = findIdx(DATE_ALIASES);

      if (idxName < 0 || idxPhone < 0) {
        toast.error("Não encontrei as colunas de nome e telefone", {
          description: "O arquivo precisa ter uma coluna de nome do cliente e uma de celular.",
        });
        return;
      }

      const rows: CsvRow[] = [];
      let skipped = 0;
      let outOfRange = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i], delimiter);
        const name = (cols[idxName] || "").trim();
        const phone = sanitizePhone(cols[idxPhone] || "");
        const amount = idxAmount >= 0 ? parseAmount(cols[idxAmount] || "") : 0;
        const planLabel = idxPlan >= 0 ? (cols[idxPlan] || "").trim() : "";

        if (idxDate >= 0) {
          const rowDate = parseRowDate(cols[idxDate] || "");
          if (rowDate && rowDate !== refDate) {
            outOfRange++;
            continue;
          }
        }

        if (!name || phone.length !== 11) {
          skipped++;
          continue;
        }
        rows.push({ key: `${phone}-${i}`, name, phone, amount, planLabel });
      }

      setCsvRows(rows);
      setCsvSkipped(skipped);
      setCsvOutOfRange(outOfRange);
      setCsvFileName(file.name);
      setAssignments({});
      toast.success(`${rows.length} cobranças lidas do arquivo`, {
        description: [
          skipped ? `${skipped} linha(s) sem nome/celular válido` : null,
          outOfRange ? `${outOfRange} de outras datas ignorada(s)` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      });
    } catch (err: any) {
      toast.error("Erro ao ler o arquivo", { description: err?.message });
    }
  };

  const comparison = useMemo(() => {
    const systemByPhone = new Map<string, SystemTx[]>();
    systemTx.forEach((tx) => {
      const phone = sanitizePhone(tx.mobile_phone || "");
      if (!phone) return;
      const list = systemByPhone.get(phone) || [];
      list.push(tx);
      systemByPhone.set(phone, list);
    });

    const usedTxIds = new Set<string>();
    const matched: { row: CsvRow; tx: SystemTx }[] = [];
    const divergent: { row: CsvRow; tx: SystemTx }[] = [];
    const missingInSystem: CsvRow[] = [];

    csvRows.forEach((row) => {
      const candidates = (systemByPhone.get(row.phone) || []).filter((t) => !usedTxIds.has(t.id));
      if (candidates.length === 0) {
        missingInSystem.push(row);
        return;
      }
      const exact = candidates.find((t) => Math.abs(t.price_sold - row.amount) < 0.01);
      const tx = exact || candidates[0];
      usedTxIds.add(tx.id);
      if (exact || row.amount === 0) matched.push({ row, tx });
      else divergent.push({ row, tx });
    });

    const missingInCsv = csvRows.length
      ? systemTx.filter((tx) => !usedTxIds.has(tx.id))
      : [];

    return { matched, divergent, missingInSystem, missingInCsv };
  }, [csvRows, systemTx]);

  const barberName = (id: string | null) => barbers.find((b) => b.id === id)?.name || "Recepção / Loja";
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name || "—";

  const guessPlanId = (row: CsvRow): string => {
    const label = row.planLabel.toLowerCase();
    const byName = plans.find((p) => label && label.includes(p.name.toLowerCase()));
    if (byName) return byName.id;
    const byPrice = plans.find((p) => Math.abs(Number(p.price) - row.amount) < 0.01);
    if (byPrice) return byPrice.id;
    return "";
  };

  const getAssignment = (row: CsvRow): PendingAssignment =>
    assignments[row.key] || {
      barberId: "reception",
      unitId: units[0]?.id || "",
      planId: guessPlanId(row),
      action: "renew",
      selected: false,
    };

  const updateAssignment = (row: CsvRow, patch: Partial<PendingAssignment>) => {
    setAssignments((prev) => ({
      ...prev,
      [row.key]: { ...getAssignment(row), ...patch },
    }));
  };

  const toggleAll = (checked: boolean) => {
    setAssignments((prev) => {
      const next = { ...prev };
      comparison.missingInSystem.forEach((row) => {
        next[row.key] = { ...getAssignment(row), selected: checked };
      });
      return next;
    });
  };

  const selectedRows = comparison.missingInSystem.filter((row) => getAssignment(row).selected);

  const importSelected = async () => {
    if (!organizationId || selectedRows.length === 0) return;
    setImporting(true);
    let created = 0;
    const failures: string[] = [];

    try {
      for (const row of selectedRows) {
        const assignment = getAssignment(row);
        const plan = plans.find((p) => p.id === assignment.planId);
        if (!plan) {
          failures.push(`${row.name}: selecione o plano`);
          continue;
        }

        const barberId = assignment.barberId === "reception" ? null : assignment.barberId;
        const unitId = barberId
          ? barbers.find((b) => b.id === barberId)?.unit_id || assignment.unitId || null
          : assignment.unitId || null;

        if (!unitId) {
          failures.push(`${row.name}: selecione a unidade`);
          continue;
        }

        try {
          const client = await registerClientOrThrow({
            organizationId,
            clientName: row.name,
            mobilePhone: row.phone,
          });

          await (supabase.from("clients") as any)
            .update({ subscription_plan_id: plan.id })
            .eq("organization_id", organizationId)
            .eq("mobile_phone", client.mobilePhone);

          let productionId: string | null = null;
          if (barberId) {
            const { data: existingProd } = await supabase
              .from("daily_productions")
              .select("id")
              .eq("barber_id", barberId)
              .eq("date", refDate)
              .maybeSingle();
            if (existingProd) {
              productionId = existingProd.id;
            } else {
              const { data: newProd, error: prodErr } = await supabase
                .from("daily_productions")
                .insert({
                  barber_id: barberId,
                  organization_id: organizationId,
                  date: refDate,
                  clients_count: 0,
                  services_count: 0,
                  products_count: 0,
                  services_basic_total: 0,
                  services_extra_total: 0,
                  products_total: 0,
                })
                .select("id")
                .single();
              if (prodErr) throw prodErr;
              productionId = newProd.id;
            }
          }

          const { error: txErr } = await supabase.from("sale_transactions").insert({
            barber_id: barberId,
            organization_id: organizationId,
            daily_production_id: productionId,
            unit_id: unitId,
            item_type: "subscription",
            item_name: `Assinatura ${plan.name}`,
            description: `Conciliação do gateway • ${client.clientName}`,
            client_name: client.clientName,
            mobile_phone: client.mobilePhone,
            price_sold: row.amount > 0 ? row.amount : Number(plan.price),
            service_category: null,
            catalog_service_id: null,
            catalog_product_id: null,
            commission_rate_used: 0,
            commission_amount: 0,
            source: "manager",
            created_at: `${refDate}T12:00:00-04:00`,
            is_new_client: assignment.action === "new",
            subscription_plan_id: plan.id,
            subscription_action: assignment.action,
            attribution_source: barberId ? "barber" : "reception",
          } as any);

          if (txErr) throw txErr;
          created++;
        } catch (err: any) {
          failures.push(`${row.name}: ${err?.message || "falha ao registrar"}`);
        }
      }

      if (created > 0) {
        toast.success(`${created} assinatura(s) alimentada(s) no sistema`, {
          description: failures.length ? `${failures.length} com problema.` : "Já aparecem no Ao Vivo e nos relatórios.",
        });
      }
      if (failures.length) {
        toast.error("Algumas linhas não foram registradas", { description: failures.slice(0, 4).join(" · ") });
      }
      setAssignments({});
      await loadSystemTx();
    } finally {
      setImporting(false);
    }
  };

  const csvTotal = csvRows.reduce((s, r) => s + r.amount, 0);
  const systemTotal = systemTx.reduce((s, t) => s + t.price_sold, 0);

  return (
    <div className="space-y-4">
      <Card className="glass-strong border-white/[0.06]">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Conciliação Diária</CardTitle>
              <CardDescription className="uppercase tracking-wider text-[11px]">
                Cobranças do gateway x lançamentos do Ao Vivo — fuso Manaus
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Dia auditado</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="min-h-11 justify-start gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {format(parseISO(refDate), "dd 'de' MMMM", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={parseISO(refDate)}
                    onSelect={(d) => d && setRefDate(toDateKey(d))}
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => setRefDate(toDateKey(subDays(getManausDate(), 1)))}
              >
                Ontem
              </Button>
              <Button variant="outline" className="min-h-11" onClick={() => setRefDate(toDateKey(getManausDate()))}>
                Hoje
              </Button>
            </div>

            <div className="flex-1 min-w-[220px]" />

            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <Button className="min-h-11 gap-2" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4" />
                Subir arquivo do gateway
              </Button>
            </div>
          </div>

          {csvFileName && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <FileSpreadsheet className="w-4 h-4" />
              <span className="font-medium text-foreground">{csvFileName}</span>
              <span>· {csvRows.length} cobranças · {brl(csvTotal)}</span>
              {csvSkipped > 0 && <span>· {csvSkipped} linha(s) sem nome/celular</span>}
              {csvOutOfRange > 0 && <span>· {csvOutOfRange} de outras datas</span>}
            </div>
          )}

          <div className="rounded-lg border border-white/[0.06] bg-muted/20 p-3 text-xs text-muted-foreground">
            O arquivo precisa ter, no mínimo, uma coluna com o nome do cliente e outra com o celular (11 dígitos).
            Colunas de valor, plano e data são reconhecidas automaticamente quando existirem.
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="glass border-white/[0.06]">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Conciliadas
            </div>
            <p className="text-2xl font-bold mt-1">{comparison.matched.length}</p>
          </CardContent>
        </Card>
        <Card className="glass border-white/[0.06]">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Falta no sistema
            </div>
            <p className="text-2xl font-bold mt-1">{comparison.missingInSystem.length}</p>
          </CardContent>
        </Card>
        <Card className="glass border-white/[0.06]">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <XCircle className="w-4 h-4 text-red-400" /> Sem comprovação
            </div>
            <p className="text-2xl font-bold mt-1">{comparison.missingInCsv.length}</p>
          </CardContent>
        </Card>
        <Card className="glass border-white/[0.06]">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="w-4 h-4 text-orange-400" /> Valor divergente
            </div>
            <p className="text-2xl font-bold mt-1">{comparison.divergent.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-strong border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Resultado do dia {format(parseISO(refDate), "dd/MM/yyyy")}
          </CardTitle>
          <CardDescription>
            Gateway {brl(csvTotal)} · Lançado no sistema {brl(systemTotal)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando lançamentos...
            </div>
          ) : (
            <Tabs defaultValue="missing" className="space-y-4">
              <TabsList className="grid grid-cols-2 sm:inline-grid sm:grid-cols-4 w-full sm:w-auto">
                <TabsTrigger value="missing">Falta no sistema ({comparison.missingInSystem.length})</TabsTrigger>
                <TabsTrigger value="nocsv">Sem comprovação ({comparison.missingInCsv.length})</TabsTrigger>
                <TabsTrigger value="divergent">Divergências ({comparison.divergent.length})</TabsTrigger>
                <TabsTrigger value="ok">Conciliadas ({comparison.matched.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="missing" className="mt-0 space-y-3">
                {comparison.missingInSystem.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {csvRows.length === 0
                      ? "Suba o arquivo do gateway para começar a conferência."
                      : "Tudo que foi cobrado já está lançado no sistema. 🎉"}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox
                          checked={
                            selectedRows.length > 0 && selectedRows.length === comparison.missingInSystem.length
                          }
                          onCheckedChange={(c) => toggleAll(Boolean(c))}
                        />
                        Selecionar todas
                      </label>
                      <Button
                        className="min-h-11 gap-2"
                        disabled={selectedRows.length === 0 || importing}
                        onClick={() => void importSelected()}
                      >
                        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Alimentar {selectedRows.length > 0 ? `${selectedRows.length} ` : ""}assinatura(s)
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>Cliente</TableHead>
                            <TableHead>Celular</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead>Plano</TableHead>
                            <TableHead>Atribuir para</TableHead>
                            <TableHead>Unidade</TableHead>
                            <TableHead>Tipo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {comparison.missingInSystem.map((row) => {
                            const a = getAssignment(row);
                            const isBarber = a.barberId !== "reception";
                            const lockedUnit = isBarber
                              ? barbers.find((b) => b.id === a.barberId)?.unit_id || ""
                              : a.unitId;
                            return (
                              <TableRow key={row.key}>
                                <TableCell>
                                  <Checkbox
                                    checked={a.selected}
                                    onCheckedChange={(c) => updateAssignment(row, { selected: Boolean(c) })}
                                  />
                                </TableCell>
                                <TableCell className="font-medium whitespace-nowrap">{row.name}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatPhone(row.phone)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">{brl(row.amount)}</TableCell>
                                <TableCell>
                                  <Select value={a.planId} onValueChange={(v) => updateAssignment(row, { planId: v })}>
                                    <SelectTrigger className="min-w-[150px] min-h-11">
                                      <SelectValue placeholder="Selecione" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {plans.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                          {p.name} · {brl(Number(p.price))}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={a.barberId}
                                    onValueChange={(v) =>
                                      updateAssignment(row, {
                                        barberId: v,
                                        unitId:
                                          v === "reception"
                                            ? a.unitId
                                            : barbers.find((b) => b.id === v)?.unit_id || a.unitId,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="min-w-[170px] min-h-11">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="reception">🏢 Recepção / Loja</SelectItem>
                                      {barbers.map((b) => (
                                        <SelectItem key={b.id} value={b.id}>
                                          {b.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={lockedUnit}
                                    disabled={isBarber}
                                    onValueChange={(v) => updateAssignment(row, { unitId: v })}
                                  >
                                    <SelectTrigger className="min-w-[150px] min-h-11">
                                      <SelectValue placeholder="Unidade" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {units.map((u) => (
                                        <SelectItem key={u.id} value={u.id}>
                                          {u.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={a.action}
                                    onValueChange={(v) => updateAssignment(row, { action: v as "new" | "renew" })}
                                  >
                                    <SelectTrigger className="min-w-[130px] min-h-11">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="renew">Renovação</SelectItem>
                                      <SelectItem value="new">Nova adesão</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="nocsv" className="mt-0">
                {comparison.missingInCsv.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {csvRows.length === 0
                      ? "Suba o arquivo do gateway para comparar."
                      : "Nenhum lançamento sem cobrança correspondente."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Celular</TableHead>
                          <TableHead>Plano lançado</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Lançado por</TableHead>
                          <TableHead>Unidade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparison.missingInCsv.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="font-medium">{tx.client_name || "—"}</TableCell>
                            <TableCell>{tx.mobile_phone ? formatPhone(tx.mobile_phone) : "—"}</TableCell>
                            <TableCell>{tx.item_name}</TableCell>
                            <TableCell className="text-right">{brl(tx.price_sold)}</TableCell>
                            <TableCell>{barberName(tx.barber_id)}</TableCell>
                            <TableCell>{unitName(tx.unit_id)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="divergent" className="mt-0">
                {comparison.divergent.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma divergência de valor.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Celular</TableHead>
                          <TableHead className="text-right">Gateway</TableHead>
                          <TableHead className="text-right">Sistema</TableHead>
                          <TableHead className="text-right">Diferença</TableHead>
                          <TableHead>Lançado por</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparison.divergent.map(({ row, tx }) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell>{formatPhone(row.phone)}</TableCell>
                            <TableCell className="text-right">{brl(row.amount)}</TableCell>
                            <TableCell className="text-right">{brl(tx.price_sold)}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                                {brl(row.amount - tx.price_sold)}
                              </Badge>
                            </TableCell>
                            <TableCell>{barberName(tx.barber_id)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="ok" className="mt-0">
                {comparison.matched.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma cobrança conciliada ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Celular</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Lançado por</TableHead>
                          <TableHead>Unidade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparison.matched.map(({ row, tx }) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell>{formatPhone(row.phone)}</TableCell>
                            <TableCell className="text-right">{brl(tx.price_sold)}</TableCell>
                            <TableCell>{barberName(tx.barber_id)}</TableCell>
                            <TableCell>{unitName(tx.unit_id)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
