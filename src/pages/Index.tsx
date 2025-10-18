import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Scissors, TrendingUp, Target, Trophy } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-gold flex items-center justify-center shadow-gold">
            <Scissors className="w-10 h-10 text-primary-foreground" />
          </div>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          Barber Performance
        </h1>
        
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Sistema completo de gestão de performance para barbearias. Acompanhe metas, comissões e rankings em tempo real.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="p-6 rounded-lg bg-card border border-border">
            <Target className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-bold mb-2">Metas Inteligentes</h3>
            <p className="text-sm text-muted-foreground">Cálculo automático de metas diárias</p>
          </div>
          <div className="p-6 rounded-lg bg-card border border-border">
            <TrendingUp className="w-8 h-8 text-success mx-auto mb-3" />
            <h3 className="font-bold mb-2">Dashboard Completo</h3>
            <p className="text-sm text-muted-foreground">Métricas e análises em tempo real</p>
          </div>
          <div className="p-6 rounded-lg bg-card border border-border">
            <Trophy className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-bold mb-2">Gamificação</h3>
            <p className="text-sm text-muted-foreground">Rankings e competições saudáveis</p>
          </div>
        </div>

        <Button size="lg" onClick={() => navigate("/auth")} className="mt-8">
          Começar Agora
        </Button>
      </div>
    </div>
  );
};

export default Index;
