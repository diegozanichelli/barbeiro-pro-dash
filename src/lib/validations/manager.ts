import { z } from "zod";

export const managerAuthSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Email inválido")
    .max(255, "Email deve ter no máximo 255 caracteres"),
  password: z
    .string()
    .min(8, "Senha deve ter no mínimo 8 caracteres")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z\d])/,
      "Senha deve conter letras maiúsculas e minúsculas ou números"
    )
    .optional()
    .or(z.literal("")),
});

export type ManagerAuthFormData = z.infer<typeof managerAuthSchema>;
