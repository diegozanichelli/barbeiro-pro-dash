import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, FileDown, Loader2, Search, Sheet, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getManausDate, toDateKey } from "@/lib/dateUtils";
import BarberCombobox from "./BarberCombobox";
import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  InactiveClientRow,
  buildInactiveClientsCsv,
  downloadCsv,
  fetchInactiveClients,
  fmtBRL,
  fmtDateBR,
  groupByBucket,
  maskPhone,
} from "@/lib/inactiveClients";
import { generateInactiveClientsPdf } from "@/lib/inactiveClientsPdf";

export default function InactiveClientsReport() {
  const { organizationId } = useOrganization();
  const { toast } = useToast();

  const [refDate, setRefDate] = useState<Date>(getManausDate());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [unitId, setUnitId] = useState<string>("all");
  const [barberId, setBarberId] = useState<string | null>(null);
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<InactiveClientRow[] | null>(null);
  const [applied, setApplied] = useState<{ unitId: string; barberName: string; refDate: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [barberName, setBarberName] = useState<string>("Todos");

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("units")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setUnits(data || []));
  }, [organizationId]);

  useEffect(() => {
    if (!barberId) {
      setBarberName("Todos");
      return;
    }
    supabase
      .from("barbers")
      .select("name")
      .eq("id", barberId)
      .maybeSingle()
      .then(({ data }) => setBarberName(data?.name || "Barbeiro"));
  }, [barberId]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await fetchInactiveClients({
        unitId: unitId === "all" ? null : unitId,
        barberId,
        refDate: toDateKey(refDate),
      });
      setRows(result);
      setApplied({ unitId, barberName, refDate: toDateKey(refDate) });
    } catch (err: unknown) {
      console.error("Erro ao gerar relatório de clientes inativos", err);
      toast({
        title: "Erro ao gerar relatório",
        description: (err as { message?: string })?.message || "Tente novamente.",
        variant: "destructive",
      });
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => groupByBucket(rows || []), [rows]);
  const appliedUnitName =
    !applied || applied.unitId === "all"
      ? "Todas as unidades"
      : units.find((u) => u.id === applied.unitId)?.name || "Unidade";

  const totalSubs = (rows || []).filter((r) => r.is_subscriber).length;

  const handlePdf = () => {
    if (!rows || !applied) return;
    generateInactiveClientsPdf({
      rows,
      unitName: appliedUnitName,
      barberName: applied.barberName,
      refDate: applied.refDate,
    });
  };

  const handleCsv = () => {
    if (!rows || !applied) return;
    downloadCsv(`clientes-inativos-${applied.refDate}.csv`, buildInactiveClientsCsv(rows));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Clientes Inativos</CardTitle>
          <CardDescription>
            Clientes que não retornam há 30, 60 ou 90+ dias, por unidade e por barbeiro. Faixas exclusivas: cada
            cliente aparece em apenas uma faixa. A coluna "Visita anterior" mostra a penúltima vinda do cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Unidade</span>
              <Select
                value={unitId}
                onValueChange={(v) => {
                  setUnitId(v);
                  setBarberId(null);
                }}
              >
                <SelectTrigger className="h-11">
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

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Barbeiro (opcional)</span>
              {organizationId && (
                <BarberCombobox
                  organizationId={organizationId}
                  value={barberId}
                  onChange={setBarberId}
                  allowReception={false}
                  unitId={unitId === "all" ? null : unitId}
                  placeholder="Todos os barbeiros..."
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Data de referência</span>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal h-11">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {format(refDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={refDate}
                    onSelect={(d) => {
                      if (d) setRefDate(d);
                      setCalendarOpen(false);
                    }}
                    locale={ptBR}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground max-w-md">
              Ao filtrar por barbeiro, o cliente aparece se ele já foi atendido por esse barbeiro — mesmo que a última
              visita tenha sido com outro profissional.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={handleGenerate} disabled={loading} className="h-11">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Gerar relatório
              </Button>
              <Button variant="outline" className="h-11" disabled={!rows?.length} onClick={handlePdf}>
                <FileDown className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
              <Button variant="outline" className="h-11" disabled={!rows?.length} onClick={handleCsv}>
                <Sheet className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {rows && rows.length === 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nenhum cliente inativo</CardTitle>
            <CardDescription>
              Com os filtros aplicados ({appliedUnitName} • {applied?.barberName}), todos os clientes retornaram nos
              últimos 30 dias em relação a {fmtDateBR(applied?.refDate)}.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {rows && rows.length > 0 && applied && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl flex items-center gap-2">
                <UserX className="w-5 h-5 text-destructive" />
                {rows.length} clientes sem retornar
              </CardTitle>
              <CardDescription>
                {appliedUnitName} • {applied.barberName} • referência {fmtDateBR(applied.refDate)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: "Total inativos", value: String(rows.length) },
                { label: "Assinantes", value: String(totalSubs) },
                { label: "Avulsos", value: String(rows.length - totalSubs) },
                {
                  label: "Valor histórico",
                  value: fmtBRL(rows.reduce((s, r) => s + r.total_spent, 0)),
                },
                {
                  label: "90+ dias",
                  value: String(grouped["90_plus"].length),
                },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-lg font-bold">{k.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {BUCKET_ORDER.map((bucket) => {
            const list = grouped[bucket];
            const subs = list.filter((r) => r.is_subscriber).length;
            return (
              <Card key={bucket}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{BUCKET_LABEL[bucket]}</CardTitle>
                  <CardDescription>
                    {list.length} clientes • {subs} assinantes •{" "}
                    {fmtBRL(list.reduce((s, r) => s + r.total_spent, 0))} já gastos historicamente
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum cliente nesta faixa.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[900px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Última visita</TableHead>
                            <TableHead>Últ. barbeiro</TableHead>
                            <TableHead>Últ. unidade</TableHead>
                            <TableHead className="text-right">Visitas</TableHead>
                            <TableHead className="text-right">Total gasto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {list.map((r, idx) => (
                            <TableRow key={`${bucket}-${r.mobile_phone}`}>
                              <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className={idx < 10 ? "font-semibold" : ""}>{r.client_name}</TableCell>
                              <TableCell className="text-muted-foreground">{maskPhone(r.mobile_phone)}</TableCell>
                              <TableCell>
                                {r.is_subscriber ? (
                                  <Badge variant="default">Assinante</Badge>
                                ) : (
                                  <Badge variant="outline">Avulso</Badge>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {fmtDateBR(r.last_visit)}{" "}
                                <span className="text-xs text-destructive">({r.days_inactive} dias)</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  anterior: ({fmtDateBR(r.previous_visit)})
                                </span>
                              </TableCell>
                              <TableCell>{r.last_barber_name || "Recepção"}</TableCell>
                              <TableCell>{r.last_unit_name || "—"}</TableCell>
                              <TableCell className="text-right">{r.visits}</TableCell>
                              <TableCell className="text-right">{fmtBRL(r.total_spent)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
