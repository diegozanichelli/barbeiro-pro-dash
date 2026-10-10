import { useEffect, useCallback, useMemo, useRef, useState } from "react";
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
  type RenewalDueResult,
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
  // Quando status="dup": descreve o lançamento que já existe (origem · valor),
  // para o controlador entender por que a linha é possível duplicata.
  dupInfo?: string;
  // Id estável da linha (para o "importar mesmo assim" dos duplicados).
  rowId: string;
  // Cliente sem assinatura ativa na base (não existe OU sem plano) → sugere nova adesão.
  isLikelyNew: boolean;
  // Origem do pagamento derivada do Status (gateway x balcão), para atribuir a
  // origem certa e distinguir renov. automática x balcão nos relatórios.
  payOrigin: PayOrigin;
}

// Tipo do lançamento importado, escolhido por linha.
type ImportKind = "new" | "renew";

interface ImportBatch {
  id: string;
  created_at: string;
  file_name: string | null;
  row_count: number;
  total_value: number;
}

// next_due (yyyy-MM-dd) do JSON de ciclo gravado no description, ou null.
const parseCycleNextDue = (description: string | null): string | null => {
  if (!description) return null;
  try {
    const p = JSON.parse(description);
    return typeof p?.next_due === "string" ? p.next_due : null;
  } catch {
    return null;
  }
};

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

// Origem do pagamento, derivada do Status do gateway:
//  - "gateway": cobrado/capturado pela operadora (cartão).
//  - "counter": "pago fora do sistema" = quitado no balcão, fora da operadora.
type PayOrigin = "gateway" | "counter";

// Classifica o Status do CSV em (pago?, origem do pagamento).
//  - "pago fora do sistema" → pago, origem balcão (counter).
//  - "capturada na operadora" → pago, origem gateway. ATENÇÃO: "não capturado"
//    também contém "captur", então excluímos explicitamente o "nao captur".
//  - demais (recusado, pendente, estornado, não capturado...) → não pago.
const classifyStatus = (statusText: string): { paid: boolean; payOrigin: PayOrigin } => {
  const n = norm(statusText);
  if (n.includes("fora do sistema") || n.includes("pago fora")) {
    return { paid: true, payOrigin: "counter" };
  }
  if (n.includes("captur") && !n.includes("nao captur")) {
    return { paid: true, payOrigin: "gateway" };
  }
  return { paid: false, payOrigin: "gateway" };
};

// Rótulo da origem do lançamento, combinando a origem do pagamento com nova/renovação:
// renovação automática (gateway) · nova adesão online (gateway) · novo no balcão
// (counter) · renovou no balcão (counter). É o que o gestor usa pra distinguir.
const originLabel = (payOrigin: PayOrigin, isNew: boolean): string =>
  payOrigin === "counter"
    ? isNew
      ? "Novo no balcão"
      : "Renovou no balcão"
    : isNew
      ? "Nova adesão online"
      : "Renovação automática";

// attribution_source gravado por linha: balcão (counter) → "reception" (cai em
// Balcão/Renov. manual nos relatórios); gateway → "online" (nova) / "auto_recurring".
const attributionFor = (payOrigin: PayOrigin, isNew: boolean): string =>
  payOrigin === "counter" ? "reception" : isNew ? "online" : "auto_recurring";

