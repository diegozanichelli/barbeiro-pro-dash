import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, FileDown, Loader2, Search, TrendingDown, TrendingUp } from "lucide-react";
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
import { getManausDate } from "@/lib/dateUtils";
import BarberCombobox from "./BarberCombobox";
import {
  BarberReportData,
  CATEGORY_LABEL,
  fetchBarberReport,
  fmtBRL,
  fmtDateBR,
  maskPhone,
} from "@/lib/barberReport";
import { generateBarberReportPdf } from "@/lib/barberReportPdf";

const toISO = (d: Date) => format(d, "yyyy-MM-dd");

function DateField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="justify-start text-left font-normal min-w-[150px] h-11">
            <CalendarIcon className="w-4 h-4 mr-2" />
            {format(value, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => {
              if (d) onChange(d);
              setOpen(false);
            }}
            locale={ptBR}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function BarberReportPage() {
  const { organizationId } = useOrganization();
  const { toast } = useToast();

  const today = getManausDate();
  const [startDate, setStartDate] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [endDate, setEndDate] = useState<Date>(today);
  const [unitId, setUnitId] = useState<string>("all");
  const [appliedUnitId, setAppliedUnitId] = useState<string>("all");
  const [barberId, setBarberId] = useState<string | null>(null);
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [data, setData] = useState<BarberReportData | null>(null);
  const [loading, setLoading] = useState(false);


  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("units")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("name")
      .then(({ data: rows }) => setUnits(rows || []));
  }, [organizationId]);

  const runReport = async (unitFilter: string) => {
    if (!barberId) {
      toast({ title: "Selecione um barbeiro", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const result = await fetchBarberReport(
        barberId,
        toISO(startDate),
        toISO(endDate),
        unitFilter === "all" ? null : unitFilter
      );
      setData(result);
      setAppliedUnitId(unitFilter);
    } catch (err: unknown) {
      console.error("Erro ao gerar relatório do barbeiro", err);
      toast({
        title: "Erro ao gerar relatório",
        description: (err as { message?: string })?.message || "Tente novamente.",
        variant: "destructive",
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => runReport(unitId);

  const handleRetryAllUnits = () => {
    setUnitId("all");
    runReport("all");
  };


  const grouped = useMemo(() => {
    const map: Record<string, BarberReportData["items"]> = { service: [], product: [], subscription: [] };
    (data?.items || []).forEach((i) => {
      if (map[i.category]) map[i.category].push(i);
    });
    return map;
  }, [data]);

  const totals = data?.totals;
  const ticket = totals && totals.visits > 0 ? totals.revenue / totals.visits : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Relatório do Barbeiro</CardTitle>
          <CardDescription>
            Análise individual por período: o que mais e o que menos vende (serviços, produtos e assinaturas) e a lista
            completa de clientes com o que cada um consumiu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <span className="text-xs text-muted-foreground">Unidade</span>
              <Select value={unitId} onValueChange={setUnitId}>
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

            <div className="flex flex-col gap-1.5 min-w-[220px]">
              <span className="text-xs text-muted-foreground">Barbeiro</span>
              {organizationId && (
                <BarberCombobox
                  organizationId={organizationId}
                  value={barberId}
                  onChange={(id) => setBarberId(id)}
                  allowReception={false}
                  placeholder="Selecionar barbeiro..."
                />
              )}
            </div>

            <DateField label="Data inicial" value={startDate} onChange={setStartDate} />
            <DateField label="Data final" value={endDate} onChange={setEndDate} />

            <Button onClick={handleGenerate} disabled={loading || !barberId} className="h-11">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Gerar relatório
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={!data}
              onClick={() => data && generateBarberReportPdf(data)}
            >
              <FileDown className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {data && totals && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">{data.barber?.name}</CardTitle>
              <CardDescription>
                {data.barber?.unit_name || "Sem unidade"} • {fmtDateBR(data.period.start)} a {fmtDateBR(data.period.end)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "Faturamento", value: fmtBRL(totals.revenue) },
                { label: "Operacional", value: fmtBRL(totals.operational_revenue) },
                {
                  label: "Comissão (sem assinaturas)",
                  value: fmtBRL(totals.commission),
                },
                { label: "Assinaturas vendidas", value: String(data.by_category?.subscription?.qty || 0) },
                { label: "Atendimentos", value: String(totals.visits) },
                { label: "Ticket médio", value: fmtBRL(ticket) },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-lg font-bold">{k.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(["service", "product", "subscription"] as const).map((cat) => {
              const row = data.by_category?.[cat] || { qty: 0, revenue: 0, commission: 0 };
              const items = grouped[cat] || [];
              const best = items[0];
              const worst = items.length > 1 ? items[items.length - 1] : null;
              return (
                <Card key={cat}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{CATEGORY_LABEL[cat]}</CardTitle>
                    <CardDescription>
                      {cat === "subscription"
                        ? `${row.qty} assinaturas vendidas (sem comissão)`
                        : `${row.qty} vendas • ${fmtBRL(row.revenue)}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[hsl(var(--success))]" />
                      <span className="truncate">{best ? `${best.item_name} (${best.qty}x)` : "Sem vendas"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-destructive" />
                      <span className="truncate">{worst ? `${worst.item_name} (${worst.qty}x)` : "—"}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {(["service", "product", "subscription"] as const).map((cat) => {
            const items = grouped[cat] || [];
            const catTotal = items.reduce((s, i) => s + Number(i.revenue || 0), 0);
            return (
              <Card key={cat}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{CATEGORY_LABEL[cat]} — ranking completo</CardTitle>
                  <CardDescription>{items.length} itens diferentes no período</CardDescription>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma venda desta categoria no período.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                            <TableHead className="text-right">Faturamento</TableHead>
                            <TableHead className="text-right">% categoria</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((i, idx) => (
                            <TableRow key={`${cat}-${i.item_name}`}>
                              <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="font-medium">
                                {i.item_name}
                                {idx < 3 && <Badge className="ml-2" variant="secondary">Mais vendido</Badge>}
                                {items.length > 3 && idx >= items.length - 3 && (
                                  <Badge className="ml-2" variant="outline">Menos vendido</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">{i.qty}</TableCell>
                              <TableCell className="text-right">{fmtBRL(i.revenue)}</TableCell>
                              <TableCell className="text-right">
                                {catTotal > 0 ? `${((i.revenue / catTotal) * 100).toFixed(1)}%` : "0,0%"}
                              </TableCell>
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Clientes atendidos</CardTitle>
              <CardDescription>
                {data.clients?.length || 0} clientes, ordenados por valor gasto (os 10 primeiros são os melhores clientes)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-right">Visitas</TableHead>
                      <TableHead className="text-right">Total gasto</TableHead>
                      <TableHead>O que consumiu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.clients || []).map((c, idx) => (
                      <TableRow key={`${c.phone || "sem"}-${idx}`}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className={idx < 10 ? "font-semibold" : ""}>{c.client_name}</TableCell>
                        <TableCell className="text-muted-foreground">{maskPhone(c.phone)}</TableCell>
                        <TableCell className="text-right">{c.visits}</TableCell>
                        <TableCell className="text-right">{fmtBRL(c.revenue)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(c.items || []).map((i) => `${i.qty}x ${i.item_name}`).join(", ")}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(data.clients || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Nenhum cliente no período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {data.never_sold?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Não vendeu no período</CardTitle>
                <CardDescription>{data.never_sold.length} itens ativos do catálogo sem nenhuma venda</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.never_sold.map((n) => (
                  <Badge key={`${n.kind}-${n.name}`} variant="outline">
                    {n.name} · {n.kind === "service" ? "Serviço" : "Produto"}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
