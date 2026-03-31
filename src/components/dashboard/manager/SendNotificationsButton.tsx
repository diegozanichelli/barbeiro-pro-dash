import { useState } from "react";
import { Bell, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";

export default function SendNotificationsButton() {
  const { organizationId } = useOrganization();
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!organizationId) return;
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-barber-notifications', {
        body: {
          schedule_type: 'manual',
          organization_id: organizationId,
        },
      });

      if (error) throw error;

      if (data?.sent > 0) {
        toast.success(`Notificação enviada para ${data.sent} barbeiro(s)`);
      } else {
        toast.info("Nenhum barbeiro com notificações ativas encontrado");
      }
    } catch (err: any) {
      toast.error("Erro ao enviar notificações: " + (err.message || "Erro desconhecido"));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSend}
      disabled={isSending}
      className="gap-2"
    >
      {isSending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Send className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">Notificar Barbeiros</span>
      <span className="sm:hidden">
        <Bell className="w-4 h-4" />
      </span>
    </Button>
  );
}
