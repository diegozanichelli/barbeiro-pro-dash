import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Users, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTodayString, getManausDate } from "@/lib/dateUtils";

interface ConfirmPresenceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (subscriptionClientsCount: number, date: string) => void;
  isLoading?: boolean;
}

export default function ConfirmPresenceModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
}: ConfirmPresenceModalProps) {
  const [clientsCount, setClientsCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(getManausDate());

  const handleConfirm = () => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    onConfirm(clientsCount, dateStr);
    setClientsCount(0);
    setSelectedDate(getManausDate());
  };

  const handleCancel = () => {
    setClientsCount(0);
    setSelectedDate(getManausDate());
    onOpenChange(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || value === "0") {
      setClientsCount(0);
      return;
    }
    const numValue = parseInt(value.replace(/^0+/, ""), 10);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setClientsCount(numValue);
    }
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  // Desabilitar datas futuras
  const today = getManausDate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Confirmar Presença
          </DialogTitle>
          <DialogDescription>
            Registre sua presença para um dia sem vendas diretas. Informe a data
            e quantos clientes de assinatura atendeu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Data do registro</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate
                    ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", {
                        locale: ptBR,
                      })
                    : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  disabled={(date) => date > today}
                  initialFocus
                  locale={ptBR}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Selecione a data em que você trabalhou sem vendas
            </p>
          </div>

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
              Informe quantos clientes com assinatura você atendeu (0-100)
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