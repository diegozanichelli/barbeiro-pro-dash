import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  isPushSupported, 
  registerPushSubscription, 
  unregisterPushSubscription, 
  checkPushSubscriptionExists 
} from "@/lib/pushNotifications";

interface PushNotificationToggleProps {
  barberId: string;
  organizationId: string;
  userId: string;
}

export default function PushNotificationToggle({ barberId, organizationId, userId }: PushNotificationToggleProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const check = async () => {
      const supported = await isPushSupported();
      setIsSupported(supported);
      if (supported && userId) {
        const exists = await checkPushSubscriptionExists(userId);
        setIsEnabled(exists);
      }
      setIsLoading(false);
    };
    check();
  }, [userId]);

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      if (isEnabled) {
        await unregisterPushSubscription();
        setIsEnabled(false);
        toast.success("Notificações desativadas");
      } else {
        await registerPushSubscription(barberId, organizationId);
        setIsEnabled(true);
        toast.success("Notificações ativadas! Você receberá atualizações de meta às 9h, 13h, 16h e 19h.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar notificações");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) return null;

  return (
    <Button
      variant={isEnabled ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isEnabled ? (
        <Bell className="w-4 h-4" />
      ) : (
        <BellOff className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">
        {isLoading ? "..." : isEnabled ? "Notificações ON" : "Ativar Notificações"}
      </span>
    </Button>
  );
}