// Rótulo amigável da origem do lançamento que já existe (para a possível duplicata).
const dupSourceLabel = (source: string | null): string => {
  switch (source) {
    case "auto_recurring":
      return "Gateway (já importado)";
    case "online":
      return "Venda online";
    case "controller":
      return "Controladoria";
    case "barber":
      return "Barbeiro";
    case "reception":
    default:
      return "Recepção/balcão";
  }
};

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
  // Linhas duplicadas que o usuário decidiu importar mesmo assim (por rowId).
  const [forcedImport, setForcedImport] = useState<Set<string>>(new Set());
  // Override do tipo (nova adesão/renovação) por linha; sem override usa a sugestão.
  const [rowKind, setRowKind] = useState<Record<string, ImportKind>>({});

  // Tipo efetivo da linha: override manual ou sugestão (nova adesão se cliente
  // não tem assinatura ativa na base).
  const effKind = (r: ParsedRow): ImportKind =>
    rowKind[r.rowId] ?? (r.isLikelyNew ? "new" : "renew");

  // Histórico de importações (lotes) + exclusão.
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    if (!organizationId) return;
    const { data, error } = await supabase
      .from("controller_import_batches")
      .select("id, created_at, file_name, row_count, total_value")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.warn("Falha ao carregar histórico de importações:", error);
      return;
    }
    setBatches((data as ImportBatch[]) || []);
  }, [organizationId]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // Recompõe o ciclo dos clientes afetados após excluir um lote: usa a última
  // assinatura restante (next_due); se não houver, o cliente deixa de ser assinante.
  const recomputeClientsCycle = async (phones: string[]) => {
    for (let i = 0; i < phones.length; i += 8) {
      const chunk = phones.slice(i, i + 8);
      await Promise.all(
        chunk.map(async (phone) => {
          const { data, error } = await supabase
            .from("sale_transactions")
            .select("description, subscription_plan_id, created_at")
            .eq("organization_id", organizationId)
            .eq("mobile_phone", phone)
            .eq("item_type", "subscription")
            .in("subscription_action", ["new", "renew", "upgrade"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          // Falha de leitura NÃO pode zerar a assinatura do cliente (poderia
          // limpar quem ainda tem assinatura). Mantém o cliente como está.
          if (error) {
            console.warn("[import] falha ao reconstruir ciclo; cliente mantido:", phone, error);
            return;
          }
          if (data) {
            // Ainda tem assinatura → reconstrói o estado pela última restante
            // (plano, vencimento, último pagamento; limpa atraso/flag).
            await supabase
              .from("clients")
              .update({
                subscription_plan_id: data.subscription_plan_id ?? null,
                subscription_due_date: parseCycleNextDue(data.description),
                subscription_last_payment_at: data.created_at ? data.created_at.slice(0, 10) : null,
                subscription_last_late_days: null,
                subscription_payment_shift_flagged_at: null,
              })
              .eq("organization_id", organizationId)
              .eq("mobile_phone", phone);
          } else {
            // Sem assinatura restante → deixa de ser assinante (zera tudo).
            await supabase
              .from("clients")
              .update({
                subscription_plan_id: null,
                subscription_due_date: null,
                subscription_started_at: null,
                subscription_last_payment_at: null,
                subscription_last_late_days: null,
                subscription_payment_shift_flagged_at: null,
              })
              .eq("organization_id", organizationId)
              .eq("mobile_phone", phone);
          }
        }),
      );
    }
  };

  const deleteBatch = async (batch: ImportBatch) => {
    if (!confirm(`Excluir esta importação? ${batch.row_count} lançamento(s) serão apagados.`)) return;
    setDeletingBatch(batch.id);
    try {
      // Telefones afetados (para recompor o ciclo depois de apagar).
      const { data: txRows, error: txErr } = await supabase
        .from("sale_transactions")
        .select("mobile_phone")
        .eq("organization_id", organizationId)
        .eq("import_batch_id", batch.id);
      if (txErr) throw txErr;
      const affectedPhones = Array.from(
        new Set(
          (txRows || [])
            .map((t: { mobile_phone: string | null }) => sanitizePhone(t.mobile_phone || ""))
            .filter(Boolean),
        ),
      );

      const { error: delErr } = await supabase
        .from("sale_transactions")
        .delete()
        .eq("organization_id", organizationId)
        .eq("import_batch_id", batch.id);
      if (delErr) throw delErr;

      await recomputeClientsCycle(affectedPhones);
      await supabase.from("controller_import_batches").delete().eq("id", batch.id);

      toast.success("Importação excluída.");
      loadBatches();
      onImported();
    } catch (err) {
      console.error("Erro ao excluir importação:", err);
      toast.error("Não foi possível excluir a importação.");
    } finally {
      setDeletingBatch(null);
    }
  };

  // Unidade efetiva: a resolvida (cadastro/histórico) ou a escolhida manualmente.
  const effUnitId = (r: ParsedRow): string | null =>
    r.resolvedUnitId ?? manualUnitByPhone[r.phone] ?? null;

  const unitsById = useMemo(() => {
    const m = new Map<string, string>();
    units.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [units]);

  // Uma linha será importada? ok/no_plan sempre; duplicata só se o usuário forçar.
  const willImportRow = (r: ParsedRow) =>
    r.status === "ok" ||
    r.status === "no_plan" ||
    // Possível duplicata ou status não-capturado: só entram se o usuário forçar.
    ((r.status === "dup" || r.status === "ignored_status") && forcedImport.has(r.rowId));

  const counts = useMemo(() => {
    const ok = rows.filter(willImportRow).length;
    const dup = rows.filter((r) => r.status === "dup").length;
    const ignored = rows.filter((r) => r.status === "ignored_status").length;
    const noPlan = rows.filter((r) => r.status === "no_plan").length;
    const newClients = rows.filter((r) => willImportRow(r) && !r.clientExists).length;
    const needsUnit = rows.filter((r) => willImportRow(r) && !effUnitId(r)).length;
    const mrr = rows.filter(willImportRow).reduce((a, r) => a + r.valor, 0);
    return { ok, dup, ignored, noPlan, newClients, needsUnit, mrr };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, manualUnitByPhone, forcedImport]);

  const reset = () => {
    setRows([]);
    setFileName("");
    setManualUnitByPhone({});
    setForcedImport(new Set());
    setRowKind({});
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setRows([]);
    setManualUnitByPhone({});
    setForcedImport(new Set());
    setRowKind({});
    setFileName(file.name);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        toast.error("CSV vazio ou sem linhas de dados.");
        return;
      }

      // Cabeçalho -> índices das colunas conhecidas. Detecção tolerante: o layout
      // do gateway varia ("nome" x "Nome do cliente"; "data dos status atual" x
      // "Data do status atual"), então casamos por palavra-chave, não exato.
      const header = splitCsvLine(lines[0]).map(norm);
      const find = (pred: (h: string) => boolean) => header.findIndex(pred);
      const idx = {
        nome: find((h) => h.includes("nome") || h.includes("cliente")),
        plano: find((h) => h.includes("plano")),
        // "vencimento" sozinho; evita confundir com "data dos status atual".
        venc: find((h) => h.includes("vencimento") && !h.includes("status")),
        valor: find((h) => h.includes("valor") || h.includes("preco")),
        // Data do status (pagamento): contém "data" e "status" (cobre "do"/"dos").
        dataStatus: find((h) => h.includes("data") && h.includes("status")),
        // Status (texto): contém "status" mas não é a coluna de data.
        status: find((h) => h.includes("status") && !h.includes("data")),
        telefone: find(
          (h) => h.includes("telefone") || h.includes("celular") || h.includes("fone") || h.includes("whatsapp"),
        ),
      };
      if (idx.telefone < 0 || idx.valor < 0 || idx.plano < 0) {
        toast.error("CSV não reconhecido. Esperado o relatório do gateway (colunas Nome/Plano/Valor/Telefone).");
        return;
      }

      const parsed: Omit<
        ParsedRow,
        "status" | "resolvedUnitId" | "clientExists" | "currentDueDate" | "duePolicy" | "dupInfo" | "rowId" | "isLikelyNew" | "payOrigin"
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

      // 1) Cliente já existe? Unidade cadastrada + ciclo vigente + assinatura ativa?
      const existingUnitByPhone = new Map<string, string | null>();
      const dueByPhone = new Map<string, string | null>();
      const policyByPhone = new Map<string, DuePolicy>();
      const planByPhone = new Map<string, string | null>();
      for (let i = 0; i < phones.length; i += 300) {
        const chunk = phones.slice(i, i + 300);
        const { data, error } = await supabase
          .from("clients")
          .select("mobile_phone, subscription_unit_id, subscription_due_date, subscription_due_policy, subscription_plan_id")
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
            subscription_plan_id: string | null;
          }) => {
            existingUnitByPhone.set(cl.mobile_phone, cl.subscription_unit_id);
            dueByPhone.set(cl.mobile_phone, cl.subscription_due_date);
            policyByPhone.set(
              cl.mobile_phone,
              cl.subscription_due_policy === "follow_payment" ? "follow_payment" : "keep",
            );
            planByPhone.set(cl.mobile_phone, cl.subscription_plan_id);
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

      // Dedupe por telefone + dia: qualquer assinatura (não-cancelamento) já
      // lançada para o cliente NO MESMO DIA da cobrança — seja re-importação do
      // gateway OU lançamento da recepção/balcão (nova adesão ou renovação).
      // Evita contar a mesma mensalidade duas vezes.
      const dayKeys = Array.from(new Set(parsed.map((p) => p.dateKey).filter(Boolean)));
      const existingByPhoneDay = new Map<
        string,
        { source: string | null; value: number }
      >();
      if (dayKeys.length > 0) {
        const minDay = dayKeys.sort()[0];
        const maxDay = dayKeys.sort()[dayKeys.length - 1];
        const { data, error } = await supabase
          .from("sale_transactions")
          .select("mobile_phone, price_sold, created_at, subscription_action, attribution_source")
          .eq("organization_id", organizationId)
          .eq("item_type", "subscription")
          .gte("created_at", `${minDay}T00:00:00${MANAUS_OFFSET}`)
          .lte("created_at", `${maxDay}T23:59:59${MANAUS_OFFSET}`);
        // Sem a checagem de duplicadas confiável, poderíamos reimportar em dobro. Aborta.
        if (error) throw new Error("Falha ao checar lançamentos duplicados. Tente novamente.");
        (data || []).forEach(
          (t: {
            mobile_phone: string | null;
            price_sold: number;
            created_at: string;
            subscription_action: string | null;
            attribution_source: string | null;
          }) => {
            if (t.subscription_action === "cancel") return; // cancelamento não é duplicata
            const key = `${sanitizePhone(t.mobile_phone || "")}|${t.created_at.slice(0, 10)}`;
            // Mantém o primeiro encontrado (origem/valor para exibir na prévia).
            if (!existingByPhoneDay.has(key)) {
              existingByPhoneDay.set(key, {
                source: t.attribution_source,
                value: Number(t.price_sold) || 0,
              });
            }
          },
        );
      }

      // Sugestão "nova adesão" só para a 1ª cobrança (mais antiga) de cada cliente
      // SEM assinatura ativa na base. Cobranças seguintes do mesmo cliente são
      // renovações (senão todas resetariam o ciclo e inflariam novas adesões).
      const newEligible = (phone: string) =>
        !existingUnitByPhone.has(phone) || !planByPhone.get(phone);
      const firstNewIdxByPhone = new Map<string, number>();
      parsed.forEach((p, i) => {
        if (!newEligible(p.phone)) return;
        const cur = firstNewIdxByPhone.get(p.phone);
        if (cur === undefined || (p.dateKey || "") < (parsed[cur].dateKey || "")) {
          firstNewIdxByPhone.set(p.phone, i);
        }
      });

      const finalRows: ParsedRow[] = parsed.map((p, i) => {
        const clientExists = existingUnitByPhone.has(p.phone);
        const resolvedUnitId =
          (existingUnitByPhone.get(p.phone) ?? null) || inferredByPhone.get(p.phone) || null;
        const existingSub = p.dateKey ? existingByPhoneDay.get(`${p.phone}|${p.dateKey}`) : undefined;
        const { paid, payOrigin } = classifyStatus(p.statusText);
        let status: RowStatus;
        let dupInfo: string | undefined;
        if (!paid) {
          // Não pago (recusado, pendente, estornado, não capturado): fica desmarcado.
          status = "ignored_status";
        } else if (existingSub) {
          // Já existe assinatura desse cliente neste dia (recepção/balcão ou
          // re-importação do gateway) → possível duplicata, não importa por padrão.
          status = "dup";
          dupInfo = `${dupSourceLabel(existingSub.source)} · ${brl(existingSub.value)}`;
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
          dupInfo,
          rowId: `${p.phone}|${p.dateKey}|${p.valor.toFixed(2)}|${i}`,
          // Novo só na 1ª cobrança de um cliente sem assinatura ativa na base.
          isLikelyNew: firstNewIdxByPhone.get(p.phone) === i,
          payOrigin,
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
    const toImport = rows.filter(willImportRow);
    if (toImport.length === 0) {
      toast.error("Nada para importar.");
      return;
    }
    setImporting(true);
    try {
      // Registra o lote de importação (histórico + base para exclusão depois).
      const totalValue = toImport.reduce((a, r) => a + r.valor, 0);
      const { data: batchRow, error: batchErr } = await supabase
        .from("controller_import_batches")
        .insert({
          organization_id: organizationId,
          file_name: fileName || null,
          row_count: toImport.length,
          total_value: totalValue,
        })
        .select("id")
        .single();
      if (batchErr || !batchRow) {
        throw new Error("Falha ao registrar o lote de importação. Tente novamente.");
      }
      const batchId = batchRow.id as string;

      // Data de início por cliente que entra como NOVA ADESÃO (menor data).
      const newStartedByPhone = new Map<string, string>();
      for (const r of toImport) {
        if (effKind(r) === "new" && r.dateKey) {
          const cur = newStartedByPhone.get(r.phone);
          if (!cur || r.dateKey < cur) newStartedByPhone.set(r.phone, r.dateKey);
        }
      }

      // Decide a data do novo ciclo de cada linha respeitando a política do
      // cliente (vencimento prevalece por padrão; re-ancora só em "follow_payment").
      // Cobranças do MESMO cliente são processadas em ordem de data, encadeando o
      // vencimento: a 1ª avança o vencimento para a 2ª, etc. (não trata a 2ª como
      // atrasada contra o vencimento pré-importação).
      type Computed = { r: ParsedRow; cycle: RenewalDueResult };
      const byPhone = new Map<string, ParsedRow[]>();
      for (const r of toImport) {
        const arr = byPhone.get(r.phone) || [];
        arr.push(r);
        byPhone.set(r.phone, arr);
      }
      const computed: Computed[] = [];
      // Atualização final de ciclo por cliente (última cobrança da sequência).
      const clientCycleByPhone = new Map<
        string,
        { last: Computed; anyFlag: boolean; policyWasFollow: boolean }
      >();
      for (const [phone, group] of byPhone) {
        const sorted = [...group].sort((a, b) => (a.dateKey || "").localeCompare(b.dateKey || ""));
        let runningDue = sorted[0].currentDueDate ? parseISO(sorted[0].currentDueDate) : null;
        let runningPolicy: DuePolicy = sorted[0].duePolicy;
        const policyWasFollow = sorted[0].duePolicy === "follow_payment";
        let anyFlag = false;
        let last: Computed | null = null;
        for (const r of sorted) {
          const paymentDate = r.dateKey ? parseISO(r.dateKey) : new Date();
          // Nova adesão começa ciclo do zero (ancora no pagamento); renovação parte
          // do vencimento vigente encadeado.
          const base = effKind(r) === "new" ? null : runningDue;
          const cycle = computeRenewalDue(base, paymentDate, runningPolicy);
          computed.push({ r, cycle });
          runningDue = cycle.nextDue; // encadeia para a próxima cobrança
          runningPolicy = "keep"; // follow_payment vale só para a 1ª cobrança
          if (cycle.shouldFlag) anyFlag = true;
          last = { r, cycle };
        }
        if (last && phone) {
          clientCycleByPhone.set(phone, { last, anyFlag, policyWasFollow });
        }
      }

      const payload = computed.map(({ r, cycle }) => {
        const isNew = effKind(r) === "new";
        return {
          organization_id: organizationId,
          barber_id: null,
          item_type: "subscription",
          item_name: `Assinatura ${r.planText || ""}`.trim(),
          // Origem derivada do Status: balcão ("pago fora do sistema") → reception;
          // gateway → online (nova adesão / link) ou auto_recurring (renovação).
          subscription_action: isNew ? "new" : "renew",
          attribution_source: attributionFor(r.payOrigin, isNew),
          source: "manager",
          price_sold: r.valor,
          commission_rate_used: 0,
          commission_amount: 0,
          subscription_plan_id: r.planId,
          unit_id: effUnitId(r),
          client_name: r.clientName || null,
          mobile_phone: r.phone,
          // Cliente novo de fato só quando não existia na base.
          is_new_client: isNew ? !r.clientExists : false,
          import_batch_id: batchId,
          created_at: r.dateKey ? `${r.dateKey}T12:00:00${MANAUS_OFFSET}` : undefined,
          description: r.dateKey ? serializeCycleMetadata(cycle.anchor, cycle.nextDue) : null,
        };
      });

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

      // Atualiza o ciclo de cada cliente a partir da ÚLTIMA cobrança da sequência
      // (o vencimento já foi encadeado acima). A flag agrega qualquer atraso >10d
      // ocorrido na sequência; se a política era follow_payment, volta para keep.
      const dueEntries = [...clientCycleByPhone.entries()];
      for (let i = 0; i < dueEntries.length; i += 8) {
        const chunk = dueEntries.slice(i, i + 8);
        await Promise.all(
          chunk.map(async ([phone, { last, anyFlag, policyWasFollow }]) => {
            const upd: Record<string, unknown> = {
              subscription_due_date: formatDueDate(last.cycle.nextDue),
              subscription_last_payment_at: last.r.dateKey,
              subscription_last_late_days: last.cycle.lateDays,
            };
            if (anyFlag) {
              upd.subscription_payment_shift_flagged_at = new Date().toISOString();
            }
            // Troca aplicada: volta para "keep" (a nova data agora vigora).
            if (policyWasFollow) upd.subscription_due_policy = "keep";
            // Nova adesão: registra a data de início da assinatura.
            const startedAt = newStartedByPhone.get(phone);
            if (startedAt) upd.subscription_started_at = startedAt;
            await supabase
              .from("clients")
              .update(upd)
              .eq("organization_id", organizationId)
              .eq("mobile_phone", phone);
          }),
        );
      }

      const newCount = toImport.filter((r) => effKind(r) === "new").length;
      const renewCount = inserted - newCount;
      toast.success(
        `${inserted} lançamento${inserted === 1 ? "" : "s"} importado${inserted === 1 ? "" : "s"}` +
          ` · ${newCount} nova(s) adesão(ões) · ${renewCount} renovação(ões)` +
          `${clientsCreated > 0 ? ` · ${clientsCreated} cliente(s) novo(s)` : ""}` +
          `${clientErrors > 0 ? ` · ${clientErrors} ignorado(s) por telefone/nome inválido` : ""}.`
      );
      reset();
      loadBatches();
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
          Suba o relatório de cobranças do cartão (separado por ";"). Todas as linhas aparecem com o
          status; por padrão as pagas são importadas — "Capturada na Operadora" (renovação automática)
          e "Pago fora do sistema" (quitado no balcão). As de outro status (recusado, pendente,
          estornado, não capturado...) ficam desmarcadas e você marca "importar mesmo assim" se quiser.
          Por cliente, o sistema cruza os dados: busca pelo telefone, cadastra se não existir e
          identifica a unidade pelos últimos atendimentos. Cada linha mostra a origem resultante —
          renovação automática, nova adesão online, novo no balcão ou renovou no balcão — conforme o
          status e o tipo (Nova adesão/Renovação). Se a recepção já lançou a assinatura daquele cliente
          no mesmo dia, a linha é marcada como possível duplicata e não é importada (também com
          "importar mesmo assim").
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
                <p className="text-xs text-muted-foreground">Outros status</p>
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
                    <TableHead>Tipo</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} className={(((r.status === "dup" || r.status === "ignored_status") && !forcedImport.has(r.rowId))) ? "opacity-50" : ""}>
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
                          if ((r.status === "dup" || r.status === "ignored_status") && !forcedImport.has(r.rowId)) {
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
                        {willImportRow(r) ? (
                          <div className="space-y-1">
                            <Select
                              value={effKind(r)}
                              onValueChange={(v) =>
                                setRowKind((m) => ({ ...m, [r.rowId]: v as ImportKind }))
                              }
                            >
                              <SelectTrigger className="h-8 w-[130px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="renew">Renovação</SelectItem>
                                <SelectItem value="new">Nova adesão</SelectItem>
                              </SelectContent>
                            </Select>
                            {/* Origem resultante: distingue renov. automática x balcão. */}
                            <p
                              className={`text-[10px] leading-tight ${
                                r.payOrigin === "counter"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {originLabel(r.payOrigin, effKind(r) === "new")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.status === "dup" ? (
                          <div className="space-y-1">
                            <Badge
                              variant="outline"
                              className={forcedImport.has(r.rowId)
                                ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                                : "border-amber-500/40 text-amber-600 dark:text-amber-400"}
                            >
                              {forcedImport.has(r.rowId) ? "Importar" : "Possível duplicata"}
                            </Badge>
                            {r.dupInfo && (
                              <p className="text-[10px] text-muted-foreground leading-tight">já lançado: {r.dupInfo}</p>
                            )}
                            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-3 w-3 accent-primary"
                                checked={forcedImport.has(r.rowId)}
                                onChange={(e) =>
                                  setForcedImport((s) => {
                                    const next = new Set(s);
                                    if (e.target.checked) next.add(r.rowId);
                                    else next.delete(r.rowId);
                                    return next;
                                  })
                                }
                              />
                              importar mesmo assim
                            </label>
                          </div>
                        ) : r.status === "ignored_status" ? (
                          <div className="space-y-1">
                            <Badge
                              variant="outline"
                              className={forcedImport.has(r.rowId)
                                ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"}
                            >
                              {forcedImport.has(r.rowId) ? "Importar" : (r.statusText || "Sem status")}
                            </Badge>
                            {!forcedImport.has(r.rowId) && (
                              <p className="text-[10px] text-muted-foreground leading-tight">não capturado</p>
                            )}
                            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-3 w-3 accent-primary"
                                checked={forcedImport.has(r.rowId)}
                                onChange={(e) =>
                                  setForcedImport((s) => {
                                    const next = new Set(s);
                                    if (e.target.checked) next.add(r.rowId);
                                    else next.delete(r.rowId);
                                    return next;
                                  })
                                }
                              />
                              importar mesmo assim
                            </label>
                          </div>
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
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Importar {counts.ok} lançamento{counts.ok === 1 ? "" : "s"}
                </>
              )}
            </Button>
          </>
        )}

        {/* Histórico de importações — permite excluir uma importação inteira */}
        {batches.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-sm font-semibold mb-2">Importações recentes</p>
            <div className="space-y-2">
              {batches.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.file_name || "Importação"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleString("pt-BR")} · {b.row_count} lançamento
                      {b.row_count === 1 ? "" : "s"} · {brl(Number(b.total_value) || 0)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-destructive hover:text-destructive"
                    disabled={deletingBatch === b.id}
                    onClick={() => deleteBatch(b)}
                  >
                    {deletingBatch === b.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <X className="w-3.5 h-3.5 mr-1" /> Excluir
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
