import { Crown, AlertTriangle, BellRing, Clock, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CycleInfo } from "@/lib/subscriptionCycle";

interface SubscriptionCycleBannerProps {
  cycle: CycleInfo | null;
  loading?: boolean;
  planName?: string | null;
  onRenew?: () => void;
  /** Quando true, o botão "Renovar agora" entra em estado de loading */
  renewing?: boolean;
  /** Esconde o botão (útil quando já existe um plano no carrinho) */
  hideRenewButton?: boolean;
}

/**
 * Banner de status do ciclo de assinatura — 4 estados visuais:
 * - EM DIA: verde discreto, botão "Antecipar renovação"
 * - RENOVAÇÃO DISPONÍVEL: âmbar com pulse, botão dourado destacado
 * - VENCIDO: vermelho intenso, botão de urgência
 * - SEM HISTÓRICO: neutro com borda âmbar (assinante legado, sem ciclo ancorado)
 *
 * Usa apenas tokens semânticos do design system.
 */
export function SubscriptionCycleBanner({
  cycle,
  loading = false,
  planName,
  onRenew,
  renewing = false,
  hideRenewButton = false,
}: SubscriptionCycleBannerProps) {
  if (loading) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Verificando ciclo da assinatura...
      </div>
    );
  }

  if (!cycle) return null;

  const isOverdue = cycle.status === "vencido";
  const isDue = cycle.status === "renovacao_disponivel";
  const isHealthy = cycle.status === "em_dia";
  const isLegacy = cycle.status === "sem_historico";

  const containerClass = cn(
    "rounded-lg border-2 px-3.5 py-3 flex items-center justify-between gap-3 transition-colors shadow-sm",
    isHealthy && "border-emerald-500/40 bg-emerald-500/10",
    isDue && "border-amber-500/60 bg-amber-500/15 animate-pulse-slow shadow-[0_0_18px_-6px] shadow-amber-500/40",
    isOverdue && "border-destructive/60 bg-destructive/15 shadow-[0_0_18px_-6px] shadow-destructive/40",
    isLegacy && "border-amber-500/40 bg-muted/40"
  );

  const iconClass = cn(
    "h-5 w-5 shrink-0",
    isHealthy && "text-emerald-600 dark:text-emerald-400",
    isDue && "text-amber-600 dark:text-amber-400",
    isOverdue && "text-destructive",
    isLegacy && "text-amber-600 dark:text-amber-400"
  );

  const titleClass = cn(
    "text-xs font-bold leading-tight tracking-wide uppercase",
    isHealthy && "text-emerald-700 dark:text-emerald-300",
    isDue && "text-amber-700 dark:text-amber-300",
    isOverdue && "text-destructive",
    isLegacy && "text-foreground"
  );

  const subClass = cn(
    "text-[11px] leading-tight mt-0.5",
    isHealthy && "text-emerald-700/85 dark:text-emerald-300/85",
    isDue && "text-amber-700/85 dark:text-amber-300/85",
    isOverdue && "text-destructive/85",
    isLegacy && "text-muted-foreground"
  );

  const Icon = isOverdue
    ? AlertTriangle
    : isDue
      ? BellRing
      : isLegacy
        ? Clock
        : Crown;

  const title = isOverdue
    ? "Assinatura VENCIDA"
    : isDue
      ? "Renovação disponível"
      : isLegacy
        ? "Assinante (sem ciclo registrado)"
        : "Assinatura ativa";

  const sub = planName
    ? `${planName}${cycle.label ? ` • ${cycle.label}` : ""}`
    : cycle.label;

  const buttonLabel = isOverdue
    ? "Renovar agora"
    : isDue
      ? "Renovar agora"
      : isLegacy
        ? "Renovar e iniciar ciclo"
        : "Antecipar renovação";

  const buttonClass = cn(
    "h-9 px-3.5 text-xs font-semibold gap-1.5 shrink-0",
    isOverdue && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    isDue && "bg-amber-500 text-black hover:bg-amber-500/90",
    isHealthy && "bg-emerald-600 text-white hover:bg-emerald-600/90",
    isLegacy && "bg-amber-500 text-black hover:bg-amber-500/90"
  );

  return (
    <div className={containerClass} role="status" aria-live="polite">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <Icon className={iconClass} />
        <div className="min-w-0">
          <p className={titleClass}>{title}</p>
          <p className={subClass}>{sub}</p>
        </div>
      </div>

      {!hideRenewButton && onRenew && (
        <Button
          type="button"
          size="sm"
          onClick={onRenew}
          disabled={renewing}
          className={buttonClass}
        >
          {renewing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          {buttonLabel}
        </Button>
      )}
    </div>
  );
}

