import { useMemo } from "react";
import { isNewSubscription, isValidOpportunity } from "@/lib/metricsRules";
import { normalizePhoneForMetrics } from "@/lib/normalizers";
import type { Tables } from "@/integrations/supabase/types";

type SaleTransactionRow = Tables<"sale_transactions">;
type TxWithBarberRelation = Pick<
  SaleTransactionRow,
  "barber_id" | "unit_id" | "is_new_client" | "item_type" | "subscription_action" | "mobile_phone" | "client_name"
> & {
  barbers?: { name?: string | null; units?: { name?: string | null } | null } | null;
};

type ReceptionTx = Pick<
  SaleTransactionRow,
  "unit_id" | "is_new_client" | "item_type" | "subscription_action" | "mobile_phone"
>;

export interface DataHealth {
  totalInPeriod: number;
  txSemUnidade: number;
  novoSemTelefone: number;
  novaAdesaoSemTelefone: number;
  novaAdesaoSemIsNewClient: number;
}

export interface BarberClientDrilldown {
  barberId: string;
  barberName: string;
  unitId: string | null;
  unitName: string;
  opportunities: Array<{ phone: string; name: string; converted: boolean; attendances: number }>;
}

export interface BarberPerformance {
  barberId: string;
  barberName: string;
  unitName: string;
  opportunities: number;
  rawNewAttendances: number;
  newClientAdhesions: number;
  totalAdhesions: number;
  strictConversion: number;
  penetration: number;
  isReception?: boolean;
}

