/**
 * Helpers para contornar o limite implícito de 1000 linhas do PostgREST.
 *
 * Relatórios que leem tabelas grandes (sale_transactions, daily_productions,
 * monthly_goals) precisam paginar explicitamente, senão os dados são cortados
 * silenciosamente e a tela passa a divergir dos cards agregados por RPC.
 */

const PAGE_SIZE = 1000;

type RangeableQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

/**
 * Executa a query em páginas de 1000 e devolve todas as linhas.
 * A query deve ser recriada a cada chamada (o builder do Supabase é mutável),
 * por isso recebemos uma factory.
 */
export async function fetchAllRows<T>(
  queryFactory: () => RangeableQuery<T>
): Promise<T[]> {
  const rows: T[] = [];
  let page = 0;

  // Trava de segurança: 200 páginas = 200k linhas.
  while (page < 200) {
    const from = page * PAGE_SIZE;
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page++;
  }

  return rows;
}
