import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RotateCcw } from "lucide-react";

export interface SlideField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number";
  placeholder?: string;
  helper?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: SlideField[];
  initialValues: Record<string, string | number | undefined>;
  onSave: (values: Record<string, string | number | null>) => Promise<void>;
  onReset?: () => Promise<void>;
}

export default function SlideEditDialog({ open, onOpenChange, title, description, fields, initialValues, onSave, onReset }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    fields.forEach((f) => {
      const v = initialValues[f.key];
      o[f.key] = v === undefined || v === null ? "" : String(v);
    });
    return o;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const out: Record<string, string | number | null> = {};
      fields.forEach((f) => {
        const raw = values[f.key]?.trim();
        if (!raw) { out[f.key] = null; return; }
        out[f.key] = f.type === "number" ? Number(raw.replace(",", ".")) : raw;
      });
      await onSave(out);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!onReset) return;
    setSaving(true);
    try {
      await onReset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea
                  id={f.key}
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  rows={3}
                />
              ) : (
                <Input
                  id={f.key}
                  type={f.type === "number" ? "number" : "text"}
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  step={f.type === "number" ? "0.01" : undefined}
                />
              )}
              {f.helper && <p className="text-xs text-muted-foreground">{f.helper}</p>}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {onReset && (
            <Button variant="ghost" onClick={handleReset} disabled={saving} className="mr-auto">
              <RotateCcw className="w-4 h-4 mr-2" /> Restaurar padrão
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
