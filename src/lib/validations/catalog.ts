import { z } from "zod";

export const catalogServiceSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
  default_price: z.number().min(0, "Preço não pode ser negativo").max(99999, "Preço máximo excedido"),
  category: z.enum(["basic", "extra"], {
    required_error: "Selecione uma categoria",
    invalid_type_error: "Categoria inválida"
  }),
  fixed_commission: z.number().min(0, "Comissão não pode ser negativa").max(100, "Comissão máxima é 100%").nullable(),
  is_active: z.boolean()
});

export const catalogProductSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
  default_price: z.number().min(0, "Preço não pode ser negativo").max(99999, "Preço máximo excedido"),
  fixed_commission: z.number().min(0, "Comissão não pode ser negativa").max(100, "Comissão máxima é 100%").nullable(),
  is_active: z.boolean()
});

export type CatalogServiceFormData = z.infer<typeof catalogServiceSchema>;
export type CatalogProductFormData = z.infer<typeof catalogProductSchema>;
