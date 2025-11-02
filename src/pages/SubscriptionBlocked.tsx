import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function SubscriptionBlocked() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Assinatura Pendente</CardTitle>
          <CardDescription>
            Sua assinatura está com pagamento pendente ou cancelada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Para continuar usando o SGP-B, regularize seu pagamento.
          </p>
          
          <Button 
            onClick={() => window.location.href = "mailto:suporte@sgpb.com.br"}
            className="w-full"
          >
            Entrar em Contato
          </Button>

          <p className="text-xs text-muted-foreground">
            Dúvidas? Entre em contato com nosso suporte: suporte@sgpb.com.br
          </p>
        </CardContent>
      </Card>
    </div>
  );
}