import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function OnboardingSuccess() {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto redirect after 5 seconds
    const timer = setTimeout(() => {
      navigate("/dashboard");
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-success/5 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <CardTitle className="text-2xl">Bem-vindo ao SGP-B!</CardTitle>
          <CardDescription>
            Sua conta foi criada com sucesso. Você ganhou 7 dias grátis para explorar todas as funcionalidades.
          </CardDescription>
        </CardHeader>
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
            Redirecionando automaticamente em 5 segundos...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}