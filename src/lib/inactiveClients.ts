import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/currency";

export type InactiveBucket = "30_59" | "60_89" | "90_plus";

export interface InactiveClientRow {
  mobile_phone: string;
  client_name: string;
  is_subscriber: boolean;
  last_visit: string;
  previous_visit: string | null;
  days_inactive: number;
  bucket: InactiveBucket;
  last_barber_name: string | null;
  last_unit_name: string | null;
  visits: number;
  total_spent: number;
}

export const BUCKET_LABEL: Record<InactiveBucket, string> = {
  "30_59": "Inativos 30 a 59 dias",
  "60_89": "Inativos 60 a 89 dias",
  "90_plus": "Inativos 90 dias ou mais",
};

export const BUCKET_ORDER: InactiveBucket[] = ["30_59", "60_89", "90_plus"];

/** Mantido como nome local; a formatação vive em @/lib/currency. */
export const fmtBRL = brl;

export const fmtDateBR = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
};

export const maskPhone = (phone?: string | null) => {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
};

export async function fetchInactiveClients(params: {
  unitId: string | null;
  barberId: string | null;
  refDate: string;
}): Promise<InactiveClientRow[]> {
  const { data, error } = await supabase.rpc("get_inactive_clients", {
    p_unit_id: params.unitId,
    p_barber_id: params.barberId,
    p_ref_date: params.refDate,
  });
  if (error) throw error;
  return ((data as unknown as InactiveClientRow[]) || []).map((r) => ({
    ...r,
    total_spent: Number(r.total_spent || 0),
    visits: Number(r.visits || 0),
    days_inactive: Number(r.days_inactive || 0),
  }));
}

export function groupByBucket(rows: InactiveClientRow[]): Record<InactiveBucket, InactiveClientRow[]> {
  const out: Record<InactiveBucket, InactiveClientRow[]> = { "30_59": [], "60_89": [], "90_plus": [] };
  for (const r of rows) {
    if (out[r.bucket]) out[r.bucket].push(r);
  }
  for (const key of BUCKET_ORDER) {
    out[key].sort((a, b) => b.total_spent - a.total_spent);
  }
  return out;
}

export function buildInactiveClientsCsv(rows: InactiveClientRow[]): string {
  const header = [
    "Faixa",
    "Cliente",
    "Telefone",
    "Tipo",
    "Ultima visita",
    "Dias inativo",
    "Visita anterior",
    "Ultimo barbeiro",
    "Ultima unidade",
    "Visitas",
    "Total gasto",
  ];
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      BUCKET_LABEL[r.bucket],
      r.client_name,
      r.mobile_phone,
      r.is_subscriber ? "Assinante" : "Avulso",
      fmtDateBR(r.last_visit),
      r.days_inactive,
      fmtDateBR(r.previous_visit),
      r.last_barber_name || "Recepção",
      r.last_unit_name || "—",
      r.visits,
      Number(r.total_spent || 0).toFixed(2).replace(".", ","),
    ]
      .map(esc)
      .join(";")
  );
  return [header.map(esc).join(";"), ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
