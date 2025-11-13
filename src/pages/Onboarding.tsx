import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { onboardingSchema, type OnboardingFormData } from "@/lib/validations/onboarding";
import { Loader2, Building2 } from "lucide-react";

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      organizationName: "",
      fullName: location.state?.fullName || "",
      email: location.state?.email || "",
      password: location.state?.password || "",
    },
  });

  const handleSubmit = async (data: OnboardingFormData) => {
    try {
      // Step 1: Try to create user account, or login if already exists
      let userId: string;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding-success`,
          data: {
            full_name: data.fullName,
          },
        },
      });

      // If user already exists, login instead
      if (signUpError?.message === "User already registered") {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (signInError) throw signInError;
        if (!signInData.user) throw new Error("Falha ao fazer login");
        userId = signInData.user.id;
      } else if (signUpError) {
        throw signUpError;
      } else if (!signUpData.user) {
        throw new Error("Falha ao criar usuário");
      } else {
        userId = signUpData.user.id;
      }

      // Ensure we have an active session token
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { error: signInError2 } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (signInError2) {
          throw new Error("Não foi possível autenticar para criar o checkout. Verifique sua confirmação de e-mail.");
        }
      }

      // Step 2: Create Stripe checkout session
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
        "create-organization-checkout",
        {
          body: {
            organizationName: data.organizationName,
          },
        }
      );

      if (checkoutError) {
        throw checkoutError;
      }

      // Redirect to Stripe checkout
      if (checkoutData?.url) {
        window.location.href = checkoutData.url;
      } else {
        throw new Error("URL de checkout não recebida");
      }
    } catch (error: any) {
      toast({
        title: "Erro no cadastro",
        description: error.message || "Ocorreu um erro ao criar sua conta.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg bg-card border-border shadow-card-custom">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <Building2 className="w-12 h-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Complete seu Cadastro
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Crie sua organização e comece o teste grátis de 7 dias
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="organizationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Organização</FormLabel>
                    <FormControl>
                      <Input placeholder="Barbearia XYZ" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl>
                      <Input placeholder="João Silva" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="seu@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-primary">🎉 Teste Grátis por 7 Dias</h4>
                <p className="text-sm text-muted-foreground">
                  Após o período de teste, a assinatura será de R$ 99,90/mês. Você pode cancelar a qualquer momento.
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                size="lg" 
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  "Iniciar Teste Grátis"
                )}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Já tem uma conta?{" "}
                <Link to="/auth" className="text-primary hover:underline">
                  Fazer login
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
