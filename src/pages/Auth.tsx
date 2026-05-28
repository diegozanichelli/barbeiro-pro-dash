import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signInSchema, signUpSchema, type SignInFormData, type SignUpFormData } from "@/lib/validations/auth";
import { Loader2, TrendingUp, Users, BarChart3, Zap, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { markPostLoginProcessing } from "@/components/AppErrorBoundary";

const preloadDashboard = () => import("./Dashboard");

const waitForDashboardPreload = () =>
  Promise.race([
    preloadDashboard(),
    new Promise((resolve) => window.setTimeout(resolve, 2500)),
  ]);

const preloadDashboard = () => import("./Dashboard");

const waitForDashboardPreload = () =>
  Promise.race([
    preloadDashboard(),
    new Promise((resolve) => window.setTimeout(resolve, 2500)),
  ]);

export default function Auth() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  const signInForm = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", fullName: "" },
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void preloadDashboard().catch((error) => {
        console.error("Erro ao pré-carregar dashboard:", error);
      });
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, []);

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
      await waitForDashboardPreload().catch((error) => {
        console.error("Erro ao carregar dashboard após login:", error);
      });
      markPostLoginProcessing();
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer login");
    }
  };

  const inputClass =
    "h-11 bg-zinc-900/80 border-zinc-800 text-foreground placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary/50";

  return (
    <div className="min-h-screen w-full bg-zinc-950 flex">
      {/* Form side */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-10">
          {/* Flat wordmark */}
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">P</span>
            </div>
            <span className="text-foreground font-semibold tracking-tight">
              Performance<span className="text-primary">.</span>
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-foreground tracking-tight">
              {tab === "signin" ? "Entre na sua conta" : "Crie sua conta"}
            </h1>
            <p className="text-sm text-zinc-400">
              {tab === "signin"
                ? "Acompanhe a performance da sua barbearia em tempo real."
                : "Comece a gerir sua barbearia com dados e clareza."}
            </p>
          </div>

          {/* Text-link tabs */}
          <div className="flex items-center gap-6 text-sm border-b border-zinc-800">
            {(["signin", "signup"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "pb-3 -mb-px border-b-2 transition-colors font-medium",
                  tab === t
                    ? "border-primary text-foreground"
                    : "border-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                {t === "signin" ? "Entrar" : "Cadastrar"}
              </button>
            ))}
          </div>

          {tab === "signin" ? (
            <Form {...signInForm}>
              <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-5">
                <FormField
                  control={signInForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-300 text-xs uppercase tracking-wider font-medium">Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="seu@email.com" className={inputClass} {...field} />
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
                        <FormLabel className="text-zinc-300 text-xs uppercase tracking-wider font-medium">Senha</FormLabel>
                        <button
                          type="button"
                          className="text-xs text-zinc-400 hover:text-primary transition-colors"
                          onClick={() => navigate("/recuperar-senha")}
                        >
                          Esqueci minha senha
                        </button>
                      </div>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" className={inputClass} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full h-11 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-none"
                  disabled={signInForm.formState.isSubmitting}
                >
                  {signInForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    <>
                      Entrar
                      <ArrowUpRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...signUpForm}>
              <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-5">
                <FormField
                  control={signUpForm.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-300 text-xs uppercase tracking-wider font-medium">Nome completo</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="João Silva" className={inputClass} {...field} />
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
                      <FormLabel className="text-zinc-300 text-xs uppercase tracking-wider font-medium">Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="seu@email.com" className={inputClass} {...field} />
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
                      <FormLabel className="text-zinc-300 text-xs uppercase tracking-wider font-medium">Senha</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" className={inputClass} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Apenas gestores podem se cadastrar. Os barbeiros são criados pelo gestor dentro do painel.
                </p>
                <Button
                  type="submit"
                  className="w-full h-11 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-none"
                  disabled={signUpForm.formState.isSubmitting}
                >
                  {signUpForm.formState.isSubmitting ? "Criando conta..." : "Criar conta"}
                </Button>
              </form>
            </Form>
          )}

          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()} Performance Barber.
          </p>
        </div>
      </div>

      {/* Right side - minimalist */}
      <div className="hidden lg:flex relative flex-1 overflow-hidden bg-zinc-950 border-l border-zinc-900">
        <div className="relative z-10 h-full w-full flex flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-600">
            <span className="inline-block w-6 h-px bg-primary" />
            Performance Barber
          </div>

          <div className="space-y-6 max-w-md">
            <h2 className="text-5xl font-semibold text-foreground leading-[1.05] tracking-tight">
              Performance que vira <span className="text-primary">resultado</span>.
            </h2>
            <p className="text-zinc-500 text-base leading-relaxed">
              Gestão completa da sua barbearia, em tempo real.
            </p>
          </div>

          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-700">
            v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
