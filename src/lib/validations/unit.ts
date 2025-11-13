import { z } from "zod";

export const unitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter no mínimo 2 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  status: z.enum(["active", "inactive"]),
});

export type UnitFormData = z.infer<typeof unitSchema>;
