/**
 * Extrai a mensagem de erro real retornada por uma Edge Function.
 * O supabase-js entrega um FunctionsHttpError genérico
 * ("Edge Function returned a non-2xx status code"), escondendo o corpo JSON.
 */
export async function getEdgeFunctionErrorMessage(
  error: unknown,
  fallback = "Erro inesperado ao executar a operação"
): Promise<string> {
  const err = error as { context?: Response; message?: string } | null;

  const response = err?.context;
  if (response && typeof (response as Response).text === "function") {
    try {
      const raw = await (response as Response).clone().text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const message = parsed?.error || parsed?.message;
          if (typeof message === "string" && message.trim()) return message;
        } catch {
          if (raw.trim() && !raw.trim().startsWith("<")) return raw.trim();
        }
      }
    } catch {
      // ignora falha de leitura do corpo
    }
  }

  if (err?.message && !err.message.includes("non-2xx status code")) {
    return err.message;
  }

  return fallback;
}
