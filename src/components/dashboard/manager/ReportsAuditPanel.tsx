import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentMonthYear, getTodayString } from "@/lib/dateUtils";
import AuditFindingModal, { type AuditCheckKey } from "./AuditFindingModal";

interface ReportsAuditPanelProps {
  onNavigate?: (tab: string) => void;
}

interface Finding {
  check_key: AuditCheckKey;
  count: number;
  total_value: number | null;
  severity: "critical" | "warning" | "ok";
}

const CHECK_META: Record<
  AuditCheckKey,
  { title: string; description: string; hint: string }
> = {
  dup_clients_phone: {
    title: "Clientes duplicados (telefone)",
    description: "Telefones repetidos no cadastro de clientes.",
    hint: "O mesmo telefone em mais de um cadastro divide o histórico de visitas e quebra a leitura de assinaturas. O filtro de unidade usa a unidade de origem do cliente.",
  },
  dup_clients_name: {
    title: "Clientes duplicados (nome)",
    description: "Nomes iguais com cadastros diferentes.",
    hint: "Pode ser homônimo legítimo, mas também é a causa mais comum de cliente novo contado duas vezes. O filtro de unidade usa a unidade de origem do cliente.",
  },

  missing_days: {
    title: "Dias sem lançamento",
    description: "Barbeiros ativos sem produção nem presença registrada no dia.",
    hint: "Dias sem registro derrubam o pacing da meta e o fechamento mensal.",
  },
  subscription_commission: {
    title: "Assinaturas com comissão gravada",
    description: "Vendas de assinatura com comissão diferente de zero.",
    hint: "Pela regra do projeto, assinatura não gera comissão operacional: o valor precisa ser zerado na auditoria.",
  },
  orphan_sales: {
    title: "Vendas sem produção vinculada",
    description: "Transações de barbeiro sem daily_production.",
    hint: "Essas vendas somam no Ao Vivo mas podem não aparecer nos relatórios agregados por produção.",
  },
  subscription_no_phone: {
    title: "Adesões sem telefone",
    description: "Novas adesões sem telefone informado.",
    hint: "Sem telefone a adesão não entra na conversão nem no acompanhamento da carteira.",
  },
  production_mismatch: {
    title: "Produção fora do total de vendas",
    description: "Totais da produção diária que não fecham com a soma das vendas.",
    hint: "Indica agregados defasados: o relatório e o modal de auditoria mostram números diferentes.",
  },
};

const CHECK_ORDER: AuditCheckKey[] = [
  "subscription_commission",
  "production_mismatch",
  "orphan_sales",
  "dup_clients_phone",
  "missing_days",
  "dup_clients_name",
  "subscription_no_phone",
];

const currency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function ReportsAuditPanel({ onNavigate }: ReportsAuditPanelProps) {
  const { organizationId } = useOrganization();
  const { month, year } = getCurrentMonthYear();

  const [start, setStart] = useState(
    `${year}-${String(month).padStart(2, "0")}-01`
  );
  const [end, setEnd] = useState(getTodayString());
  const [unitId, setUnitId] = useState<string>("all");
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCheck, setOpenCheck] = useState<AuditCheckKey | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("units")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setUnits(data ?? []));
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "get_report_audit_findings",
      {
        p_start: start,
        p_end: end,
        p_unit_id: unitId === "all" ? null : unitId,
      }
    );
    if (rpcError) {
      console.error("Erro ao carregar auditoria de relatórios:", rpcError);
      setError("Não foi possível carregar a auditoria.");
      setFindings([]);
    } else {
      const payload = (data ?? {}) as { findings?: Finding[] };
      setFindings(payload.findings ?? []);
    }
    setLoading(false);
  }, [organizationId, start, end, unitId]);

  useEffect(() => {
    load();
  }, [load]);

  const byKey = new Map(findings.map((f) => [f.check_key, f]));
  const totalIssues = findings.reduce((sum, f) => sum + (f.count || 0), 0);
  const criticalCount = findings.filter(
    (f) => f.severity === "critical" && f.count > 0
  ).length;

  return (
    <div className="space-y-6">
      <Card className="glass-strong">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Auditoria de Inconsistências
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="min-h-[44px]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reexecutar
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Verificações automáticas sobre os dados que alimentam os relatórios.
            Clique em qualquer item para revisar os registros.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">De</label>
              <Input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="text-base min-h-[44px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Até</label>
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="text-base min-h-[44px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Unidade</label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="text-base min-h-[44px]">
                  <SelectValue placeholder="Todas as unidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as unidades</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!loading && !error && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {totalIssues === 0 ? (
                <span className="flex items-center gap-2 text-emerald-500">
                  <CheckCircle2 className="w-4 h-4" />
                  Nenhuma inconsistência encontrada no período.
                </span>
              ) : (
                <>
                  <Badge variant="destructive">
                    {totalIssues} registros para revisar
                  </Badge>
                  <span className="text-muted-foreground">
                    {criticalCount} verificação(ões) crítica(s)
                  </span>
                </>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {CHECK_ORDER.map((key) => {
            const meta = CHECK_META[key];
            const finding = byKey.get(key);
            const count = finding?.count ?? 0;
            const isCritical = finding?.severity === "critical" && count > 0;
            const isWarning = finding?.severity === "warning" && count > 0;

            return (
              <button
                key={key}
                type="button"
                disabled={count === 0}
                onClick={() => setOpenCheck(key)}
                className={cn(
                  "text-left rounded-xl border p-4 transition-colors min-h-[44px]",
                  "bg-card/60 border-border/60",
                  count > 0 && "hover:bg-accent/40 cursor-pointer",
                  isCritical && "border-destructive/50",
                  isWarning && "border-amber-500/40",
                  count === 0 && "opacity-70 cursor-default"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 font-medium text-sm">
                      {count > 0 ? (
                        <AlertTriangle
                          className={cn(
                            "w-4 h-4",
                            isCritical ? "text-destructive" : "text-amber-500"
                          )}
                        />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      )}
                      {meta.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {meta.description}
                    </p>
                    <p className="text-xs text-muted-foreground/80">{meta.hint}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        "font-display text-2xl font-semibold",
                        isCritical
                          ? "text-destructive"
                          : isWarning
                            ? "text-amber-500"
                            : "text-emerald-500"
                      )}
                    >
                      {count}
                    </p>
                    {finding?.total_value != null && count > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {currency(Number(finding.total_value))}
                      </p>
                    )}
                    {count > 0 && (
                      <span className="mt-1 inline-flex items-center text-[11px] text-primary">
                        Revisar <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <AuditFindingModal
        open={openCheck !== null}
        onOpenChange={(o) => !o && setOpenCheck(null)}
        checkKey={openCheck}
        title={openCheck ? CHECK_META[openCheck].title : ""}
        description={openCheck ? CHECK_META[openCheck].hint : ""}
        start={start}
        end={end}
        unitId={unitId === "all" ? null : unitId}
        onNavigate={onNavigate}
      />
    </div>
  );
}
