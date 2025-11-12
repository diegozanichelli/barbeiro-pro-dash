import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function SubscriptionBlocked() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [hasStripeCustomer, setHasStripeCustomer] = useState<boolean | null>(null);

  useEffect(() => {
    const getUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
      
      if (user) {
        // Check if user has stripe customer ID
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("organization_id, organizations(stripe_customer_id)")
          .eq("user_id", user.id)
          .single();
        
        if (roleData) {
          const org = roleData.organizations as any;
          setHasStripeCustomer(!!org?.stripe_customer_id);
        }
      }
    };
    getUserData();
  }, []);

  const handleBootstrap = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("bootstrap-super-admin", {
        body: { email: userEmail },
      });

      if (error) throw error;

      toast.success("Acesso de Super Admin ativado!");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Erro ao ativar acesso");
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateOrganization = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("migrate-organization", {
        body: { 
          oldManagerEmail: "cassiano.diego@gmail.com",
          newManagerEmail: "diego_zanichelli@outlook.com",
          newManagerPassword: "barbeiro123"
        }
      });

      if (error) throw error;

      toast.success("Organização transferida com sucesso!");
      console.log("Resultado da migração:", data);
    } catch (error: any) {
      toast.error(error.message || "Erro ao transferir organização");
    } finally {
      setLoading(false);
    }
  };

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
          
          {userEmail === "cassiano.diego@gmail.com" && (
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleBootstrap}
                disabled={loading}
                className="w-full bg-gradient-gold"
                variant="default"
              >
                <Shield className="w-4 h-4 mr-2" />
                {loading ? "Ativando..." : "Ativar Super Admin"}
              </Button>
              <Button
                onClick={handleMigrateOrganization}
                disabled={loading}
                className="w-full"
                variant="secondary"
              >
                {loading ? "Migrando..." : "Transferir Organização"}
              </Button>
            </div>
          )}

          {hasStripeCustomer !== null && (
            <Button 
              onClick={() => {
                if (hasStripeCustomer) {
                  // Redirect to customer portal (you'll need to implement this)
                  window.location.href = "https://billing.stripe.com/p/login/test_XXXXXX";
                } else {
                  // Redirect to checkout
                  window.open("https://buy.stripe.com/test_XXXXXX", "_blank");
                }
              }}
              className="w-full"
              variant="default"
            >
              {hasStripeCustomer ? "Regularizar Pagamento" : "Iniciar Assinatura Agora"}
            </Button>
          )}

          <Button 
            onClick={() => window.location.href = "mailto:suporte@sgpb.com.br"}
            className="w-full"
            variant="outline"
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