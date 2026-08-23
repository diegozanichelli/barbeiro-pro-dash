/**
 * Hierarquia oficial de leitura da produção diária.
 *
 * O banco grava três conjuntos de colunas em daily_productions:
 *
 * - `tx_*`      — lançamentos do gestor (source = 'manager');
 * - `manual_*`  — lançamentos do barbeiro (source = 'barber');
 * - legado      — `services_basic_total`, `services_extra_total`, `products_total`
 *                 e `services_total`, que a função de sincronização preenche com os
 *                 valores do barbeiro.
 *
 * Como no fluxo atual todo lançamento entra pelo login do gestor, as colunas
 * legadas ficam zeradas e só as `tx_*` têm a verdade. Ler o legado direto faz a
 * tela mostrar zero — foi assim que a Comparação entre Unidades apareceu sem
 * receita e que a trava de confirmação de presença parou de disparar.
 */
export interface ProductionTotalsRow {
  tx_basic_total?: number | null;
  tx_extra_total?: number | null;
  tx_products_total?: number | null;
  tx_clients_count?: number | null;
  manual_basic_total?: number | null;
  manual_extra_total?: number | null;
  manual_products_total?: number | null;
  services_basic_total?: number | null;
  services_extra_total?: number | null;
  products_total?: number | null;
  services_total?: number | null;
}

const num = (v: number | null | undefined) => Number(v) || 0;

/** Faturamento do dia, na ordem gestor > barbeiro > legado. */
export function productionRevenue(row: ProductionTotalsRow | null | undefined): number {
  if (!row) return 0;

  const tx = num(row.tx_basic_total) + num(row.tx_extra_total) + num(row.tx_products_total);
  if (tx > 0) return tx;

  const manual =
    num(row.manual_basic_total) + num(row.manual_extra_total) + num(row.manual_products_total);
  if (manual > 0) return manual;

  return (
    num(row.services_basic_total) +
    num(row.services_extra_total) +
    num(row.products_total) +
    num(row.services_total)
  );
}

/**
 * O dia já tem lançamento? Uma comanda sem valor (cortesia, por exemplo) também
 * conta: o que importa é se a recepção já registrou movimento naquele dia.
 */
export function productionHasEntries(row: ProductionTotalsRow | null | undefined): boolean {
  if (!row) return false;
  return productionRevenue(row) > 0 || num(row.tx_clients_count) > 0;
}
