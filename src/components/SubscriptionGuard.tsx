import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { checkSubscriptionAccess } from "@/lib/subscriptionAccess";

// Rotas que NÃO exigem assinatura ativa (auth/recuperação e a própria tela de bloqueio)
const PUBLIC_PATHS = new Set<string>([
  "/auth",
  "/recuperar-senha",
  "/atualizar-senha",
  "/subscription-blocked",
]);

const ALLOWED_STATUSES = new Set(["active", "trial", "gratuita"]);

/**
 * Guarda global de assinatura. Em qualquer rota autenticada, se o status da
 * organização não for ativo/trial/gratuita, força o redirect para
 * /subscription-blocked. Faz polling a cada 60s para liberar automaticamente
 * quando o admin reativar.
 */
export function SubscriptionGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [blocked, setBlocked] = useState(false);
  const checkingRef = useRef(false);

  const check = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const result = await checkSubscriptionAccess();
      if (!result.authenticated) {
        setBlocked(false);
        return;
      }
      if (result.error || !result.data || result.data.error) return;
      const data = result.data;

      const isBlocked =
        !data?.has_access &&
        data?.role &&
        data?.subscription_status &&
        !ALLOWED_STATUSES.has(data.subscription_status);

      setBlocked(!!isBlocked);
    } finally {
      checkingRef.current = false;
    }
  };

  // Re-check a cada navegação
  useEffect(() => {
    check();
  }, [location.pathname]);

  // Re-check em mudanças de auth
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setBlocked(false);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        check();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Polling de 60s enquanto bloqueado, para liberar automaticamente
  useEffect(() => {
    if (!blocked) return;
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [blocked]);

  // Força redirect se bloqueado e tentando acessar rota privada
  useEffect(() => {
    if (!blocked) return;
    if (PUBLIC_PATHS.has(location.pathname)) return;
    navigate("/subscription-blocked", { replace: true });
  }, [blocked, location.pathname, navigate]);

  return null;
}
