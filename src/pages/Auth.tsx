import { useState } from "react";
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

      {/* Right side - dashboard mockup */}
      <div className="hidden lg:flex relative flex-1 overflow-hidden bg-zinc-900 border-l border-zinc-800">
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        {/* Glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 75% 30%, hsl(var(--primary) / 0.12), transparent 60%)",
          }}
        />

        <div className="relative z-10 h-full w-full flex flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            <span className="inline-block w-6 h-px bg-primary" />
            Painel do Gestor
          </div>

          {/* Glassmorphism mockup */}
          <div className="relative max-w-md w-full">
            {/* Floating background card */}
            <div className="absolute -top-6 -right-6 w-full h-full rounded-2xl bg-primary/5 border border-primary/10 backdrop-blur-sm" />

            <div className="relative rounded-2xl bg-zinc-900/70 border border-zinc-800 backdrop-blur-xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Faturamento do mês</p>
                  <p className="text-2xl font-bold text-foreground mt-1">R$ 84.320</p>
                </div>
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-md flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  +18,4%
                </span>
              </div>

              {/* Mini bars */}
              <div className="flex items-end gap-1.5 h-20">
                {[40, 65, 50, 78, 60, 88, 72, 95, 70, 82, 90, 100].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-gradient-to-t from-primary/30 to-primary"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>

              {/* Ranking row */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                {[
                  { n: "Lucas R.", v: "R$ 12.4k", p: "92%" },
                  { n: "Felipe M.", v: "R$ 10.8k", p: "84%" },
                  { n: "André S.", v: "R$ 9.1k", p: "71%" },
                ].map((b, i) => (
                  <div key={b.n} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center font-semibold">
                        {i + 1}
                      </span>
                      <span className="text-foreground font-medium">{b.n}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-400">{b.v}</span>
                      <span className="text-primary font-semibold w-10 text-right">{b.p}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6 max-w-md">
            <h2 className="text-4xl font-semibold text-foreground leading-[1.1] tracking-tight">
              Performance que vira <span className="text-primary">resultado</span>.
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Metas, comissões e produção da sua equipe — tudo em um só lugar, atualizado em tempo real.
            </p>

            {/* Minimal feature list */}
            <ul className="space-y-3 pt-2">
              {[
                { icon: TrendingUp, label: "Metas e pacing em tempo real" },
                { icon: BarChart3, label: "Relatórios financeiros completos" },
                { icon: Users, label: "Multi-unidade e ranking de barbeiros" },
                { icon: Zap, label: "IA de coaching diária" },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm text-zinc-300">
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
