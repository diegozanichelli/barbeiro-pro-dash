import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2 } from "lucide-react";

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    organizationName: "",
    fullName: location.state?.fullName || "",
    email: location.state?.email || "",
    password: location.state?.password || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Step 1: Try to create user account, or login if already exists
      let userId: string;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding-success`,
          data: {
            full_name: formData.fullName,
          }
        }
      });

      // If user already exists, login instead
      if (signUpError?.message === "User already registered") {
        console.log("User already exists, logging in...");
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (signInError) throw signInError;
        if (!signInData.user) throw new Error("Falha ao fazer login");
        
        userId = signInData.user.id;
        console.log("User logged in successfully:", userId);
      } else if (signUpError) {
        throw signUpError;
      } else if (!signUpData.user) {
        throw new Error("Falha ao criar usuário");
      } else {
        userId = signUpData.user.id;
        console.log("User created successfully:", userId);
      }

      // Step 2: Create Stripe checkout session
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
        "create-organization-checkout",
        {
          body: {
            organizationName: formData.organizationName,
          }
        }
      );

      if (checkoutError) {
        console.error("Checkout error:", checkoutError);
        throw checkoutError;
      }

      console.log("Checkout session created:", checkoutData);

      // Redirect to Stripe checkout
      if (checkoutData?.url) {
        console.log("Redirecting to Stripe:", checkoutData.url);
        window.location.href = checkoutData.url;
      } else {
        console.error("No URL in response:", checkoutData);
        throw new Error("URL de checkout não recebida");
      }
    } catch (error: any) {
      console.error("Onboarding error:", error);
      toast({
        title: "Erro no cadastro",
        description: error.message || "Ocorreu um erro ao criar sua conta.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-gradient-gold flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Começar Teste Grátis de 7 Dias</CardTitle>
          <CardDescription>
            Cadastre sua barbearia e ganhe 7 dias grátis do SGP-B Pro por apenas R$ 99,00/mês
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organizationName">Nome da Barbearia</Label>
              <Input
                id="organizationName"
                type="text"
                placeholder="Barbearia Premium"
                value={formData.organizationName}
                onChange={(e) =>
                  setFormData({ ...formData, organizationName: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Seu Nome Completo</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="João Silva"
                value={formData.fullName}
                onChange={(e) =>
                  setFormData({ ...formData, fullName: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="joao@barbearia.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                "Iniciar Teste Grátis"
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Ao continuar, você será redirecionado para o Stripe para confirmar o pagamento.
              Sem cobranças nos primeiros 7 dias.
            </p>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/auth")}
            >
              Já tem uma conta? Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}