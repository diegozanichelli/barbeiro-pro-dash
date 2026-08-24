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

export interface ProductionBreakdown {
  /** Serviços básicos. */
  basic: number;
  /** Serviços extras. */
  extra: number;
  /** Produtos. */
  products: number;
}

/**
 * Quebra a produção do dia em básicos, extras e produtos, na ordem
 * gestor > barbeiro > legado detalhado > services_total.
 *
 * O ramo legado tem uma sutileza: quando só os extras estão preenchidos, o
 * básico é derivado do services_total menos os extras. Somar as duas colunas
 * contaria o mesmo dinheiro duas vezes, porque nos lançamentos antigos o
 * services_total já inclui os extras.
 */
export function productionBreakdown(
  row: ProductionTotalsRow | null | undefined
): ProductionBreakdown {
  if (!row) return { basic: 0, extra: 0, products: 0 };

  const txBasic = num(row.tx_basic_total);
  const txExtra = num(row.tx_extra_total);
  const txProducts = num(row.tx_products_total);
  if (txBasic + txExtra + txProducts > 0) {
    return { basic: txBasic, extra: txExtra, products: txProducts };
  }

  const manualBasic = num(row.manual_basic_total);
  const manualExtra = num(row.manual_extra_total);
  const manualProducts = num(row.manual_products_total);
  if (manualBasic + manualExtra + manualProducts > 0) {
    return { basic: manualBasic, extra: manualExtra, products: manualProducts };
  }

  const legacyBasic = num(row.services_basic_total);
  const legacyExtra = num(row.services_extra_total);
  const legacyProducts = num(row.products_total);
  const legacyServices = num(row.services_total);

  if (row.services_basic_total != null || row.services_extra_total != null) {
    return {
      basic:
        legacyBasic === 0 && legacyExtra > 0
          ? Math.max(0, legacyServices - legacyExtra)
          : legacyBasic,
      extra: legacyExtra,
      products: legacyProducts,
    };
  }

  // Lançamento antigo sem separação por categoria.
  return { basic: legacyServices, extra: 0, products: legacyProducts };
}

/** Faturamento do dia, na ordem gestor > barbeiro > legado. */
export function productionRevenue(row: ProductionTotalsRow | null | undefined): number {
  const { basic, extra, products } = productionBreakdown(row);
  return basic + extra + products;
}

/**
 * O dia já tem lançamento? Uma comanda sem valor (cortesia, por exemplo) também
 * conta: o que importa é se a recepção já registrou movimento naquele dia.
 */
export function productionHasEntries(row: ProductionTotalsRow | null | undefined): boolean {
  if (!row) return false;
  return productionRevenue(row) > 0 || num(row.tx_clients_count) > 0;
}
