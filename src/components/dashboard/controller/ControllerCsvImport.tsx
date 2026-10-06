import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileUp, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { brl } from "@/lib/currency";
import { formatPhone, sanitizePhone } from "@/lib/phoneUtils";
import { MANAUS_OFFSET } from "@/lib/dateUtils";
import {
  serializeCycleMetadata,
  computeRenewalDue,
  formatDueDate,
  type DuePolicy,
} from "@/lib/subscriptionCycle";
import { registerClientOrThrow } from "@/lib/clientRegistry";
import { parseISO } from "date-fns";

interface Plan {
  id: string;
  name: string;
  price: number;
}
interface Unit {
  id: string;
  name: string;
}

interface ControllerCsvImportProps {
  organizationId: string;
  plans: Plan[];
  units: Unit[];
  onImported: () => void;
}

type RowStatus = "ok" | "dup" | "ignored_status" | "no_plan";

interface ParsedRow {
  clientName: string;
  planText: string;
  valor: number;
  statusText: string;
  dateKey: string; // yyyy-MM-dd do lançamento
  phone: string; // sanitizado
  planId: string | null;
  // Unidade do cliente já resolvida: a cadastrada (subscription_unit_id) ou a
  // inferida do histórico de atendimentos. null = precisa definir manualmente.
  resolvedUnitId: string | null;
  clientExists: boolean;
  // Ciclo atual do cliente (para a renovação decidir a nova data de vencimento).
  currentDueDate: string | null; // yyyy-MM-dd ou null (sem ciclo conhecido)
  duePolicy: DuePolicy; // "keep" (padrão) ou "follow_payment"
  status: RowStatus;
}

