import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import { SubscriptionGuard } from "./components/SubscriptionGuard";

// Lazy load com recuperação: se o módulo antigo sumiu após uma atualização
// ("Failed to fetch dynamically imported module"), recarrega a página uma vez.
const lazyWithReload = <T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem("chunk-reloaded");
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem("chunk-reloaded")) {
        sessionStorage.setItem("chunk-reloaded", "1");
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });

const Auth = lazyWithReload(() => import("./pages/Auth"));
const Dashboard = lazyWithReload(() => import("./pages/Dashboard"));
const Onboarding = lazyWithReload(() => import("./pages/Onboarding"));
const OnboardingSuccess = lazyWithReload(() => import("./pages/OnboardingSuccess"));
const SubscriptionBlocked = lazyWithReload(() => import("./pages/SubscriptionBlocked"));
const RecoverPassword = lazyWithReload(() => import("./pages/RecoverPassword"));
const ResetPassword = lazyWithReload(() => import("./pages/ResetPassword"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Loading fallback with explicit UX feedback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <div className="text-center space-y-3">
      <div className="mx-auto animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-sm text-muted-foreground">Carregando aplicação...</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SubscriptionGuard />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/recuperar-senha" element={<RecoverPassword />} />
            <Route path="/atualizar-senha" element={<ResetPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/onboarding-success" element={<OnboardingSuccess />} />
            <Route path="/subscription-blocked" element={<SubscriptionBlocked />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
