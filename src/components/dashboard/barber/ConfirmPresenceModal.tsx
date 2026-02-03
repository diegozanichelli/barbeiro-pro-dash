import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users } from "lucide-react";

interface ConfirmPresenceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (subscriptionClientsCount: number) => void;
  isLoading?: boolean;
}

export default function ConfirmPresenceModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
}: ConfirmPresenceModalProps) {
  const [clientsCount, setClientsCount] = useState(0);

  const handleConfirm = () => {
    onConfirm(clientsCount);
    setClientsCount(0); // Reset para próxima vez
  };

  const handleCancel = () => {
    setClientsCount(0);
    onOpenChange(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Se campo vazio ou só zeros, permitir edição limpa
    if (value === "" || value === "0") {
      setClientsCount(0);
      return;
    }
    // Remover zeros à esquerda e converter
    const numValue = parseInt(value.replace(/^0+/, ""), 10);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setClientsCount(numValue);
    }
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Selecionar todo o conteúdo ao focar
    e.target.select();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Confirmar Presença
          </DialogTitle>
          <DialogDescription>
            Você trabalhou hoje mas não teve vendas diretas. Registre quantos
            clientes de assinatura atendeu para contabilizar o dia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="clients-count">
              Clientes de assinatura atendidos
            </Label>
            <Input
              id="clients-count"
              type="number"
              min="0"
              max="100"
              value={clientsCount}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              placeholder="0"
              className="text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Informe quantos clientes com assinatura você atendeu hoje (0-100)
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
