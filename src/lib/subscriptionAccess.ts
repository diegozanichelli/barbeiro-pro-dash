import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionAccessStatus {
  has_access: boolean;
  role: string | null;
  subscription_status: string | null;
  organization_id: string | null;
  message?: string;
  error?: string;
  details?: unknown;
}

interface SubscriptionAccessResult {
  data: SubscriptionAccessStatus | null;
  error: unknown;
  authenticated: boolean;
}

const invokeWithToken = (accessToken: string) =>
  supabase.functions.invoke<SubscriptionAccessStatus>("check-subscription-status", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

const isAuthenticationError = (data: SubscriptionAccessStatus | null) => {
  const message = `${data?.message ?? ""} ${data?.error ?? ""}`.toLowerCase();
  return (
    message.includes("invalid or expired token") ||
    message.includes("no authorization header") ||
    message.includes("authentication required") ||
    message.includes("invalid claim") ||
    message.includes("user not found")
  );
};

export async function checkSubscriptionAccess(): Promise<SubscriptionAccessResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session?.access_token) {
    return { data: null, error: null, authenticated: false };
  }

  let result = await invokeWithToken(session.access_token);

  if (result.error || isAuthenticationError(result.data)) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedSession = refreshedData.session;

    if (!refreshError && refreshedSession?.access_token) {
      result = await invokeWithToken(refreshedSession.access_token);
    }
  }

  return {
    data: result.data,
    error: result.error,
    authenticated: true,
  };
}