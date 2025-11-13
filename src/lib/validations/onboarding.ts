import { z } from "zod";

export const onboardingSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Nome da organização deve ter no mínimo 2 caracteres")
    .max(100, "Nome da organização deve ter no máximo 100 caracteres"),
  fullName: z
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
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z\d])/,
      "Senha deve conter letras maiúsculas e minúsculas ou números"
    ),
});

export type OnboardingFormData = z.infer<typeof onboardingSchema>;
