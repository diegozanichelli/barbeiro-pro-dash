import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BarChart3, Target, Trophy, Building2 } from "lucide-react";
import logo from "@/assets/performance-barber-logo-transparent.png";
export default function Index() {
  const navigate = useNavigate();
  return <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="flex items-center justify-center mb-8">
          <img src={logo} alt="Performance Barber" className="w-full max-w-md h-auto" />
        </div>
        
        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
          Sistema de Gestão de Performance para Barbearias
        </p>

        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Transforme sua barbearia com gestão profissional de metas, comissões e performance.
          7 dias grátis para testar!
        </p>

        <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto mt-12">
          <div className="p-6 rounded-lg border border-border bg-card/50 backdrop-blur-sm">
            <Target className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Metas Inteligentes</h3>
            <p className="text-sm text-muted-foreground">
              Defina e acompanhe metas personalizadas para cada barbeiro
            </p>
          </div>
          
          <div className="p-6 rounded-lg border border-border bg-card/50 backdrop-blur-sm">
            <BarChart3 className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Dashboard Completo</h3>
            <p className="text-sm text-muted-foreground">
              Visualize performance, comissões e receitas em tempo real
            </p>
          </div>
          
          <div className="p-6 rounded-lg border border-border bg-card/50 backdrop-blur-sm">
            <Trophy className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Gamificação</h3>
            <p className="text-sm text-muted-foreground">
              Rankings e bônus aceleradores para motivar sua equipe
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-12">
          <Button size="lg" onClick={() => navigate("/onboarding")} className="text-lg px-8 py-6">
            <Building2 className="mr-2 h-5 w-5" />
            Começar Teste Grátis de 7 Dias
          </Button>
          
          <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="text-lg px-8 py-6">
            Já tenho uma conta
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mt-8">A partir de R$ 197,00/mês após o período de teste • Cancele quando quiser</p>
      </div>
    </div>;
}