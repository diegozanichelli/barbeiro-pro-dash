# Guia do projeto — Performance Barber

App de gestão de barbearia. Vite + React 18 + TypeScript + Tailwind + shadcn/ui +
Recharts + Supabase.

## Regra de dados por barbeiro (obrigatória)

Todo número que o app exibe sobre um barbeiro vem **exclusivamente da base real
daquele barbeiro selecionado**, filtrado por `barber_id` na query. Nunca misture
dados entre barbeiros.

- Toda query de tela do barbeiro (ou de análise por barbeiro) filtra por
  `.eq("barber_id", <id>)`. A exceção legítima é ler um **atributo do cliente**
  (ex.: status de clube em `clients`), que é propriedade do cliente, não venda de
  outro barbeiro — mas os clientes lidos ainda derivam das transações do próprio
  barbeiro.
- **Imagens de referência enviadas pelo usuário valem só como layout / estrutura /
  apresentação.** Os números que aparecem nelas são exemplo visual e **nunca**
  devem virar dado do barbeiro no código (nem hardcode, nem "valor de exemplo" que
  vaze para produção). Se um valor não existe no banco, ele é derivado do próprio
  barbeiro ou vem de um campo que o gestor cadastra — nunca da imagem.
- Metas por frente do Plano de Ação (`monthly_goals.target_*`) são definidas pelo
  gestor, por `(barber_id, month, year)`. Frente sem meta cadastrada aparece como
  "meta a definir" / "peça ao gestor", nunca com um número inventado.

## Convenções úteis

- Formatação de moeda/percentual: `brl`/`pct`/`int` em `src/lib/currency.ts`
  (`Intl.NumberFormat("pt-BR")`; insere U+00A0 entre "R$" e o número).
- Paginação PostgREST (cap de 1000 linhas): `fetchAllRows` em
  `src/lib/supabasePagination.ts`.
- Leitura oficial de produção diária: `productionBreakdown`/`productionRevenue`/
  `productionHasEntries` em `src/lib/productionTotals.ts` (tx_* do gestor > manual_*
  do barbeiro > legado).
- Fuso: America/Manaus (`MANAUS_OFFSET = "-04:00"`); helpers em
  `src/lib/dateUtils.ts`.
- "Atendimento" = comanda = conjunto de itens lançados no mesmo `created_at` dentro
  de uma produção diária.
- Migrações: `supabase/migrations/<YYYYMMDDHHMMSS>_<uuid>.sql`.
