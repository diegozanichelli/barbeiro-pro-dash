import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  InactiveClientRow,
  fmtBRL,
  fmtDateBR,
  groupByBucket,
  maskPhone,
} from "@/lib/inactiveClients";

const PRIMARY: [number, number, number] = [17, 17, 17];
const ACCENT: [number, number, number] = [201, 162, 39];

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function generateInactiveClientsPdf(opts: {
  rows: InactiveClientRow[];
  unitName: string;
  barberName: string;
  refDate: string;
}) {
  const { rows, unitName, barberName, refDate } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 32;

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageWidth, 82, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Clientes Inativos", margin, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...ACCENT);
  doc.text("CLIENTES QUE NAO RETORNAM (30 / 60 / 90 DIAS)", margin, 52);
  doc.setTextColor(220, 220, 220);
  doc.text(`Unidade: ${unitName}   |   Barbeiro: ${barberName}   |   Referência: ${fmtDateBR(refDate)}`, margin, 68);
  doc.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, pageWidth - margin, 68, { align: "right" });

  const grouped = groupByBucket(rows);
  const subs = rows.filter((r) => r.is_subscriber).length;

  autoTable(doc, {
    startY: 100,
    head: [["Faixa", "Clientes", "Assinantes", "Total gasto (histórico)"]],
    body: BUCKET_ORDER.map((b) => {
      const list = grouped[b];
      return [
        BUCKET_LABEL[b],
        String(list.length),
        String(list.filter((r) => r.is_subscriber).length),
        fmtBRL(list.reduce((s, r) => s + r.total_spent, 0)),
      ];
    }).concat([
      [
        "TOTAL",
        String(rows.length),
        String(subs),
        fmtBRL(rows.reduce((s, r) => s + r.total_spent, 0)),
      ],
    ]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: PRIMARY, textColor: 255 },
    margin: { left: margin, right: margin },
  });

  for (const bucket of BUCKET_ORDER) {
    const list = grouped[bucket];
    if (list.length === 0) continue;
    const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 100;
    doc.setFontSize(11);
    doc.setTextColor(...PRIMARY);
    doc.setFont("helvetica", "bold");
    const titleY = lastY + 26;
    doc.text(`${BUCKET_LABEL[bucket]} — ${list.length} clientes`, margin, titleY);

    autoTable(doc, {
      startY: titleY + 8,
      head: [
        [
          "#",
          "Cliente",
          "Telefone",
          "Tipo",
          "Última visita",
          "Dias",
          "Visita anterior",
          "Últ. barbeiro",
          "Últ. unidade",
          "Visitas",
          "Total gasto",
        ],
      ],
      body: list.map((r, idx) => [
        String(idx + 1),
        r.client_name,
        maskPhone(r.mobile_phone),
        r.is_subscriber ? "Assinante" : "Avulso",
        fmtDateBR(r.last_visit),
        String(r.days_inactive),
        fmtDateBR(r.previous_visit),
        r.last_barber_name || "Recepção",
        r.last_unit_name || "—",
        String(r.visits),
        fmtBRL(r.total_spent),
      ]),
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: PRIMARY, textColor: 255 },
      margin: { left: margin, right: margin },
    });
  }

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 120;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(
    "Faixas exclusivas: cada cliente aparece em apenas uma faixa. \"Visita anterior\" é a penúltima vinda do cliente — útil para saber se ele já veio com outro barbeiro.",
    margin,
    Math.min(finalY + 20, doc.internal.pageSize.getHeight() - 20),
    { maxWidth: pageWidth - margin * 2 }
  );

  doc.save(`clientes-inativos-${slug(unitName)}-${slug(barberName)}-${refDate}.pdf`);
}
