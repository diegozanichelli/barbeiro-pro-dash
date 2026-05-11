import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signInSchema, signUpSchema, type SignInFormData, type SignUpFormData } from "@/lib/validations/auth";
import logo from "@/assets/performance-barber-logo-transparent.png";
import { Loader2, TrendingUp, Users, BarChart3, Zap } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();

  const signInForm = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", fullName: "" },
  });

  const handleSignUp = (data: SignUpFormData) => {
    navigate("/onboarding", {
      state: { email: data.email, password: data.password, fullName: data.fullName },
    });
  };

  const handleSignIn = async (data: SignInFormData) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error) throw error;
      toast.success("Login realizado com sucesso!");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer login");
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex">
      {/* Form side */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-6">
            <img
              src={logo}
              alt="Performance Barber"
              className="w-48 h-auto"
            />
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                Bem-vindo de volta
              </h1>
              <p className="text-sm text-muted-foreground">
                Acesse o sistema de gestão de performance da sua barbearia.
              </p>
            </div>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted/40">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <Form {...signInForm}>
                <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-4">
                  <FormField
                    control={signInForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="seu@email.com" className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signInForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Senha</FormLabel>
                          <Button
                            variant="link"
                            type="button"
                            className="h-auto p-0 text-xs text-primary hover:text-primary/80"
                            onClick={() => navigate("/recuperar-senha")}
                          >
                            Esqueci minha senha
                          </Button>
                        </div>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full h-11 font-semibold"
                    disabled={signInForm.formState.isSubmitting}
                  >
                    {signInForm.formState.isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Entrando...
                      </>
                    ) : "Entrar"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="signup">
              <Form {...signUpForm}>
                <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
                  <FormField
                    control={signUpForm.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Completo</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="João Silva" className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUpForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="seu@email.com" className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUpForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-xs text-muted-foreground p-3 bg-muted/40 rounded-md border border-border">
                    <strong className="text-foreground">Nota:</strong> Apenas gestores podem se cadastrar. Os barbeiros serão criados pelo gestor no painel.
                  </p>
                  <Button
                    type="submit"
                    className="w-full h-11 font-semibold"
                    disabled={signUpForm.formState.isSubmitting}
                  >
                    {signUpForm.formState.isSubmitting ? "Criando conta..." : "Criar Conta"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>

          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Performance Barber. Todos os direitos reservados.
          </p>
        </div>
      </div>

      {/* Pattern side - hidden on mobile */}
      <div className="hidden lg:flex relative flex-1 overflow-hidden bg-card border-l border-border">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        {/* Radial glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 70% 40%, hsl(var(--primary) / 0.18), transparent 55%)",
          }}
        />
        {/* Diagonal accent line */}
        <div className="absolute -left-px top-1/4 h-32 w-px bg-gradient-to-b from-transparent via-primary to-transparent" />

        <div className="relative z-10 h-full w-full flex flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="inline-block w-8 h-px bg-primary" />
            Performance Barber
          </div>

          <div className="max-w-md space-y-6">
            <h2 className="text-5xl font-bold text-foreground leading-[1.1] tracking-tight">
              Performance que vira{" "}
              <span className="text-primary">resultado</span>.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Gestão completa, dados em tempo real e inteligência para a sua barbearia crescer todos os dias.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-md">
            {[
              { icon: TrendingUp, label: "Metas em tempo real" },
              { icon: BarChart3, label: "Relatórios completos" },
              { icon: Users, label: "Multi-unidade" },
              { icon: Zap, label: "IA de coaching" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-background/40 backdrop-blur-sm"
              >
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm text-foreground/90 font-medium">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
