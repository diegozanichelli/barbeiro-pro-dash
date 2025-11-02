import { useSubscriptionCheck } from "@/hooks/useSubscriptionCheck";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { status, loading } = useSubscriptionCheck();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If no access and not loading, user will be redirected by the hook
  if (!status?.has_access) {
    return null;
  }

  return <>{children}</>;
}