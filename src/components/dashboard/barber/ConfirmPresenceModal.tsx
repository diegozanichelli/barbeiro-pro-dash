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
import { UserCheck, CalendarOff, XCircle, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getManausDate } from "@/lib/dateUtils";

interface ConfirmPresenceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (subscriptionClientsCount: number, date: string, presenceType: string) => void;
  isLoading?: boolean;
}

type PresenceType = "present" | "day_off" | "absence";

const presenceOptions: { value: PresenceType; label: string; description: string; icon: typeof UserCheck; colorClass: string; selectedClass: string }[] = [
  {
    value: "present",
    label: "Trabalhei mas não vendi",
    description: "Conta como dia trabalhado. A média de vendas será impactada.",
    icon: UserCheck,
    colorClass: "text-orange-500",
    selectedClass: "border-orange-500 bg-orange-500/10",
  },
  {
    value: "day_off",
    label: "Folga / Troca de escala",
    description: "Não conta como dia trabalhado. A meta diária sobe nos dias restantes.",
    icon: CalendarOff,
    colorClass: "text-blue-500",
    selectedClass: "border-blue-500 bg-blue-500/10",
  },
  {
    value: "absence",
    label: "Falta / Atestado",
    description: "Ausência não planejada registrada.",
    icon: XCircle,
    colorClass: "text-red-500",
    selectedClass: "border-red-500 bg-red-500/10",
  },
];

export default function ConfirmPresenceModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
}: ConfirmPresenceModalProps) {
  const [clientsCount, setClientsCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(getManausDate());
  const [presenceType, setPresenceType] = useState<PresenceType>("present");

  const handleConfirm = () => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    onConfirm(presenceType === "present" ? clientsCount : 0, dateStr, presenceType);
    setClientsCount(0);
    setSelectedDate(getManausDate());
    setPresenceType("present");
  };

  const handleCancel = () => {
    setClientsCount(0);
    setSelectedDate(getManausDate());
    setPresenceType("present");
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

  const today = getManausDate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Registro de Ocorrência
          </DialogTitle>
          <DialogDescription>
            Classifique o que aconteceu neste dia sem vendas diretas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Classificação */}
          <div className="space-y-2">
            <Label>O que aconteceu?</Label>
            <div className="space-y-2">
              {presenceOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = presenceType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPresenceType(option.value)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left",
                      isSelected ? option.selectedClass : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", option.colorClass)} />
                    <div>
                      <p className="font-medium text-sm text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Data */}
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
                    ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
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
          </div>

          {/* Clientes de assinatura - só para "present" */}
          {presenceType === "present" && (
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
          )}
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
