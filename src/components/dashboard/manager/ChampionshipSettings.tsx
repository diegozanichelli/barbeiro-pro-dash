import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trophy, Save } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";

export default function ChampionshipSettings() {
  const { organizationId } = useOrganization();
  const [championshipName, setChampionshipName] = useState("Campeonato Anual");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (organizationId) {
      fetchChampionshipName();
    }
  }, [organizationId]);

  const fetchChampionshipName = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("championship_name")
        .eq("id", organizationId)
        .single();

      if (error) throw error;
      if (data?.championship_name) {
        setChampionshipName(data.championship_name);
      }
    } catch (error) {
      console.error("Error fetching championship name:", error);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSave = async () => {
    if (!organizationId) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from("organizations")
        .update({ championship_name: championshipName })
        .eq("id", organizationId);

      if (error) throw error;
      toast.success("Nome do campeonato atualizado!");
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return null;
  }

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-warning" />
          Configuração do Campeonato
        </CardTitle>
        <CardDescription>
          Personalize o nome do campeonato de gamificação exibido nos rankings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="championship-name">Nome do Campeonato</Label>
            <Input
              id="championship-name"
              value={championshipName}
              onChange={(e) => setChampionshipName(e.target.value)}
              placeholder="Ex: Copa Performance, Desafio Anual..."
            />
            <p className="text-xs text-muted-foreground">
              Este nome será exibido no toggle de visualização do ranking
            </p>
          </div>
          <div className="flex items-end">
            <Button onClick={handleSave} disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>

        <div className="mt-6 p-4 bg-secondary/50 rounded-lg">
          <h4 className="font-semibold mb-3">📊 Regras de Pontuação</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-primary">Faturamento:</span>
              <span className="text-muted-foreground">10 pts a cada R$ 1.000</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-primary">Produtos:</span>
              <span className="text-muted-foreground">5 pts por item vendido</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-primary">Serviços Extras:</span>
              <span className="text-muted-foreground">3 pts por serviço</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-primary">Assinaturas:</span>
              <span className="text-muted-foreground">10 pts por venda</span>
            </div>
            <div className="col-span-1 md:col-span-2">
              <span className="font-medium text-primary">Ticket Médio:</span>
              <span className="text-muted-foreground ml-2">
                {"< R$100: 0 pts | R$100-109: 5 pts | R$110-129: 15 pts | ≥R$130: 25 pts"}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-sm">
              <span className="font-semibold text-warning">🔒 Trava de Segurança:</span>
              <span className="text-muted-foreground ml-2">
                Pontuação só é validada com faturamento mínimo de R$ 15.000,00 no mês
              </span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
