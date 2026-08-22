import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { formatManausDateTime } from "@/lib/dateUtils";
import { format, parseISO } from "date-fns";

export type AuditCheckKey =
  | "dup_clients_phone"
  | "dup_clients_name"
  | "missing_days"
  | "subscription_commission"
  | "orphan_sales"
  | "subscription_no_phone"
  | "production_mismatch";

interface AuditFindingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkKey: AuditCheckKey | null;
  title: string;
  description: string;
  start: string;
  end: string;
  unitId: string | null;
  onNavigate?: (tab: string) => void;
}

type Row = Record<string, unknown>;

const currency = (v: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(v || 0)
  );

const dayLabel = (v: unknown) => {
  const raw = String(v || "");
  if (!raw) return "-";
  try {
    return format(parseISO(raw.slice(0, 10)), "dd/MM/yyyy");
  } catch {
    return raw;
  }
};

export default function AuditFindingModal({
  open,
  onOpenChange,
  checkKey,
  title,
  description,
  start,
  end,
  unitId,
  onNavigate,
}: AuditFindingModalProps) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !checkKey) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc(
        "get_audit_finding_rows",
        {
          p_check_key: checkKey,
          p_start: start,
          p_end: end,
          p_unit_id: unitId,
          p_limit: 300,
          p_offset: 0,
        }
      );
      if (cancelled) return;
      if (rpcError) {
        console.error("Erro ao carregar detalhamento da auditoria:", rpcError);
        setError("Não foi possível carregar o detalhamento.");
        setRows([]);
      } else {
        const payload = (data ?? {}) as { rows?: Row[] };
        setRows(payload.rows ?? []);
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, checkKey, start, end, unitId]);

  const renderGroups = () => (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const clients = (row.clients as Row[]) || [];
        return (
          <div
            key={`${String(row.group_key)}-${i}`}
            className="rounded-lg border border-border/60 bg-card/50 p-3"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="font-medium text-sm">{String(row.label ?? "-")}</p>
              <Badge variant="destructive">{String(row.count)} registros</Badge>
            </div>
            <div className="space-y-1">
              {clients.map((c) => (
                <div
                  key={String(c.id)}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
                >
                  <span className="text-foreground">{String(c.name)}</span>
                  <span>{String(c.phone || "sem telefone")}</span>
                  <span>{String(c.unit_name || "sem unidade")}</span>
                  <span>{dayLabel(c.created_at)}</span>
                </div>
              ))}
            </div>

          </div>
        );
      })}
    </div>
  );

  const renderTable = (
    headers: string[],
    cells: (row: Row) => (string | number)[]
  ) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/30">
              {cells(row).map((cell, j) => (
                <td key={j} className="py-2 pr-3 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      );
    }
    if (error) {
      return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
    }
    if (rows.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma inconsistência encontrada nesta verificação.
        </p>
      );
    }

    switch (checkKey) {
      case "dup_clients_phone":
      case "dup_clients_name":
        return renderGroups();
      case "missing_days":
        return renderTable(["Data", "Barbeiro", "Unidade"], (r) => [
          dayLabel(r.date),
          String(r.barber_name ?? "-"),
          String(r.unit_name ?? "-"),
        ]);
      case "subscription_commission":
        return renderTable(
          ["Data", "Barbeiro", "Unidade", "Plano", "Cliente", "Valor", "Comissão"],
          (r) => [
            formatManausDateTime(String(r.created_at), "dd/MM/yyyy HH:mm"),
            String(r.barber_name ?? "-"),
            String(r.unit_name ?? "-"),
            String(r.item_name ?? "-"),
            String(r.client_name ?? "-"),
            currency(r.price_sold),
            currency(r.commission_amount),
          ]
        );
      case "orphan_sales":
        return renderTable(
          ["Data", "Barbeiro", "Unidade", "Item", "Tipo", "Origem", "Valor"],
          (r) => [
            formatManausDateTime(String(r.created_at), "dd/MM/yyyy HH:mm"),
            String(r.barber_name ?? "-"),
            String(r.unit_name ?? "-"),
            String(r.item_name ?? "-"),
            String(r.item_type ?? "-"),
            String(r.source ?? "-"),
            currency(r.price_sold),
          ]
        );
      case "subscription_no_phone":
        return renderTable(
          ["Data", "Barbeiro", "Unidade", "Plano", "Cliente", "Atribuição", "Valor"],
          (r) => [
            formatManausDateTime(String(r.created_at), "dd/MM/yyyy HH:mm"),
            String(r.barber_name ?? "-"),
            String(r.unit_name ?? "-"),
            String(r.item_name ?? "-"),
            String(r.client_name ?? "sem nome"),
            String(r.attribution_source ?? "-"),
            currency(r.price_sold),
          ]
        );
      case "production_mismatch":
        return renderTable(
          ["Data", "Barbeiro", "Unidade", "Produção (tx)", "Soma das vendas", "Diferença"],
          (r) => [
            dayLabel(r.date),
            String(r.barber_name ?? "-"),
            String(r.unit_name ?? "-"),
            currency(r.tx_total),
            currency(r.sales_total),
            currency(r.diff),
          ]
        );
      default:
        return null;
    }
  };

  const navTarget = (): { tab: string; label: string } | null => {
    switch (checkKey) {
      case "dup_clients_phone":
      case "dup_clients_name":
        return { tab: "clients", label: "Abrir Clientes" };
      case "missing_days":
      case "production_mismatch":
        return { tab: "overview", label: "Abrir Lançamentos Diários" };
      case "subscription_commission":
      case "subscription_no_phone":
        return { tab: "subscriptions", label: "Abrir Assinaturas" };
      case "orphan_sales":
        return { tab: "live", label: "Abrir Ao Vivo" };
      default:
        return null;
    }
  };

  const target = navTarget();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">{renderBody()}</div>

        {target && onNavigate && (
          <div className="pt-3 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              onClick={() => {
                onNavigate(target.tab);
                onOpenChange(false);
              }}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {target.label}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
