import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  catalogServiceSchema,
  catalogProductSchema,
  type CatalogServiceFormData,
  type CatalogProductFormData,
} from "@/lib/validations/catalog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface CatalogItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  type: "service" | "product";
  item?: {
    id: string;
    name: string;
    default_price: number;
    category?: string;
    fixed_commission: number | null;
    is_active: boolean;
  } | null;
  onSuccess: () => void;
}

export default function CatalogItemModal({
  open,
  onOpenChange,
  organizationId,
  type,
  item,
  onSuccess,
}: CatalogItemModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasFixedCommission, setHasFixedCommission] = useState(false);

  const isService = type === "service";
  const schema = isService ? catalogServiceSchema : catalogProductSchema;
  const isEditing = !!item;

  const form = useForm<CatalogServiceFormData | CatalogProductFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      default_price: 0,
      ...(isService ? { category: "basic" as const } : {}),
      fixed_commission: null,
      is_active: true,
    },
  });

  useEffect(() => {
    if (item) {
      form.reset({
        name: item.name,
        default_price: item.default_price,
        ...(isService && item.category ? { category: item.category as "basic" | "extra" } : {}),
        fixed_commission: item.fixed_commission,
        is_active: item.is_active,
      });
      setHasFixedCommission(item.fixed_commission !== null);
    } else {
      form.reset({
        name: "",
        default_price: 0,
        ...(isService ? { category: "basic" as const } : {}),
        fixed_commission: null,
        is_active: true,
      });
      setHasFixedCommission(false);
    }
  }, [item, isService, form]);

  const handleSubmit = async (data: CatalogServiceFormData | CatalogProductFormData) => {
    setIsLoading(true);

    try {
      const table = isService ? "catalog_services" : "catalog_products";
      const payload = {
        organization_id: organizationId,
        name: data.name,
        default_price: data.default_price,
        fixed_commission: hasFixedCommission ? data.fixed_commission : null,
        is_active: data.is_active,
        ...(isService && "category" in data ? { category: data.category } : {}),
      };

      if (isEditing && item) {
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq("id", item.id);

        if (error) throw error;
        toast.success(`${isService ? "Serviço" : "Produto"} atualizado com sucesso!`);
      } else {
        const { error } = await supabase.from(table).insert(payload);

        if (error) throw error;
        toast.success(`${isService ? "Serviço" : "Produto"} criado com sucesso!`);
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving catalog item:", error);
      toast.error(error.message || "Erro ao salvar item");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEditing ? "Editar" : "Novo"} {isService ? "Serviço" : "Produto"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Progressiva" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="default_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço Padrão (R$)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isService && (
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value as string}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a categoria" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="basic">Serviço Básico</SelectItem>
                        <SelectItem value="extra">Serviço Extra</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <Label htmlFor="fixed-commission-toggle" className="font-medium">
                    Comissão Fixa
                  </Label>
                </div>
                <Switch
                  id="fixed-commission-toggle"
                  checked={hasFixedCommission}
                  onCheckedChange={(checked) => {
                    setHasFixedCommission(checked);
                    if (!checked) {
                      form.setValue("fixed_commission", null);
                    }
                  }}
                />
              </div>

              {hasFixedCommission ? (
                <FormField
                  control={form.control}
                  name="fixed_commission"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Taxa Fixa (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="30"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value ? parseFloat(e.target.value) : null
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        Esta taxa será usada em vez do plano de carreira do barbeiro
                      </p>
                    </FormItem>
                  )}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Usa a comissão do plano de carreira do barbeiro
                </p>
              )}
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                  <FormLabel className="font-medium">Ativo</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isEditing ? (
                  "Salvar"
                ) : (
                  "Criar"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
