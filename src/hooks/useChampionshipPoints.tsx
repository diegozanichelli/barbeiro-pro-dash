import { useMemo } from "react";
import { ChampionshipConfig, DEFAULT_CHAMPIONSHIP_CONFIG } from "@/hooks/useChampionshipConfig";

export interface ChampionshipDetail {
  extras_high_count: number;
  subs_by_plan: Record<string, number>;
  new_clients_unconverted: number;
  days_off_count: number;
}

export interface ChampionshipBarber {
  barber_id: string;
  barber_name: string;
  unit_name: string;
  // Financial data
  services_total: number;
  services_extra_total: number;
  products_total: number;
  clients_count: number;
  products_count: number;
  extras_count: number;
  subscriptions_count: number;
  // Calculated
  total_revenue: number;
  ticket_medio: number;
  // Details
  extras_high_count: number;
  new_clients_unconverted: number;
  days_off_count: number;
  // Points
  points_faturamento: number;
  points_ticket: number;
  points_produtos: number;
  points_extras: number;
  points_assinaturas: number;
  points_penalties: number;
  total_points: number;
  // Validation
  is_validated: boolean;
}

interface RawBarberData {
  barber_id: string;
  barber_name: string;
  unit_name: string;
  services_total: number;
  services_extra_total: number;
  products_total: number;
  clients_count: number;
  products_count: number;
  extras_count: number;
  subscriptions_count: number;
}

const EMPTY_DETAIL: ChampionshipDetail = {
  extras_high_count: 0,
  subs_by_plan: {},
  new_clients_unconverted: 0,
  days_off_count: 0,
};

export function useChampionshipPoints(
  barbers: RawBarberData[],
  config: ChampionshipConfig = DEFAULT_CHAMPIONSHIP_CONFIG,
  details: Record<string, ChampionshipDetail> = {}
): ChampionshipBarber[] {
  return useMemo(() => {
    return barbers
      .map((barber) => {
        const detail = details[barber.barber_id] ?? EMPTY_DETAIL;
        const total_revenue =
          barber.services_total + barber.services_extra_total + barber.products_total;
        const ticket_medio = barber.clients_count > 0 ? total_revenue / barber.clients_count : 0;

        // 1. Faturamento
        const points_faturamento = config.revenue_enabled
          ? Math.floor(total_revenue / 1000) * config.revenue_points_per_1000
          : 0;

        // 2. Ticket médio (faixas configuráveis)
        let points_ticket = 0;
        if (config.ticket_enabled) {
          const tier = [...config.ticket_tiers]
            .sort((a, b) => b.min - a.min)
            .find((t) => ticket_medio >= t.min);
          points_ticket = tier ? tier.points : 0;
        }

        // 3. Produtos
        const points_produtos = config.products_enabled
          ? barber.products_count * config.product_points
          : 0;

        // 4. Serviços extras (dobrados acima do valor configurado)
        let points_extras = 0;
        if (config.extras_enabled) {
          const high = Math.min(detail.extras_high_count, barber.extras_count);
          const normal = Math.max(barber.extras_count - high, 0);
          points_extras =
            normal * config.extra_points + high * config.extra_points * config.extra_high_multiplier;
        }

        // 5. Assinaturas (peso por plano)
        let points_assinaturas = 0;
        if (config.subscriptions_enabled) {
          const entries = Object.entries(detail.subs_by_plan);
          if (entries.length > 0) {
            points_assinaturas = entries.reduce((acc, [planId, count]) => {
              const multiplier = Number(config.plan_multipliers[planId] ?? 1) || 1;
              return acc + count * config.subscription_points * multiplier;
            }, 0);
          } else {
            points_assinaturas = barber.subscriptions_count * config.subscription_points;
          }
        }

        // 6. Penalidades
        let points_penalties = 0;
        if (config.penalty_unconverted_enabled) {
          points_penalties -= detail.new_clients_unconverted * config.penalty_unconverted_points;
        }
        if (config.penalty_dayoff_enabled) {
          points_penalties -= detail.days_off_count * config.penalty_dayoff_points;
        }

        const total_points = Math.round(
          points_faturamento +
            points_ticket +
            points_produtos +
            points_extras +
            points_assinaturas +
            points_penalties
        );

        const is_validated = config.validation_enabled
          ? total_revenue >= config.min_revenue
          : true;

        return {
          ...barber,
          total_revenue,
          ticket_medio,
          extras_high_count: detail.extras_high_count,
          new_clients_unconverted: detail.new_clients_unconverted,
          days_off_count: detail.days_off_count,
          points_faturamento: Math.round(points_faturamento),
          points_ticket: Math.round(points_ticket),
          points_produtos: Math.round(points_produtos),
          points_extras: Math.round(points_extras),
          points_assinaturas: Math.round(points_assinaturas),
          points_penalties: Math.round(points_penalties),
          total_points,
          is_validated,
        };
      })
      .sort((a, b) => b.total_points - a.total_points);
  }, [barbers, config, details]);
}

export function getTicketTier(ticket: number, config: ChampionshipConfig = DEFAULT_CHAMPIONSHIP_CONFIG): string {
  const tier = [...config.ticket_tiers].sort((a, b) => b.min - a.min).find((t) => ticket >= t.min);
  return tier ? `${tier.points} pts (a partir de R$ ${tier.min})` : "Sem bônus";
}
