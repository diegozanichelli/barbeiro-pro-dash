import { Crown, AlertTriangle, BellRing, Loader2, RotateCw } from "lucide-react";
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
 * Banner de status do ciclo de assinatura — 3 estados visuais:
 * - EM DIA: verde discreto, botão neutro
 * - RENOVAÇÃO DISPONÍVEL: âmbar com pulse, botão dourado
 * - VENCIDO: vermelho intenso
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

  const containerClass = cn(
    "rounded-md border px-3 py-2.5 flex items-center justify-between gap-3 transition-colors",
    isHealthy && "border-emerald-500/30 bg-emerald-500/10",
    isDue && "border-amber-500/40 bg-amber-500/15 animate-pulse-slow",
    isOverdue && "border-destructive/50 bg-destructive/15"
  );

  const iconClass = cn(
    "h-4 w-4 shrink-0",
    isHealthy && "text-emerald-600 dark:text-emerald-400",
    isDue && "text-amber-600 dark:text-amber-400",
    isOverdue && "text-destructive"
  );

  const titleClass = cn(
    "text-xs font-semibold leading-tight",
    isHealthy && "text-emerald-700 dark:text-emerald-300",
    isDue && "text-amber-700 dark:text-amber-300",
    isOverdue && "text-destructive"
  );

  const subClass = cn(
    "text-[11px] leading-tight",
    isHealthy && "text-emerald-700/80 dark:text-emerald-300/80",
    isDue && "text-amber-700/80 dark:text-amber-300/80",
    isOverdue && "text-destructive/85"
  );

  const Icon = isOverdue ? AlertTriangle : isDue ? BellRing : Crown;

  const title = isOverdue
    ? "Assinatura vencida"
    : isDue
      ? "Renovação disponível"
      : "Assinatura ativa";

  const sub = planName
    ? `${planName} • ${cycle.label}`
    : cycle.label;

  const buttonLabel = isOverdue
    ? "Renovar"
    : isDue
      ? "Renovar agora"
      : "Antecipar renovação";

  const buttonClass = cn(
    "h-8 px-3 text-xs gap-1.5 shrink-0",
    isOverdue && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    isDue && "bg-amber-500 text-black hover:bg-amber-500/90",
    isHealthy && "bg-emerald-600 text-white hover:bg-emerald-600/90"
  );

  return (
    <div className={containerClass} role="status" aria-live="polite">
      <div className="flex items-start gap-2 min-w-0 flex-1">
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
