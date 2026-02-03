import { useMemo } from "react";

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
  // Points
  points_faturamento: number;
  points_ticket: number;
  points_produtos: number;
  points_extras: number;
  points_assinaturas: number;
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

const VALIDATION_THRESHOLD = 15000; // R$ 15.000,00

export function useChampionshipPoints(barbers: RawBarberData[]): ChampionshipBarber[] {
  return useMemo(() => {
    return barbers.map((barber) => {
      // Total revenue includes all sources
      const total_revenue = barber.services_total + barber.services_extra_total + barber.products_total;
      const ticket_medio = barber.clients_count > 0 
        ? total_revenue / barber.clients_count 
        : 0;

      // Points calculation based on rules
      // 1. Faturamento: Math.floor(FaturamentoTotal / 1000) * 10 pontos
      const points_faturamento = Math.floor(total_revenue / 1000) * 10;

      // 2. Ticket Médio (Mensal)
      let points_ticket = 0;
      if (ticket_medio >= 130) {
        points_ticket = 25;
      } else if (ticket_medio >= 110) {
        points_ticket = 15;
      } else if (ticket_medio >= 100) {
        points_ticket = 5;
      }

      // 3. Produtos: 5 pontos por item vendido
      const points_produtos = barber.products_count * 5;

      // 4. Extras: 3 pontos por serviço extra vendido
      const points_extras = barber.extras_count * 3;

      // 5. Assinaturas: 10 pontos por venda (type='subscription' in sale_transactions)
      const points_assinaturas = barber.subscriptions_count * 10;

      // Total
      const total_points = points_faturamento + points_ticket + points_produtos + points_extras + points_assinaturas;

      // Validation: Only validated if revenue >= R$ 15.000,00
      const is_validated = total_revenue >= VALIDATION_THRESHOLD;

      return {
        ...barber,
        total_revenue,
        ticket_medio,
        points_faturamento,
        points_ticket,
        points_produtos,
        points_extras,
        points_assinaturas,
        total_points,
        is_validated,
      };
    }).sort((a, b) => b.total_points - a.total_points);
  }, [barbers]);
}

export function getTicketTier(ticket: number): string {
  if (ticket >= 130) return "Elite (25 pts)";
  if (ticket >= 110) return "Ouro (15 pts)";
  if (ticket >= 100) return "Prata (5 pts)";
  return "Sem bônus";
}
