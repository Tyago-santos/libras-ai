import type { ZodType } from "zod";
import { AppError } from "./errors";

/** Valida payload com Zod e converte falha em VALIDATION_ERROR (400). */
export function validate<T>(schema: ZodType<T>, data: unknown, where: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", `Payload inválido em ${where}`, {
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  return result.data;
}
