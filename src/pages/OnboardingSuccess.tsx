import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function OnboardingSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isCompleting, setIsCompleting] = useState(true);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const completeOnboarding = async () => {
      try {
        const sessionId = searchParams.get("session_id");
        
        if (!sessionId) {
          console.error("No session_id found in URL");
          toast({
            title: "Erro",
            description: "Sessão não encontrada. Redirecionando...",
            variant: "destructive",
          });
          setTimeout(() => navigate("/dashboard"), 2000);
          return;
        }


        const { data, error } = await supabase.functions.invoke("complete-onboarding", {
          body: { sessionId }
        });

        if (error) {
          console.error("Error completing onboarding:", error);
          toast({
            title: "Erro ao finalizar cadastro",
            description: error.message || "Tente novamente mais tarde",
            variant: "destructive",
          });
          setIsCompleting(false);
          return;
        }

        setCompleted(true);
        setIsCompleting(false);

        // Auto redirect after completion
        setTimeout(() => {
          navigate("/dashboard");
        }, 3000);

      } catch (error) {
        console.error("Unexpected error:", error);
        toast({
          title: "Erro inesperado",
          description: "Entre em contato com o suporte",
          variant: "destructive",
        });
        setIsCompleting(false);
      }
    };

    completeOnboarding();
  }, [navigate, searchParams, toast]);

  if (isCompleting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <CardTitle className="text-2xl">Finalizando cadastro...</CardTitle>
            <CardDescription>
              Estamos configurando sua conta. Por favor, aguarde.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-success/5 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <CardTitle className="text-2xl">Bem-vindo ao SGP-B!</CardTitle>
          <CardDescription>
            {completed ? (
              "Sua conta foi criada com sucesso. Você ganhou 7 dias grátis para explorar todas as funcionalidades."
            ) : (
              "Houve um problema ao finalizar o cadastro. Entre em contato com o suporte."
            )}
          </CardDescription>
        </CardHeader>
        {completed && (
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>✓ Cadastro concluído</p>
              <p>✓ Período de teste iniciado (7 dias)</p>
              <p>✓ Primeira cobrança em 7 dias</p>
            </div>
            
            <Button onClick={() => navigate("/dashboard")} className="w-full">
              Acessar Painel
            </Button>

            <p className="text-xs text-muted-foreground">
              Redirecionando automaticamente em 3 segundos...
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}