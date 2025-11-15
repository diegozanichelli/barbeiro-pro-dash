import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, TrendingUp, DollarSign, Users, Pencil } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";

interface RankingItem {
  barber_id: string;
  barber_name: string;
  unit_name: string;
  value: number;
}

export default function Leaderboard() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const [period, setPeriod] = useState("current_month");
  const [unitFilter, setUnitFilter] = useState("all");
  const [units, setUnits] = useState<any[]>([]);
  
  const [servicesRanking, setServicesRanking] = useState<RankingItem[]>([]);
  const [servicesExtraRanking, setServicesExtraRanking] = useState<RankingItem[]>([]);
  const [productsRanking, setProductsRanking] = useState<RankingItem[]>([]);
  const [ticketRanking, setTicketRanking] = useState<RankingItem[]>([]);
  const [commissionRanking, setCommissionRanking] = useState<RankingItem[]>([]);

  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [editingRanking, setEditingRanking] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    fetchUnits();
    fetchCustomNames();
  }, []);

  useEffect(() => {
    fetchRankings();
  }, [period, unitFilter]);

  const fetchUnits = async () => {
    const { data } = await supabase.from("units").select("*").eq("status", "active");
    if (data) setUnits(data);
  };

  const fetchCustomNames = async () => {
    if (!organization?.id) return;

    const { data } = await supabase
      .from("ranking_custom_names")
      .select("ranking_key, custom_name")
      .eq("organization_id", organization.id);

    if (data) {
      const names: Record<string, string> = {};
      data.forEach((item) => {
        names[item.ranking_key] = item.custom_name;
      });
      setCustomNames(names);
    }
  };

  const handleEditRanking = (rankingKey: string, currentName: string) => {
    setEditingRanking(rankingKey);
    setEditName(customNames[rankingKey] || currentName);
  };

  const handleSaveCustomName = async () => {
    if (!organization?.id || !editingRanking) return;

    const { error } = await supabase
      .from("ranking_custom_names")
      .upsert({
        organization_id: organization.id,
        ranking_key: editingRanking,
        custom_name: editName,
      });

    if (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o nome customizado.",
        variant: "destructive",
      });
      return;
    }

    setCustomNames((prev) => ({
      ...prev,
      [editingRanking]: editName,
    }));

    toast({
      title: "Nome atualizado!",
      description: "O nome do ranking foi atualizado com sucesso.",
    });

    setEditingRanking(null);
    setEditName("");
  };

  const handleResetToDefault = async () => {
    if (!organization?.id || !editingRanking) return;

    const { error } = await supabase
      .from("ranking_custom_names")
      .delete()
      .eq("organization_id", organization.id)
      .eq("ranking_key", editingRanking);

    if (error) {
      toast({
        title: "Erro ao resetar",
        description: "Não foi possível resetar o nome.",
        variant: "destructive",
      });
      return;
    }

    setCustomNames((prev) => {
      const updated = { ...prev };
      delete updated[editingRanking];
      return updated;
    });

    toast({
      title: "Nome resetado!",
      description: "O nome do ranking foi resetado para o padrão.",
    });

    setEditingRanking(null);
    setEditName("");
  };

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case "current_week":
        return {
          start: format(startOfWeek(now), "yyyy-MM-dd"),
          end: format(endOfWeek(now), "yyyy-MM-dd"),
        };
      case "current_month":
        return {
          start: format(startOfMonth(now), "yyyy-MM-dd"),
          end: format(endOfMonth(now), "yyyy-MM-dd"),
        };
      default:
        return {
          start: format(startOfMonth(now), "yyyy-MM-dd"),
          end: format(endOfMonth(now), "yyyy-MM-dd"),
        };
    }
  };

  const fetchRankings = async () => {
    const { start, end } = getDateRange();

    // Use the security definer function to get rankings for all barbers in the organization
    const { data: rankings, error } = await supabase.rpc("get_organization_rankings", {
      p_start_date: start,
      p_end_date: end,
      p_unit_id: unitFilter === "all" ? null : unitFilter,
    });

    if (error) {
      console.error("Error fetching rankings:", error);
      return;
    }

    if (!rankings) return;

    const statsArray = rankings.map((r: any) => ({
      barber_id: r.barber_id,
      barber_name: r.barber_name,
      unit_name: r.unit_name,
      services_total: Number(r.services_total) || 0,
      services_extra_total: Number(r.services_extra_total) || 0,
      products_total: Number(r.products_total) || 0,
      clients_count: Number(r.clients_count) || 0,
      commission_earned: Number(r.commission_earned) || 0,
    }));

    // Ranking de Serviços
    const services = statsArray
      .map((s) => ({ ...s, value: s.services_total }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setServicesRanking(services);

    // Ranking de Serviços Extras
    const servicesExtra = statsArray
      .map((s) => ({ ...s, value: s.services_extra_total }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setServicesExtraRanking(servicesExtra);

    // Ranking de Produtos
    const products = statsArray
      .map((s) => ({ ...s, value: s.products_total }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setProductsRanking(products);

    // Ranking de Ticket Médio
    const ticket = statsArray
      .map((s) => ({
        ...s,
        value: s.clients_count > 0 ? (s.services_total + s.products_total) / s.clients_count : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setTicketRanking(ticket);

    // Ranking de Comissão
    const commission = statsArray
      .map((s) => ({ ...s, value: s.commission_earned }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setCommissionRanking(commission);
  };

  const getMedal = (index: number) => {
    const medals = ["🥇", "🥈", "🥉"];
    return medals[index] || "";
  };

  const RankingCard = ({
    title,
    rankingKey,
    icon,
    data,
    description,
    valuePrefix = "R$",
  }: {
    title: string;
    rankingKey: string;
    icon: React.ReactNode;
    data: RankingItem[];
    description?: string;
    valuePrefix?: string;
  }) => {
    const displayTitle = customNames[rankingKey] || title;
    
    return (
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {icon}
              {displayTitle}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEditRanking(rankingKey, title)}
              className="h-8 w-8"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </CardTitle>
          {description && (
            <CardDescription className="text-muted-foreground">
              {description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.map((item, index) => (
              <div
                key={item.barber_id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getMedal(index)}</span>
                  <div>
                    <p className="font-bold">{item.barber_name}</p>
                    <p className="text-sm text-muted-foreground">({item.unit_name})</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-primary">
                  {valuePrefix} {item.value.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Filtrar por unidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Unidades</SelectItem>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current_week">Semana Atual</SelectItem>
            <SelectItem value="current_month">Mês Atual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingCard
          title="O BICHÃO DOS SERVIÇOS"
          rankingKey="services"
          icon={<TrendingUp className="w-5 h-5 text-success" />}
          data={servicesRanking}
          description="Ranking baseado no total de serviços básicos vendidos no período"
        />
        <RankingCard
          title="REI DOS SERVIÇOS EXTRAS"
          rankingKey="services_extra"
          icon={<TrendingUp className="w-5 h-5 text-warning" />}
          data={servicesExtraRanking}
          description="Ranking baseado no total de serviços extras (adicionais) vendidos no período"
        />
        <RankingCard
          title="REI DOS PRODUTOS"
          rankingKey="products"
          icon={<DollarSign className="w-5 h-5 text-primary" />}
          data={productsRanking}
          description="Ranking baseado no total de produtos vendidos no período"
        />
        <RankingCard
          title="MESTRE DO TICKET MÉDIO"
          rankingKey="ticket"
          icon={<Users className="w-5 h-5 text-accent" />}
          data={ticketRanking}
          description="Ranking baseado no valor médio gasto por cliente (serviços + produtos ÷ quantidade de clientes)"
        />
        <RankingCard
          title="MÃO DE OURO"
          rankingKey="commission"
          icon={<Trophy className="w-5 h-5 text-primary" />}
          data={commissionRanking}
          description="Ranking baseado no total de comissão ganha no período"
        />
      </div>

      <Dialog open={!!editingRanking} onOpenChange={(open) => !open && setEditingRanking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Nome do Ranking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ranking-name">Nome da Campanha</Label>
              <Input
                id="ranking-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ex: Batalha de Novembro, Missão Ticket Médio..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleResetToDefault}>
              Resetar para Padrão
            </Button>
            <Button onClick={handleSaveCustomName}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
