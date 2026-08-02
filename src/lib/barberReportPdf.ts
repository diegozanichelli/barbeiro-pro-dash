import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarberReportData,
  CATEGORY_LABEL,
  fmtBRL,
  fmtDateBR,
  groupReportItems,
  maskPhone,
  sumGroup,
} from "@/lib/barberReport";

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

export function generateBarberReportPdf(data: BarberReportData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  const periodLabel = `${fmtDateBR(data.period.start)} a ${fmtDateBR(data.period.end)}`;

  // ---------- Cabeçalho ----------
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageWidth, 88, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.barber?.name || "Barbeiro", margin, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...ACCENT);
  doc.text("RELATÓRIO INDIVIDUAL DE DESEMPENHO", margin, 54);
  doc.setTextColor(220, 220, 220);
  doc.text(
    `Unidade: ${data.barber?.unit_name || "—"}   |   Período: ${periodLabel}`,
    margin,
    70
  );
  doc.text(
    `Emitido em ${new Date().toLocaleDateString("pt-BR")}`,
    pageWidth - margin,
    70,
    { align: "right" }
  );

  const t = data.totals;
  const ticket = t.visits > 0 ? t.revenue / t.visits : 0;
  const subsQty = Number(data.by_category?.subscription?.qty || 0);
  // A RPC já devolve totals.commission sem assinaturas (regra aplicada na origem).
  const commissionNoSubs = Number(t.commission || 0);

  // ---------- Resumo ----------
  autoTable(doc, {
    startY: 108,
    head: [["Resumo do período", ""]],
    body: [
      ["Faturamento Total", fmtBRL(t.revenue)],
      ["Avulsos (faturamento sem assinaturas)", fmtBRL(t.operational_revenue)],
      ["Comissão (sem assinaturas)", fmtBRL(commissionNoSubs)],
      ["Assinaturas vendidas (quantidade)", String(subsQty)],
      ["Atendimentos (comandas)", String(t.visits)],
      ["Clientes únicos", String(t.unique_clients)],
      ["Ticket médio por atendimento", fmtBRL(ticket)],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: margin, right: margin },
  });

  // ---------- Quebra por categoria ----------
  const groups = groupReportItems(data.items);
  const gTotals = {
    service: sumGroup(groups.service),
    service_base: sumGroup(groups.service_base),
    product: sumGroup(groups.product),
    subscription: sumGroup(groups.subscription),
  };

  const catRows = (["service", "service_base", "product", "subscription"] as const).map((c) => {
    const row = gTotals[c];
    const share = t.revenue > 0 ? (row.revenue / t.revenue) * 100 : 0;
    return [
      CATEGORY_LABEL[c],
      String(row.qty),
      fmtBRL(row.revenue),
      fmtBRL(row.qty > 0 ? row.revenue / row.qty : 0),
      c === "subscription" ? "—" : fmtBRL(row.commission),
      `${share.toFixed(1)}%`,
    ];
  });

  autoTable(doc, {
    head: [["Categoria", "Qtd", "Faturamento", "Ticket médio", "Comissão", "% do total"]],
    body: catRows,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: PRIMARY, textColor: 255 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  // ---------- Itens por categoria ----------
  (["service", "service_base", "product", "subscription"] as const).forEach((cat) => {
    const items = groups[cat];
    const catTotal = items.reduce((s, i) => s + Number(i.revenue || 0), 0);

    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...PRIMARY);
    doc.text(`${CATEGORY_LABEL[cat]} — o que mais e o que menos vendeu`, margin, 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    const subtitle = items.length
      ? `${items.length} itens diferentes • ${fmtBRL(catTotal)} no período`
      : "Nenhuma venda desta categoria no período.";
    doc.text(
      cat === "service"
        ? `${subtitle} (exclui corte, barba e pezinho)`
        : cat === "service_base"
        ? `${subtitle} (corte, barba e pezinho)`
        : subtitle,
      margin,
      64
    );

    if (!items.length) return;

    const top = items.slice(0, 3).map((i) => i.item_name);
    const bottom = items.slice(-3).map((i) => i.item_name);

    // Top 3 em destaque
    autoTable(doc, {
      startY: 80,
      head: [["Top 3 do período", "Qtd", "Faturamento"]],
      body: items.slice(0, 3).map((i, idx) => [`#${idx + 1}  ${i.item_name}`, String(i.qty), fmtBRL(i.revenue)]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: ACCENT, textColor: 20, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right", fontStyle: "bold" } },
      margin: { left: margin, right: margin },
    });

    autoTable(doc, {
      head: [["#", "Item", "Qtd", "Faturamento", "Ticket médio", "% da categoria", "Destaque"]],
      body: items.map((i, idx) => [
        String(idx + 1),
        i.item_name,
        String(i.qty),
        fmtBRL(i.revenue),
        fmtBRL(i.qty > 0 ? i.revenue / i.qty : 0),
        catTotal > 0 ? `${((i.revenue / catTotal) * 100).toFixed(1)}%` : "0.0%",
        top.includes(i.item_name)
          ? "Top 3"
          : bottom.includes(i.item_name)
          ? "Menos vendido"
          : "",
      ]),
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: PRIMARY, textColor: 255 },
      columnStyles: {
        0: { halign: "right", cellWidth: 24 },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      didParseCell: (hook) => {
        if (hook.section === "body" && hook.column.index === 6) {
          const text = String(hook.cell.raw || "");
          if (text === "Top 3") hook.cell.styles.textColor = [22, 130, 62];
          if (text === "Menos vendido") hook.cell.styles.textColor = [178, 40, 40];
        }
      },
      margin: { left: margin, right: margin },
    });
  });

  // ---------- Nunca vendidos ----------
  if (data.never_sold?.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...PRIMARY);
    doc.text("Itens do catálogo que ele não vendeu no período", margin, 48);
    autoTable(doc, {
      startY: 64,
      head: [["Item", "Tipo", "Categoria", "Preço padrão"]],
      body: data.never_sold.map((n) => [
        n.name,
        n.kind === "service" ? "Serviço" : "Produto",
        n.category === "extra" ? "Extra" : n.category === "basic" ? "Básico" : "—",
        n.price != null ? fmtBRL(Number(n.price)) : "—",
      ]),
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: PRIMARY, textColor: 255 },
      columnStyles: { 3: { halign: "right" } },
      margin: { left: margin, right: margin },
    });
  }

  // ---------- Clientes ----------
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PRIMARY);
  doc.text("Clientes atendidos no período", margin, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `${data.clients?.length || 0} clientes • ordenados por valor gasto (os 10 primeiros são os melhores clientes)`,
    margin,
    64
  );

  autoTable(doc, {
    startY: 80,
    head: [["#", "Cliente", "Telefone", "Visitas", "Total gasto", "O que consumiu"]],
    body: (data.clients || []).map((c, idx) => [
      String(idx + 1),
      c.client_name,
      maskPhone(c.phone),
      String(c.visits),
      fmtBRL(c.revenue),
      (c.items || []).map((i) => `${i.qty}x ${i.item_name}`).join(", "),
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 4, valign: "top" },
    headStyles: { fillColor: PRIMARY, textColor: 255 },
    columnStyles: {
      0: { halign: "right", cellWidth: 24 },
      1: { cellWidth: 100 },
      2: { cellWidth: 80 },
      3: { halign: "right", cellWidth: 40 },
      4: { halign: "right", cellWidth: 62 },
      5: { cellWidth: "auto" },
    },
    didParseCell: (hook) => {
      if (hook.section === "body" && hook.row.index < 10) {
        hook.cell.styles.fontStyle = hook.column.index === 1 ? "bold" : "normal";
      }
    },
    margin: { left: margin, right: margin },
  });

  // ---------- Rodapé ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(
      "Assinaturas não geram comissão e não compõem a meta operacional: aparecem apenas pela quantidade vendida.",
      margin,
      doc.internal.pageSize.getHeight() - 22
    );
    doc.text(
      `Página ${p} de ${total}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 22,
      { align: "right" }
    );
  }

  doc.save(
    `relatorio-${slug(data.barber?.name || "barbeiro")}-${data.period.start}-a-${data.period.end}.pdf`
  );
}
