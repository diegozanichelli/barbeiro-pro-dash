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
import sideImage from "@/assets/auth-side-abstract.jpg";
import { Loader2 } from "lucide-react";

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

      {/* Image side - hidden on mobile */}
      <div className="hidden lg:block relative flex-1 overflow-hidden">
        <img
          src={sideImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-background/80 via-background/20 to-transparent" />
        <div className="relative z-10 h-full flex flex-col justify-end p-12">
          <div className="max-w-md space-y-3">
            <h2 className="text-4xl font-bold text-white leading-tight drop-shadow-lg">
              Performance que vira <span className="text-primary">resultado</span>.
            </h2>
            <p className="text-white/80 text-base drop-shadow">
              Gestão completa, dados em tempo real e inteligência para a sua barbearia crescer todos os dias.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
