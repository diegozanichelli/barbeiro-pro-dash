import { z } from "zod";

export const goalSchema = z.object({
  barberId: z.string().uuid("Selecione um barbeiro válido"),
  targetCommission: z
    .number()
    .min(0, "Meta deve ser positiva")
    .max(999999, "Meta muito alta"),
  workDays: z
    .number()
    .int("Deve ser um número inteiro")
    .min(1, "Mínimo de 1 dia")
    .max(31, "Máximo de 31 dias"),
  month: z
    .number()
    .int("Deve ser um número inteiro")
    .min(1, "Mês inválido")
    .max(12, "Mês inválido"),
  year: z
    .number()
    .int("Deve ser um número inteiro")
    .min(2024, "Ano inválido")
    .max(2050, "Ano inválido"),
});

export type GoalFormData = z.infer<typeof goalSchema>;
