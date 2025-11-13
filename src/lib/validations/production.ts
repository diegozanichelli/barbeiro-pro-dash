import { z } from "zod";

export const dailyProductionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  servicesBasicTotal: z
    .number()
    .min(0, "Valor deve ser positivo")
    .max(999999, "Valor muito alto"),
  servicesExtraTotal: z
    .number()
    .min(0, "Valor deve ser positivo")
    .max(999999, "Valor muito alto"),
  productsTotal: z
    .number()
    .min(0, "Valor deve ser positivo")
    .max(999999, "Valor muito alto"),
  clientsCount: z
    .number()
    .int("Deve ser um número inteiro")
    .min(0, "Valor deve ser positivo")
    .max(9999, "Valor muito alto"),
  servicesCount: z
    .number()
    .int("Deve ser um número inteiro")
    .min(0, "Valor deve ser positivo")
    .max(9999, "Valor muito alto"),
  productsCount: z
    .number()
    .int("Deve ser um número inteiro")
    .min(0, "Valor deve ser positivo")
    .max(9999, "Valor muito alto"),
});

export type DailyProductionFormData = z.infer<typeof dailyProductionSchema>;
