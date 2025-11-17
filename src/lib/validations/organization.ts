import { z } from "zod";

export const organizationEditSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Nome da barbearia deve ter no mínimo 2 caracteres")
    .max(100, "Nome da barbearia deve ter no máximo 100 caracteres"),
  managerName: z
    .string()
    .trim()
    .min(2, "Nome do gerente deve ter no mínimo 2 caracteres")
    .max(100, "Nome do gerente deve ter no máximo 100 caracteres"),
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
  confirmPassword: z
    .string()
    .optional()
    .or(z.literal("")),
}).refine(
  (data) => {
    if (data.password && data.password.length > 0) {
      return data.password === data.confirmPassword;
    }
    return true;
  },
  {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  }
);

export type OrganizationEditFormData = z.infer<typeof organizationEditSchema>;