const norm = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Conjunto de palavras-chave de um nome de plano, tolerante às diferenças entre
// o gateway e o cadastro: tira acentos/pontuação, ignora prefixos "clube"/"plano",
// a conjunção "e", e o plural (legendários -> legendario).
const planTokens = (name: string): Set<string> => {
  const raw = (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const tokens = raw
    .filter((t, i) => !(i === 0 && (t === "clube" || t === "plano")))
    .filter((t) => t !== "e")
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
  return new Set(tokens);
};

const isSubset = (a: Set<string>, b: Set<string>) => [...a].every((t) => b.has(t));

// Casa o nome de plano do CSV com um plano cadastrado.
function matchPlanByName<T extends { name: string }>(text: string, plans: T[]): T | null {
  const k = planTokens(text);
  if (k.size === 0) return null;
  // 1) conjunto de palavras idêntico
  const exact = plans.find((p) => {
    const pk = planTokens(p.name);
    return pk.size === k.size && isSubset(k, pk);
  });
  if (exact) return exact;
  // 2) um conjunto contido no outro — escolhe o de maior sobreposição; empate = sem match
  let best: { plan: T; shared: number } | null = null;
  let tie = false;
  for (const p of plans) {
    const pk = planTokens(p.name);
    if (isSubset(k, pk) || isSubset(pk, k)) {
      const shared = [...k].filter((t) => pk.has(t)).length;
      if (!best || shared > best.shared) {
        best = { plan: p, shared };
        tie = false;
      } else if (shared === best.shared) {
        tie = true;
      }
    }
  }
  return best && !tie ? best.plan : null;
}

const parseBRNumber = (s: string): number => {
  const c = (s || "").trim().replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(c);
  return isNaN(n) ? 0 : n;
};

// "04/10/2026 - 04:02" ou "04/10/2026" -> "2026-10-04"
const parseBRDateKey = (s: string): string | null => {
  const m = (s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const splitCsvLine = (line: string): string[] =>
  line.split(";").map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());

export default function ControllerCsvImport({
  organizationId,
  plans,
  units,
  onImported,
}: ControllerCsvImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  // Unidade escolhida manualmente por linha (telefone), quando não dá pra inferir.
  const [manualUnitByPhone, setManualUnitByPhone] = useState<Record<string, string>>({});

  // Unidade efetiva: a resolvida (cadastro/histórico) ou a escolhida manualmente.
  const effUnitId = (r: ParsedRow): string | null =>
    r.resolvedUnitId ?? manualUnitByPhone[r.phone] ?? null;

  const unitsById = useMemo(() => {
    const m = new Map<string, string>();
    units.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [units]);

  const counts = useMemo(() => {
    const willImport = (r: ParsedRow) => r.status === "ok" || r.status === "no_plan";
    const ok = rows.filter(willImport).length;
    const dup = rows.filter((r) => r.status === "dup").length;
    const ignored = rows.filter((r) => r.status === "ignored_status").length;
    const noPlan = rows.filter((r) => r.status === "no_plan").length;
    const newClients = rows.filter((r) => willImport(r) && !r.clientExists).length;
    const needsUnit = rows.filter((r) => willImport(r) && !effUnitId(r)).length;
    const mrr = rows.filter(willImport).reduce((a, r) => a + r.valor, 0);
    return { ok, dup, ignored, noPlan, newClients, needsUnit, mrr };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, manualUnitByPhone]);

  const reset = () => {
    setRows([]);
    setFileName("");
    setManualUnitByPhone({});
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setRows([]);
    setManualUnitByPhone({});
    setFileName(file.name);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        toast.error("CSV vazio ou sem linhas de dados.");
        return;
      }

      // Cabeçalho -> índices das colunas conhecidas
      const header = splitCsvLine(lines[0]).map(norm);
      const col = (name: string) => header.indexOf(norm(name));
      const idx = {
        nome: col("Nome do cliente"),
        plano: col("Plano"),
        venc: col("Vencimento"),
        valor: col("Valor"),
        status: col("Status"),
        dataStatus: col("Data do status atual"),
        telefone: col("Telefone"),
      };
      if (idx.telefone < 0 || idx.valor < 0 || idx.plano < 0) {
        toast.error("CSV não reconhecido. Esperado o relatório do gateway (colunas Nome/Plano/Valor/Telefone).");
        return;
      }

      const parsed: Omit<
        ParsedRow,
        "status" | "resolvedUnitId" | "clientExists" | "currentDueDate" | "duePolicy"
      >[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = splitCsvLine(lines[i]);
        const phone = sanitizePhone(c[idx.telefone] || "");
        if (!phone) continue;
        const planText = (c[idx.plano] || "").trim();
        const matched = matchPlanByName(planText, plans);
        const dateKey =
          parseBRDateKey(c[idx.dataStatus] ?? "") ||
          parseBRDateKey(c[idx.venc] ?? "") ||
          "";
        parsed.push({
          clientName: (c[idx.nome] || "").trim(),
          planText,
          valor: parseBRNumber(c[idx.valor] || "0"),
          statusText: (c[idx.status] || "").trim(),
          dateKey,
          phone,
          planId: matched?.id ?? null,
        });
      }

      if (parsed.length === 0) {
        toast.error("Nenhuma linha válida encontrada no CSV.");
        return;
      }

      const phones = Array.from(new Set(parsed.map((p) => p.phone)));

      // 1) Cliente já existe? Unidade cadastrada + ciclo vigente (vencimento/política)?
      const existingUnitByPhone = new Map<string, string | null>();
      const dueByPhone = new Map<string, string | null>();
      const policyByPhone = new Map<string, DuePolicy>();
      for (let i = 0; i < phones.length; i += 300) {
        const chunk = phones.slice(i, i + 300);
        const { data, error } = await supabase
          .from("clients")
          .select("mobile_phone, subscription_unit_id, subscription_due_date, subscription_due_policy")
          .eq("organization_id", organizationId)
          .in("mobile_phone", chunk);
        // Falha de leitura aqui não pode virar "todos sem unidade". Aborta.
        if (error) throw new Error("Falha ao consultar a base de clientes. Tente novamente.");
        (data || []).forEach(
          (cl: {
            mobile_phone: string;
            subscription_unit_id: string | null;
            subscription_due_date: string | null;
            subscription_due_policy: string | null;
          }) => {
            existingUnitByPhone.set(cl.mobile_phone, cl.subscription_unit_id);
            dueByPhone.set(cl.mobile_phone, cl.subscription_due_date);
            policyByPhone.set(
              cl.mobile_phone,
              cl.subscription_due_policy === "follow_payment" ? "follow_payment" : "keep",
            );
          },
        );
      }

      // 2) Para quem não tem unidade cadastrada, infere pelos últimos atendimentos
      //    (barbeiro dominante -> unidade), via função SECURITY DEFINER no banco
      //    (o controlador não lê transações de serviço diretamente).
      const inferredByPhone = new Map<string, string>();
      for (let i = 0; i < phones.length; i += 300) {
        const chunk = phones.slice(i, i + 300);
        const { data, error } = await supabase.rpc("get_client_units_by_phones", {
          p_organization_id: organizationId,
          p_phones: chunk,
        });
        if (error) throw new Error("Falha ao identificar a unidade dos clientes. Tente novamente.");
        (data || []).forEach((row: { mobile_phone: string; unit_id: string | null }) => {
          if (row.unit_id) inferredByPhone.set(row.mobile_phone, row.unit_id);
        });
      }

      // Dedupe: renovações automáticas já lançadas no(s) mesmo(s) dia(s)
      const dayKeys = Array.from(new Set(parsed.map((p) => p.dateKey).filter(Boolean)));
      const existing = new Set<string>();
      if (dayKeys.length > 0) {
        const minDay = dayKeys.sort()[0];
        const maxDay = dayKeys.sort()[dayKeys.length - 1];
        const { data, error } = await supabase
          .from("sale_transactions")
          .select("mobile_phone, price_sold, created_at")
          .eq("organization_id", organizationId)
          .eq("item_type", "subscription")
          .eq("attribution_source", "auto_recurring")
          .gte("created_at", `${minDay}T00:00:00${MANAUS_OFFSET}`)
          .lte("created_at", `${maxDay}T23:59:59${MANAUS_OFFSET}`);
        // Sem a checagem de duplicadas confiável, poderíamos reimportar em dobro. Aborta.
        if (error) throw new Error("Falha ao checar lançamentos duplicados. Tente novamente.");
        (data || []).forEach((t: { mobile_phone: string | null; price_sold: number; created_at: string }) => {
          const dk = t.created_at.slice(0, 10);
          existing.add(`${sanitizePhone(t.mobile_phone || "")}|${dk}|${Number(t.price_sold).toFixed(2)}`);
        });
      }

      const finalRows: ParsedRow[] = parsed.map((p) => {
        const clientExists = existingUnitByPhone.has(p.phone);
        const resolvedUnitId =
          (existingUnitByPhone.get(p.phone) ?? null) || inferredByPhone.get(p.phone) || null;
        let status: RowStatus;
        if (!norm(p.statusText).includes("captur")) {
          status = "ignored_status";
        } else if (p.dateKey && existing.has(`${p.phone}|${p.dateKey}|${p.valor.toFixed(2)}`)) {
          status = "dup";
        } else if (!p.planId) {
          status = "no_plan"; // ainda importa, mas sem vínculo de plano
        } else {
          status = "ok";
        }
        return {
          ...p,
          resolvedUnitId,
          clientExists,
          currentDueDate: dueByPhone.get(p.phone) ?? null,
          duePolicy: policyByPhone.get(p.phone) ?? "keep",
          status,
        };
      });

      setRows(finalRows);
    } catch (err) {
      console.error("Erro ao ler CSV:", err);
      toast.error(err instanceof Error ? err.message : "Não foi possível ler o arquivo CSV.");
      setRows([]);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    const toImport = rows.filter((r) => r.status === "ok" || r.status === "no_plan");
    if (toImport.length === 0) {
      toast.error("Nada para importar.");
      return;
    }
    setImporting(true);
    try {
      // Decide a data do novo ciclo de cada linha respeitando a política do
      // cliente (vencimento prevalece por padrão; re-ancora só em "follow_payment").
      const computed = toImport.map((r) => {
        const paymentDate = r.dateKey ? parseISO(r.dateKey) : new Date();
        const currentDue = r.currentDueDate ? parseISO(r.currentDueDate) : null;
        const cycle = computeRenewalDue(currentDue, paymentDate, r.duePolicy);
        return { r, cycle };
      });

      const payload = computed.map(({ r, cycle }) => ({
        organization_id: organizationId,
        barber_id: null,
        item_type: "subscription",
        item_name: `Assinatura ${r.planText || ""}`.trim(),
        subscription_action: "renew",
        attribution_source: "auto_recurring",
        source: "manager",
        price_sold: r.valor,
        commission_rate_used: 0,
        commission_amount: 0,
        subscription_plan_id: r.planId,
        unit_id: effUnitId(r),
        client_name: r.clientName || null,
        mobile_phone: r.phone,
        is_new_client: false,
        created_at: r.dateKey ? `${r.dateKey}T12:00:00${MANAUS_OFFSET}` : undefined,
        description: r.dateKey ? serializeCycleMetadata(cycle.anchor, cycle.nextDue) : null,
      }));

      // Insere em lotes para não estourar o payload
      let inserted = 0;
      for (let i = 0; i < payload.length; i += 200) {
        const batch = payload.slice(i, i + 200);
        const { error } = await supabase.from("sale_transactions").insert(batch);
        if (error) throw error;
        inserted += batch.length;
      }

      // Cria o cliente se não existir e vincula/reativa o plano (por telefone único).
      const uniq = new Map<string, { name: string; planId: string | null }>();
      for (const r of toImport) {
        if (r.phone) uniq.set(r.phone, { name: r.clientName, planId: r.planId });
      }
      const entries = [...uniq.entries()];
      let clientsCreated = 0;
      let clientErrors = 0;
      for (let i = 0; i < entries.length; i += 8) {
        const chunk = entries.slice(i, i + 8);
        await Promise.all(
          chunk.map(async ([phone, info]) => {
            try {
              const res = await registerClientOrThrow({
                organizationId,
                clientName: info.name || "",
                mobilePhone: phone,
              });
              if (!res.reusedByPhone) clientsCreated++;
            } catch {
              clientErrors++;
            }
          })
        );
      }

      // Vincula o plano (e limpa flag de cancelamento) agrupando por plano.
      const phonesByPlan = new Map<string, string[]>();
      for (const [phone, info] of uniq) {
        if (info.planId) {
          const arr = phonesByPlan.get(info.planId) || [];
          arr.push(phone);
          phonesByPlan.set(info.planId, arr);
        }
      }
      for (const [planId, phones] of phonesByPlan) {
        for (let i = 0; i < phones.length; i += 300) {
          const chunk = phones.slice(i, i + 300);
          const { error } = await supabase
            .from("clients")
            .update({
              subscription_plan_id: planId,
              subscription_cancelled_at: null,
              subscription_cancel_reason: null,
            })
            .eq("organization_id", organizationId)
            .in("mobile_phone", chunk);
          if (error) throw error;
        }
      }

      // Persiste a unidade (inferida ou escolhida manualmente) nos clientes que
      // estão SEM unidade — agrupando por unidade. Não sobrescreve quem já tem.
      const phonesByUnit = new Map<string, string[]>();
      for (const r of toImport) {
        const u = effUnitId(r);
        if (u && r.phone) {
          const arr = phonesByUnit.get(u) || [];
          arr.push(r.phone);
          phonesByUnit.set(u, arr);
        }
      }
      for (const [unitId, unitPhones] of phonesByUnit) {
        for (let i = 0; i < unitPhones.length; i += 300) {
          const chunk = unitPhones.slice(i, i + 300);
          const { error } = await supabase
            .from("clients")
            .update({ subscription_unit_id: unitId })
            .eq("organization_id", organizationId)
            .in("mobile_phone", chunk)
            .is("subscription_unit_id", null);
          if (error) throw error;
        }
      }

      // Atualiza o ciclo de cada cliente: novo vencimento, último pagamento,
      // atraso e flag (> 10 dias). Se um telefone tiver várias cobranças no mesmo
      // arquivo, vence a de data mais recente.
      const dueByPhone = new Map<string, (typeof computed)[number]>();
      for (const c of computed) {
        if (!c.r.phone || !c.r.dateKey) continue;
        const prev = dueByPhone.get(c.r.phone);
        if (!prev || c.r.dateKey > prev.r.dateKey) dueByPhone.set(c.r.phone, c);
      }
      const dueEntries = [...dueByPhone.entries()];
      for (let i = 0; i < dueEntries.length; i += 8) {
        const chunk = dueEntries.slice(i, i + 8);
        await Promise.all(
          chunk.map(async ([phone, { r, cycle }]) => {
            const upd: Record<string, unknown> = {
              subscription_due_date: formatDueDate(cycle.nextDue),
              subscription_last_payment_at: r.dateKey,
              subscription_last_late_days: cycle.lateDays,
            };
            if (cycle.shouldFlag) {
              upd.subscription_payment_shift_flagged_at = new Date().toISOString();
            }
            // Troca aplicada: volta para "keep" (a nova data agora vigora).
            if (r.duePolicy === "follow_payment") upd.subscription_due_policy = "keep";
            await supabase
              .from("clients")
              .update(upd)
              .eq("organization_id", organizationId)
              .eq("mobile_phone", phone);
          }),
        );
      }

      toast.success(
        `${inserted} renovação${inserted === 1 ? "" : "ões"} importada${inserted === 1 ? "" : "s"}` +
          `${clientsCreated > 0 ? ` · ${clientsCreated} cliente(s) novo(s)` : ""}` +
          `${clientErrors > 0 ? ` · ${clientErrors} ignorado(s) por telefone/nome inválido` : ""}.`
      );
      reset();
      onImported();
    } catch (err) {
      console.error("Erro ao importar CSV:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao importar o CSV.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileUp className="w-5 h-5 text-primary" />
          Importar relatório do gateway (CSV)
        </CardTitle>
        <CardDescription>
          Suba o relatório de cobranças do cartão (separado por ";"). Cada linha "Capturada na
          Operadora" vira uma renovação automática. Por cliente, o sistema cruza os dados: busca pelo
          telefone, cadastra se não existir e identifica a unidade pelos últimos atendimentos dele.
          Quando não dá pra identificar, você define a unidade na linha. Duplicadas são ignoradas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={parsing || importing}>
            {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
            Escolher arquivo CSV
          </Button>
          {fileName && (
            <span className="text-xs text-muted-foreground flex items-center gap-2">
              {fileName}
              <button type="button" onClick={reset} className="hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </div>

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="rounded-md border bg-secondary/40 p-2">
                <p className="text-xs text-muted-foreground">A importar</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{counts.ok}</p>
              </div>
              <div className="rounded-md border bg-secondary/40 p-2">
                <p className="text-xs text-muted-foreground">Clientes novos</p>
                <p className="text-lg font-bold">{counts.newClients}</p>
              </div>
              <div className="rounded-md border bg-secondary/40 p-2">
                <p className="text-xs text-muted-foreground">Sem unidade</p>
                <p className={`text-lg font-bold ${counts.needsUnit > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {counts.needsUnit}
                </p>
              </div>
              <div className="rounded-md border bg-secondary/40 p-2">
                <p className="text-xs text-muted-foreground">MRR</p>
                <p className="text-lg font-bold">{brl(counts.mrr)}</p>
              </div>
              <div className="rounded-md border bg-secondary/40 p-2">
                <p className="text-xs text-muted-foreground">Duplicadas</p>
                <p className="text-lg font-bold text-muted-foreground">{counts.dup}</p>
              </div>
              <div className="rounded-md border bg-secondary/40 p-2">
                <p className="text-xs text-muted-foreground">Ignoradas</p>
                <p className="text-lg font-bold text-muted-foreground">{counts.ignored}</p>
              </div>
            </div>

            {counts.needsUnit > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {counts.needsUnit} cliente(s) sem unidade identificada — defina a unidade na linha; sem isso, serão importados sem unidade.
              </p>
            )}

            {counts.noPlan > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {counts.noPlan} linha(s) com plano não encontrado no cadastro — serão importadas sem vínculo de plano (o valor é mantido).
              </p>
            )}

            <div className="rounded-md border overflow-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} className={r.status === "dup" || r.status === "ignored_status" ? "opacity-50" : ""}>
                      <TableCell className="font-medium">
                        <div className="min-w-0">
                          <p className="truncate max-w-[180px]">{r.clientName || "—"}</p>
                          <p className="text-xs text-muted-foreground">{formatPhone(r.phone)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.planText || "—"}
                        {r.status === "no_plan" && (
                          <span className="block text-[11px] text-amber-600 dark:text-amber-400">sem vínculo</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(() => {
                          const eu = effUnitId(r);
                          if (eu) {
                            return (
                              <span className="text-muted-foreground">
                                {unitsById.get(eu) || "Unidade removida"}
                              </span>
                            );
                          }
                          if (r.status === "dup" || r.status === "ignored_status") {
                            return <span className="text-muted-foreground">—</span>;
                          }
                          // Sem unidade resolvida: deixa o usuário escolher na linha.
                          return (
                            <Select
                              value={manualUnitByPhone[r.phone] || ""}
                              onValueChange={(v) =>
                                setManualUnitByPhone((m) => ({ ...m, [r.phone]: v }))
                              }
                            >
                              <SelectTrigger className="h-8 w-[150px] text-xs">
                                <SelectValue placeholder="Definir unidade" />
                              </SelectTrigger>
                              <SelectContent>
                                {units.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.dateKey ? r.dateKey.split("-").reverse().join("/") : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{brl(r.valor)}</TableCell>
                      <TableCell>
                        {r.status === "dup" ? (
                          <Badge variant="outline" className="text-muted-foreground">Duplicada</Badge>
                        ) : r.status === "ignored_status" ? (
                          <Badge variant="outline" className="text-muted-foreground">Ignorada</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                            Importar
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button className="w-full" onClick={handleImport} disabled={importing || counts.ok === 0}>
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Importar {counts.ok} renovações automáticas
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
