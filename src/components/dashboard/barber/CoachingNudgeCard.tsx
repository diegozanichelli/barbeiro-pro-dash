import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, TrendingUp, Package, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface CoachingNudge {
  mensagem: string;
  foco_acao: string;
  tipo: "produtos" | "servicos_extras" | "sucesso" | "sem_dados";
  percentual_barbeiro?: number;
  percentual_media?: number;
  diferenca?: number;
}

interface CoachingNudgeCardProps {
  barberId: string;
}

export default function CoachingNudgeCard({ barberId }: CoachingNudgeCardProps) {
  const [nudge, setNudge] = useState<CoachingNudge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNudge = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setError("Sessão não encontrada");
        setLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("get-coaching-nudge", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (fnError) {
        console.error("Error fetching coaching nudge:", fnError);
        setError("Erro ao carregar dica");
        setLoading(false);
        return;
      }

      setNudge(data);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (barberId) {
      fetchNudge();
    }
  }, [barberId]);

  // Determine card styling based on nudge type
  const getCardStyle = () => {
    if (!nudge) return "bg-card border-border";
    
    switch (nudge.tipo) {
      case "produtos":
        return "bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30";
      case "servicos_extras":
        return "bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30";
      case "sucesso":
        return "bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/30";
      default:
        return "bg-card border-border";
    }
  };

  const getIcon = () => {
    if (!nudge) return <Lightbulb className="w-5 h-5 text-primary" />;
    
    switch (nudge.tipo) {
      case "produtos":
        return <Package className="w-5 h-5 text-amber-500" />;
      case "servicos_extras":
        return <Sparkles className="w-5 h-5 text-blue-500" />;
      case "sucesso":
        return <TrendingUp className="w-5 h-5 text-emerald-500" />;
      default:
        return <Lightbulb className="w-5 h-5 text-primary" />;
    }
  };

  const getTitleColor = () => {
    if (!nudge) return "text-primary";
    
    switch (nudge.tipo) {
      case "produtos":
        return "text-amber-500";
      case "servicos_extras":
        return "text-blue-500";
      case "sucesso":
        return "text-emerald-500";
      default:
        return "text-primary";
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-border animate-pulse">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            DICA DE VENDAS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            DICA DE VENDAS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={fetchNudge}
            className="mt-2"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!nudge) {
    return null;
  }

  return (
    <Card className={`${getCardStyle()} transition-all duration-300`}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-lg flex items-center gap-2 ${getTitleColor()}`}>
          {getIcon()}
          DICA DE VENDAS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-foreground font-semibold text-base">
          {nudge.mensagem}
        </p>
        
        <div className="bg-background/50 rounded-lg p-3 border border-border/50">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">👉 </span>
            {nudge.foco_acao}
          </p>
        </div>

        {nudge.tipo !== "sem_dados" && nudge.tipo !== "sucesso" && nudge.diferenca && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span>Você: <strong className="text-foreground">{nudge.percentual_barbeiro}%</strong></span>
            <span>Média da unidade: <strong className="text-foreground">{nudge.percentual_media}%</strong></span>
          </div>
        )}

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={fetchNudge}
          className="w-full mt-2 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-3 h-3 mr-2" />
          Atualizar dica
        </Button>
      </CardContent>
    </Card>
  );
}
