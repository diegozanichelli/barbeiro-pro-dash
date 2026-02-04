import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle } from "lucide-react";

interface DivergenceModalProps {
  open: boolean;
  onClose: () => void;
  manualTotal: number;
  txTotal: number;
  hasDivergence: boolean;
}

export default function DivergenceModal({ 
  open, 
  onClose, 
  manualTotal, 
  txTotal, 
  hasDivergence 
}: DivergenceModalProps) {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const divergencePercent = txTotal > 0 
    ? Math.abs((manualTotal - txTotal) / txTotal * 100).toFixed(1) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasDivergence ? (
              <>
                <AlertTriangle className="w-5 h-5 text-warning" />
                Divergência Detectada
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-success" />
                Fechamento Perfeito!
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {hasDivergence 
              ? "Os valores declarados não coincidem com os registros do gestor."
              : "Seus valores batem com os registros do gestor."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {hasDivergence ? (
            <>
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Registrado pelo Gestor (Ao Vivo):</span>
                  <span className="font-semibold text-warning">{formatCurrency(txTotal)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Declarado por você:</span>
                  <span className="font-semibold">{formatCurrency(manualTotal)}</span>
                </div>
                <div className="border-t border-warning/20 pt-2 flex justify-between items-center">
                  <span className="text-sm font-medium">Diferença:</span>
                  <span className="font-bold text-warning">
                    {formatCurrency(Math.abs(manualTotal - txTotal))} ({divergencePercent}%)
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                ⚠️ Confirme com a recepção para alinhar os valores.
              </p>
            </>
          ) : (
            <div className="bg-success/10 border border-success/20 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Registrado pelo Gestor:</span>
                <span className="font-semibold text-success">{formatCurrency(txTotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Declarado por você:</span>
                <span className="font-semibold text-success">{formatCurrency(manualTotal)}</span>
              </div>
              <p className="text-sm text-center text-success font-medium pt-2">
                ✅ Dados confirmados com sucesso!
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
