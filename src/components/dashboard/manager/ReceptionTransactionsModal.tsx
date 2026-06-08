import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, UserPlus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ReceptionTx {
  id: string;
  created_at: string;
  client_name: string | null;
  item_name: string;
  item_type: string;
  price_sold: number;
}

interface BarberOption {
  id: string;
  name: string;
  unit_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  unitId: string;
  unitName: string;
  date: string; // YYYY-MM-DD
  barbers: BarberOption[];
  onSuccess: () => void;
}

export default function ReceptionTransactionsModal({
  open,
  onOpenChange,
  organizationId,
  unitId,
  unitName,
  date,
  barbers,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState<ReceptionTx[]>([]);
  const [reassignMap, setReassignMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const eligibleBarbers = useMemo(
    () => barbers.filter((b) => b.unit_id === unitId),
    [barbers, unitId]
  );

  useEffect(() => {
    if (!open) return;
    fetchTxs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unitId, date, organizationId]);

  const fetchTxs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sale_transactions")
      .select("id, created_at, client_name, item_name, item_type, price_sold")
      .eq("organization_id", organizationId)
      .eq("unit_id", unitId)
      .is("barber_id", null)
      .eq("source", "manager")
      .gte("created_at", `${date}T00:00:00-04:00`)
      .lte("created_at", `${date}T23:59:59-04:00`)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao buscar vendas da recepção.");
    } else {
      setTxs(data || []);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta venda? Esta ação não pode ser desfeita.")) return;
    setBusyId(id);
    const { error } = await supabase.from("sale_transactions").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error("Erro ao excluir venda.");
      return;
    }
    toast.success("Venda excluída.");
    fetchTxs();
    onSuccess();
  };

  const handleReassign = async (tx: ReceptionTx) => {
    const newBarberId = reassignMap[tx.id];
    if (!newBarberId) {
      toast.error("Selecione um barbeiro para reatribuir.");
      return;
    }
    setBusyId(tx.id);
    const { error } = await supabase
      .from("sale_transactions")
      .update({ barber_id: newBarberId })
      .eq("id", tx.id);
    setBusyId(null);
    if (error) {
      toast.error("Erro ao reatribuir venda.");
      return;
    }
    toast.success("Venda reatribuída ao barbeiro.");
    fetchTxs();
    onSuccess();
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-500" />
            Vendas da Recepção · {unitName}
          </DialogTitle>
          <DialogDescription>
            {format(new Date(date + "T00:00:00"), "dd/MM/yyyy")} — Excluir vendas incorretas
            ou reatribuir ao barbeiro correto.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : txs.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            Nenhuma venda da recepção neste dia.
          </p>
        ) : (
          <div className="space-y-3">
            {txs.map((tx) => (
              <div
                key={tx.id}
                className="border border-border rounded-lg p-3 bg-card space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{tx.item_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.client_name?.trim() || "Cliente não informado"} ·{" "}
                      {format(new Date(tx.created_at), "HH:mm")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-primary">{formatCurrency(tx.price_sold)}</p>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {tx.item_type}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-border/40">
                  <div className="flex-1 flex gap-2">
                    <Select
                      value={reassignMap[tx.id] || ""}
                      onValueChange={(v) =>
                        setReassignMap((prev) => ({ ...prev, [tx.id]: v }))
                      }
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Reatribuir ao barbeiro..." />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleBarbers.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                        {eligibleBarbers.length === 0 && (
                          <SelectItem value="__none__" disabled>
                            Nenhum barbeiro nesta unidade
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === tx.id || !reassignMap[tx.id]}
                      onClick={() => handleReassign(tx)}
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      Reatribuir
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === tx.id}
                    onClick={() => handleDelete(tx.id)}
                  >
                    {busyId === tx.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1" />
                    )}
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
