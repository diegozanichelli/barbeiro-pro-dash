import { z } from "zod";

export const barberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter no mínimo 2 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  email: z
    .string()
    .trim()
    .email("Email inválido")
    .max(255, "Email deve ter no máximo 255 caracteres"),
  password: z
    .string()
    .min(8, "Senha deve ter no mínimo 8 caracteres")
    .optional()
    .or(z.literal("")),
  unitId: z.string().uuid("Selecione uma unidade válida"),
  servicesCommission: z
    .number()
    .min(0, "Comissão deve ser no mínimo 0%")
    .max(100, "Comissão deve ser no máximo 100%"),
  productsCommission: z
    .number()
    .min(0, "Comissão deve ser no mínimo 0%")
    .max(100, "Comissão deve ser no máximo 100%"),
  status: z.enum(["active", "inactive"]),
});

export type BarberFormData = z.infer<typeof barberSchema>;
