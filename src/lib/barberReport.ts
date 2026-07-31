import { supabase } from "@/integrations/supabase/client";

export interface BarberReportItem {
  category: "service" | "product" | "subscription";
  item_name: string;
  qty: number;
  revenue: number;
  commission: number;
}

export interface BarberReportClient {
  client_name: string;
  phone: string | null;
  visits: number;
  revenue: number;
  first_visit: string;
  last_visit: string;
  was_new: boolean;
  items: Array<{ item_name: string; qty: number; revenue: number }>;
}

export interface BarberReportData {
  barber: { id: string; name: string; unit_name: string | null };
  period: { start: string; end: string };
  totals: {
    revenue: number;
    /** Comissão operacional: a RPC já exclui assinaturas. */
    commission: number;
    /** Comissão registrada em assinaturas (apenas auditoria). */
    subscription_commission?: number;
    visits: number;
    unique_clients: number;
    operational_revenue: number;
  };
  by_category: Record<string, { qty: number; revenue: number; commission: number }>;
  service_breakdown: Record<string, { qty: number; revenue: number }>;
  items: BarberReportItem[];
  clients: BarberReportClient[];
  never_sold: Array<{ name: string; kind: "service" | "product"; category: string | null; price: number | null }>;
}

export async function fetchBarberReport(
  barberId: string,
  start: string,
  end: string,
  unitId: string | null
): Promise<BarberReportData> {
  const { data, error } = await supabase.rpc("get_barber_report_range" as never, {
    p_barber_id: barberId,
    p_start: start,
    p_end: end,
    p_unit_id: unitId,
  } as never);
  if (error) throw error;
  return data as unknown as BarberReportData;
}

export const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

export const fmtDateBR = (iso: string) => {
  const [y, m, d] = String(iso).split("-");
  return `${d}/${m}/${y}`;
};

export const maskPhone = (phone: string | null) => {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return phone;
  const local = digits.slice(-9);
  const ddd = digits.length >= 10 ? digits.slice(-11, -9) : "";
  const tail = local.slice(-4);
  return `${ddd ? `(${ddd}) ` : ""}${local.slice(0, 1)}****-${tail}`;
};

export const CATEGORY_LABEL: Record<string, string> = {
  service: "Serviços",
  product: "Produtos",
  subscription: "Assinaturas",
};