export function useSubscriptionPerformanceDerived(rawTransactions: TxWithBarberRelation[], rawReceptionTx: ReceptionTx[]) {
  return useMemo(() => {
    const barberMap = new Map<string, {
      name: string;
      unitId: string | null;
      unit: string;
      opportunityPhones: Set<string>;
      convertedPhones: Set<string>;
      regularizedPhones: Set<string>;
      newClientAdhesions: number;
      totalAdhesions: number;
      rawNewAttendances: number;
    }>();

    const globalOpportunityPhones = new Set<string>();
    const globalRegularizedPhones = new Set<string>();
    let globalNewClientAdh = 0;
    let globalTotalAdh = 0;

    rawTransactions.forEach((tx) => {
      if (!tx.barber_id) return;
      const existing = barberMap.get(tx.barber_id) || {
        name: tx.barbers?.name || "Desconhecido",
        unitId: tx.unit_id ?? null,
        unit: tx.barbers?.units?.name || "Sem unidade",
        opportunityPhones: new Set<string>(),
        convertedPhones: new Set<string>(),
        regularizedPhones: new Set<string>(),
        newClientAdhesions: 0,
        totalAdhesions: 0,
        rawNewAttendances: 0,
      };
      const normalizedPhone = normalizePhoneForMetrics(tx.mobile_phone);
      if (tx.is_new_client === true) existing.rawNewAttendances++;
      if (isValidOpportunity(tx) && normalizedPhone) {
        existing.opportunityPhones.add(normalizedPhone);
        globalOpportunityPhones.add(normalizedPhone);
      }
      if (isNewSubscription(tx)) {
        existing.totalAdhesions++;
        globalTotalAdh++;
        if (tx.is_new_client === true) {
          existing.newClientAdhesions++;
          if (normalizedPhone) existing.convertedPhones.add(normalizedPhone);
          globalNewClientAdh++;
        }
      }
      if (tx.item_type === "subscription" && tx.subscription_action === "legacy_import" && normalizedPhone) {
        existing.regularizedPhones.add(normalizedPhone);
        globalRegularizedPhones.add(normalizedPhone);
      }
      barberMap.set(tx.barber_id, existing);
    });

    const performanceData: BarberPerformance[] = Array.from(barberMap.entries()).map(([barberId, data]) => {
      const opp = data.opportunityPhones.size;
      return {
        barberId,
        barberName: data.name,
        unitName: data.unit,
        opportunities: opp,
        rawNewAttendances: data.rawNewAttendances,
        newClientAdhesions: data.newClientAdhesions,
        totalAdhesions: data.totalAdhesions,
        strictConversion: opp > 0 ? (data.newClientAdhesions / opp) * 100 : 0,
        penetration: opp > 0 ? (data.totalAdhesions / opp) * 100 : 0,
      };
    }).sort((a, b) => b.strictConversion - a.strictConversion || b.penetration - a.penetration);

    const receptionPhones = new Set<string>();
    let receptionNewClientAdh = 0;
    let receptionTotalAdh = 0;
    rawReceptionTx.forEach((tx) => {
      const normalizedPhone = normalizePhoneForMetrics(tx.mobile_phone);
      if (tx.item_type === "subscription" && tx.subscription_action === "legacy_import" && normalizedPhone) {
        globalRegularizedPhones.add(normalizedPhone);
      }
      if (isValidOpportunity(tx) && normalizedPhone) {
        receptionPhones.add(normalizedPhone);
        globalOpportunityPhones.add(normalizedPhone);
      }
      if (isNewSubscription(tx)) {
        receptionTotalAdh++;
        globalTotalAdh++;
        if (tx.is_new_client === true) {
          receptionNewClientAdh++;
          globalNewClientAdh++;
        }
      }
    });

    const clientDrilldown = new Map<string, BarberClientDrilldown>();
    for (const [barberId, data] of barberMap.entries()) {
      const phoneNameMap = new Map<string, string>();
      const attendanceCountMap = new Map<string, number>();
      rawTransactions.forEach((tx) => {
        const normalizedPhone = normalizePhoneForMetrics(tx.mobile_phone);
        if (tx.barber_id !== barberId || !normalizedPhone) return;
        const safeName = (tx.client_name || "").trim();
        if (safeName && !phoneNameMap.has(normalizedPhone)) phoneNameMap.set(normalizedPhone, safeName);
        if (tx.is_new_client === true) {
          attendanceCountMap.set(normalizedPhone, (attendanceCountMap.get(normalizedPhone) || 0) + 1);
        }
      });

      const opportunities = Array.from(data.opportunityPhones).sort().map((phone) => ({
        phone,
        name: phoneNameMap.get(phone) || "Cliente sem nome",
        converted: data.convertedPhones.has(phone) || data.regularizedPhones.has(phone) || globalRegularizedPhones.has(phone),
        attendances: attendanceCountMap.get(phone) || 1,
      }));
      clientDrilldown.set(barberId, {
        barberId,
        barberName: data.name,
        unitId: data.unitId,
        unitName: data.unit,
        opportunities,
      });
    }

    const receptionRow = (receptionPhones.size > 0 || receptionTotalAdh > 0)
      ? {
          barberId: "__reception__",
          barberName: "Recepção",
          unitName: "Sem barbeiro atribuído",
          opportunities: receptionPhones.size,
          newClientAdhesions: receptionNewClientAdh,
          totalAdhesions: receptionTotalAdh,
          strictConversion: receptionPhones.size > 0 ? (receptionNewClientAdh / receptionPhones.size) * 100 : 0,
          penetration: receptionPhones.size > 0 ? (receptionTotalAdh / receptionPhones.size) * 100 : 0,
          isReception: true,
        } as BarberPerformance
      : null;

    const allTx = [
      ...rawTransactions.map((t) => ({ ...t, _hasBarber: true })),
      ...rawReceptionTx.map((t) => ({ ...t, _hasBarber: false })),
    ];
    const dataHealth: DataHealth = {
      totalInPeriod: allTx.length,
      txSemUnidade: allTx.filter((t) => !t.unit_id).length,
      novoSemTelefone: allTx.filter((t) => t.is_new_client === true && !normalizePhoneForMetrics(t.mobile_phone || null)).length,
      novaAdesaoSemTelefone: allTx.filter((t) => isNewSubscription(t) && (!t.mobile_phone || t.mobile_phone === "")).length,
      novaAdesaoSemIsNewClient: allTx.filter((t) => isNewSubscription(t) && t.is_new_client !== true).length,
    };

    return {
      performanceData,
      receptionRow,
      globalOpportunities: globalOpportunityPhones.size,
      globalNewClientAdhesions: globalNewClientAdh,
      globalTotalAdhesions: globalTotalAdh,
      clientDrilldown,
      dataHealth,
    };
  }, [rawTransactions, rawReceptionTx]);
}
