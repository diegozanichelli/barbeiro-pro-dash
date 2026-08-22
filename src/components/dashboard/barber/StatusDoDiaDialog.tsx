import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";

export type PresenceType = "present" | "day_off" | "absence" | "optional_sunday";

interface StatusDoDiaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string;
  date: string;
  isLoading?: boolean;
  onConfirm: (status: PresenceType) => Promise<void> | void;
}

export default function StatusDoDiaDialog({
  open,
  onOpenChange,
  barberId,
  date,
  isLoading = false,
  onConfirm,
}: StatusDoDiaDialogProps) {
  void barberId;

  const isSunday = (() => {
    if (!date) return false;
    const d = new Date(`${date}T12:00:00`);
    return d.getDay() === 0;
  })();

  const [selectedValue, setSelectedValue] = useState<PresenceType>("present");

  useEffect(() => {
    if (open) {
      setSelectedValue(isSunday ? "optional_sunday" : "present");
    }
  }, [open, isSunday]);

  const handleConfirm = async () => {
    await onConfirm(selectedValue);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar Status do Dia</DialogTitle>
          <DialogDescription>Selecione o que ocorreu neste dia.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <RadioGroup
            value={selectedValue}
            onValueChange={(value) => setSelectedValue(value as PresenceType)}
            className="space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="present" id="status-present" />
              <Label htmlFor="status-present" className="cursor-pointer">
                Trabalhei mas não vendi
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <RadioGroupItem value="day_off" id="status-day-off" />
              <Label htmlFor="status-day-off" className="cursor-pointer">
                Folga
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <RadioGroupItem value="absence" id="status-absence" />
              <Label htmlFor="status-absence" className="cursor-pointer">
                Falta / Atestado
              </Label>
            </div>

            {isSunday && (
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="optional_sunday" id="status-optional-sunday" />
                <Label htmlFor="status-optional-sunday" className="cursor-pointer">
                  Domingo opcional (não conta como folga/falta)
                </Label>
              </div>
            )}
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirmando...
              </>
            ) : (
              "Confirmar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
