import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, TrendingUp, DollarSign, Users, Pencil, Eye, EyeOff } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, subDays, subHours } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { Switch } from "@/components/ui/switch";
import ChampionshipLeaderboard from "./ChampionshipLeaderboard";
import { useChampionshipPoints, ChampionshipBarber } from "@/hooks/useChampionshipPoints";
import { getManausDate } from "@/lib/dateUtils";

interface RankingItem {
  barber_id: string;
  barber_name: string;
  unit_name: string;
  value: number;
}

interface RankingConfig {
  key: string;
  title: string;
  is_active: boolean;
}

interface RawBarberData {
  barber_id: string;
  barber_name: string;
  unit_name: string;
  services_total: number;
  services_extra_total: number;
  products_total: number;
  clients_count: number;
  products_count: number;
  extras_count: number;
  subscriptions_count: number;
}

interface LeaderboardProps {
  viewerRole?: "barber" | "manager";
}

export default function Leaderboard({ viewerRole = "manager" }: LeaderboardProps) {
  const { toast } = useToast();
  const { organization, organizationId } = useOrganization();
  const [period, setPeriod] = useState("current_month");
  const [unitFilter, setUnitFilter] = useState("all");
  const [units, setUnits] = useState<any[]>([]);
  
  // View mode: "financial" or "championship"
  const [viewMode, setViewMode] = useState<"financial" | "championship">("financial");
  const [championshipName, setChampionshipName] = useState("Campeonato Anual");
  
  const [performanceRanking, setPerformanceRanking] = useState<RankingItem[]>([]);
  const [servicesExtraRanking, setServicesExtraRanking] = useState<RankingItem[]>([]);
  const [productsRanking, setProductsRanking] = useState<RankingItem[]>([]);
  const [ticketRanking, setTicketRanking] = useState<RankingItem[]>([]);
  const [commissionRanking, setCommissionRanking] = useState<RankingItem[]>([]);

  // Championship data
  const [rawBarberData, setRawBarberData] = useState<RawBarberData[]>([]);
  const championshipData = useChampionshipPoints(rawBarberData);

  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [rankingConfigs, setRankingConfigs] = useState<Record<string, RankingConfig>>({});
  const [editingRanking, setEditingRanking] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showCampaignControl, setShowCampaignControl] = useState(false);

  useEffect(() => {
    fetchUnits();
  }, []);

  useEffect(() => {
    if (organization?.id) {
      fetchCustomNames();
      fetchChampionshipName();
    }
  }, [organization?.id]);

  useEffect(() => {
    fetchRankings();
  }, [period, unitFilter]);

  // Refetch automático quando a aba volta ao foco (ex: após fechar modal de venda)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchRankings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [period, unitFilter]);

  const fetchUnits = async () => {
    const { data } = await supabase.from("units").select("*").eq("status", "active");
    if (data) setUnits(data);
  };

  const fetchChampionshipName = async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from("organizations")
      .select("championship_name")
      .eq("id", organizationId)
      .single();
    if (data?.championship_name) {
      setChampionshipName(data.championship_name);
    }
  };

  const fetchCustomNames = async () => {
    if (!organization?.id) return;

    const { data } = await supabase
      .from("ranking_custom_names")
      .select("ranking_key, custom_name, is_active")
      .eq("organization_id", organization.id);

    if (data) {
      const names: Record<string, string> = {};
      const configs: Record<string, RankingConfig> = {};
      
      data.forEach((item) => {
        names[item.ranking_key] = item.custom_name;
        configs[item.ranking_key] = {
          key: item.ranking_key,
          title: item.custom_name,
          is_active: item.is_active,
        };
      });
      
      setCustomNames(names);
      setRankingConfigs(configs);
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
      .upsert(
        {
          organization_id: organization.id,
          ranking_key: editingRanking,
          custom_name: editName,
        },
        { onConflict: 'organization_id,ranking_key' }
      );

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

    setRankingConfigs((prev) => {
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

  const handleToggleCampaign = async (rankingKey: string, currentState: boolean) => {
    if (!organization?.id) return;

    const newState = !currentState;

    const { error } = await supabase
      .from("ranking_custom_names")
      .upsert(
        {
          organization_id: organization.id,
          ranking_key: rankingKey,
          custom_name: customNames[rankingKey] || getDefaultTitle(rankingKey),
          is_active: newState,
        },
        { onConflict: 'organization_id,ranking_key' }
      );

    if (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o status da campanha.",
        variant: "destructive",
      });
      return;
    }

    setRankingConfigs((prev) => ({
      ...prev,
      [rankingKey]: {
        ...prev[rankingKey],
        key: rankingKey,
        title: customNames[rankingKey] || getDefaultTitle(rankingKey),
        is_active: newState,
      },
    }));

    toast({
      title: newState ? "Campanha ativada!" : "Campanha desativada!",
      description: `A campanha agora está ${newState ? "visível" : "oculta"} para os barbeiros.`,
    });
  };

  const getDefaultTitle = (key: string) => {
    const titles: Record<string, string> = {
      performance: "MESTRE DA PERFORMANCE",
      services_extra: "REI DOS SERVIÇOS EXTRAS",
      products: "REI DOS PRODUTOS",
      ticket: "MESTRE DO TICKET MÉDIO",
      commission: "MÃO DE OURO",
    };
    return titles[key] || key;
  };

  const isRankingActive = (rankingKey: string) => {
    // Se for gerente, mostrar todos
    if (viewerRole === "manager") return true;
    
    // Se for barbeiro e não há configuração, mostrar (padrão ativo)
    if (!rankingConfigs[rankingKey]) return true;
    
    // Se for barbeiro e há configuração, verificar is_active
    return rankingConfigs[rankingKey].is_active;
  };

  const getDateRange = () => {
    const now = getManausDate();
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
      case "last_month":
        const lastMonth = subMonths(now, 1);
        return {
          start: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
          end: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
        };
      case "last_7_days":
        return {
          start: format(subDays(now, 6), "yyyy-MM-dd"),
          end: format(now, "yyyy-MM-dd"),
        };
      case "last_24_hours":
        const yesterday = subHours(now, 24);
        return {
          start: format(yesterday, "yyyy-MM-dd HH:mm:ss"),
          end: format(now, "yyyy-MM-dd HH:mm:ss"),
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

    // All data now comes from the RPC (SECURITY DEFINER) - no direct sale_transactions query needed
    const statsArray = rankings.map((r: any) => ({
      barber_id: r.barber_id,
      barber_name: r.barber_name,
      unit_name: r.unit_name,
      services_total: Number(r.services_total) || 0,
      services_extra_total: Number(r.services_extra_total) || 0,
      products_total: Number(r.products_total) || 0,
      clients_count: Number(r.clients_count) || 0,
      commission_earned: Number(r.commission_earned) || 0,
      products_count: Number(r.products_count) || 0,
      extras_count: Number(r.extras_count) || 0,
      subscriptions_count: Number(r.subscriptions_count) || 0,
    }));

    // Store raw data for championship mode
    setRawBarberData(statsArray);

    // Ranking de Performance (Serviços Extras + Produtos por Cliente)
    const performance = statsArray
      .map((s) => ({
        ...s,
        value: s.clients_count > 0 ? (s.services_extra_total + s.products_total) / s.clients_count : 0,
      }))
      .sort((a, b) => b.value - a.value);
    setPerformanceRanking(performance);

    // Ranking de Serviços Extras
    const servicesExtra = statsArray
      .map((s) => ({ ...s, value: s.services_extra_total }))
      .sort((a, b) => b.value - a.value);
    setServicesExtraRanking(servicesExtra);

    // Ranking de Produtos
    const products = statsArray
      .map((s) => ({ ...s, value: s.products_total }))
      .sort((a, b) => b.value - a.value);
    setProductsRanking(products);

    // Ranking de Ticket Médio
    const ticket = statsArray
      .map((s) => ({
        ...s,
        value: s.clients_count > 0 ? (s.services_total + s.products_total) / s.clients_count : 0,
      }))
      .sort((a, b) => b.value - a.value);
    setTicketRanking(ticket);

    // Ranking de Comissão
    const commission = statsArray
      .map((s) => ({ ...s, value: s.commission_earned }))
      .sort((a, b) => b.value - a.value);
    setCommissionRanking(commission);
  };

  const getPosition = (index: number) => {
    const medals = ["🥇", "🥈", "🥉"];
    if (index < 3) return medals[index];
    return `${index + 1}º`;
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
            {viewerRole === "manager" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEditRanking(rankingKey, title)}
                className="h-8 w-8"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </CardTitle>
          {description && (
            <CardDescription className="text-muted-foreground">
              {description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {data.map((item, index) => (
              <div
                key={item.barber_id}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                  index < 3 
                    ? "bg-primary/10 border border-primary/20" 
                    : "bg-secondary/50 hover:bg-secondary"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`${index < 3 ? "text-2xl" : "text-lg font-bold text-muted-foreground w-8 text-center"}`}>
                    {getPosition(index)}
                  </span>
                  <div>
                    <p className="font-bold">{item.barber_name}</p>
                    <p className="text-sm text-muted-foreground">({item.unit_name})</p>
                  </div>
                </div>
                <p className={`font-bold ${index < 3 ? "text-xl text-primary" : "text-lg text-foreground"}`}>
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
      {viewerRole === "manager" && (
        <Card className="bg-card border-border shadow-card-custom">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Controle de Campanhas Ativas</CardTitle>
                <CardDescription>
                  Gerencie quais campanhas os barbeiros podem visualizar
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCampaignControl(!showCampaignControl)}
              >
                {showCampaignControl ? (
                  <>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Ocultar
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Mostrar
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {showCampaignControl && (
            <CardContent>
              <div className="space-y-4">
                {[
                  { key: "performance", title: "MESTRE DA PERFORMANCE", description: "Ranking de serviços extras e produtos por cliente" },
                  { key: "services_extra", title: "REI DOS SERVIÇOS EXTRAS", description: "Ranking de serviços extras vendidos" },
                  { key: "products", title: "REI DOS PRODUTOS", description: "Ranking de produtos vendidos" },
                  { key: "ticket", title: "MESTRE DO TICKET MÉDIO", description: "Ranking de ticket médio por cliente" },
                  { key: "commission", title: "MÃO DE OURO", description: "Ranking de comissão ganha" },
                ].map((campaign) => {
                  const config = rankingConfigs[campaign.key];
                  const isActive = config?.is_active ?? true;
                  const displayTitle = customNames[campaign.key] || campaign.title;

                  return (
                    <div
                      key={campaign.key}
                      className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">{displayTitle}</p>
                        <p className="text-sm text-muted-foreground">{campaign.description}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-medium ${isActive ? "text-success" : "text-muted-foreground"}`}>
                          {isActive ? "Ativa" : "Inativa"}
                        </span>
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => handleToggleCampaign(campaign.key, isActive)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* View Mode Toggle */}
      <Card className="bg-card border-border shadow-card-custom">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Visualizar por:</span>
              <div className="flex items-center gap-2 p-1 bg-secondary rounded-lg">
                <Button
                  variant={viewMode === "financial" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("financial")}
                  className="h-8"
                >
                  <DollarSign className="w-4 h-4 mr-1" />
                  Financeiro
                </Button>
                <Button
                  variant={viewMode === "championship" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("championship")}
                  className="h-8"
                >
                  <Trophy className="w-4 h-4 mr-1" />
                  🏆 {championshipName}
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Select value={unitFilter} onValueChange={setUnitFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
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
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Este Mês</SelectItem>
                  <SelectItem value="last_month">Mês Passado</SelectItem>
                  <SelectItem value="last_7_days">Últimos 7 Dias</SelectItem>
                  <SelectItem value="last_24_hours">Últimas 24 Horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Championship View */}
      {viewMode === "championship" && (
        <ChampionshipLeaderboard data={championshipData} championshipName={championshipName} />
      )}

      {/* Financial View */}
      {viewMode === "financial" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isRankingActive("performance") && (
            <RankingCard
              title="MESTRE DA PERFORMANCE"
              rankingKey="performance"
              icon={<TrendingUp className="w-5 h-5 text-success" />}
              data={performanceRanking}
              description="Ranking baseado na média de serviços extras e produtos vendidos por cliente atendido"
            />
          )}
          {isRankingActive("services_extra") && (
            <RankingCard
              title="REI DOS SERVIÇOS EXTRAS"
              rankingKey="services_extra"
              icon={<TrendingUp className="w-5 h-5 text-warning" />}
              data={servicesExtraRanking}
              description="Ranking baseado no total de serviços extras (adicionais) vendidos no período"
            />
          )}
          {isRankingActive("products") && (
            <RankingCard
              title="REI DOS PRODUTOS"
              rankingKey="products"
              icon={<DollarSign className="w-5 h-5 text-primary" />}
              data={productsRanking}
              description="Ranking baseado no total de produtos vendidos no período"
            />
          )}
          {isRankingActive("ticket") && (
            <RankingCard
              title="MESTRE DO TICKET MÉDIO"
              rankingKey="ticket"
              icon={<Users className="w-5 h-5 text-accent" />}
              data={ticketRanking}
              description="Ranking baseado no valor médio gasto por cliente (serviços + produtos ÷ quantidade de clientes)"
            />
          )}
          {isRankingActive("commission") && (
            <RankingCard
              title="MÃO DE OURO"
              rankingKey="commission"
              icon={<Trophy className="w-5 h-5 text-primary" />}
              data={commissionRanking}
              description="Ranking baseado no total de comissão ganha no período"
            />
          )}
        </div>
      )}

      {viewerRole === "manager" && (
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
      )}
    </div>
  );
}
