# Corrigir ausência de dados em Março/Abril no gráfico de Evolução da Barbearia

## Diagnóstico

O gráfico mostra valores quase zerados a partir de Março porque o componente `ShopEvolution.tsx` lê os totais apenas dos campos legados/manuais (`services_basic_total`, `services_extra_total`, `products_total`, `services_total`), ignorando os campos `tx_basic_total`, `tx_extra_total` e `tx_products_total`.

A partir de Março, as vendas passaram a ser lançadas majoritariamente pela recepção (`source='manager'`), o que popula os campos `tx_*` na tabela `daily_productions`. Conferi o banco e os números são contundentes:

| Mês | basic (manual) | tx_basic (gestor) | extra (manual) | tx_extra | produtos (manual) | tx_produtos |
|-----|---:|---:|---:|---:|---:|---:|
| Jan | R$ 69.153 | R$ 2.420 | R$ 65.322 | R$ 3.241 | R$ 20.746 | R$ 671 |
| Fev | R$ 100.461 | R$ 110.088 | R$ 68.658 | R$ 99.099 | R$ 20.992 | R$ 39.965 |
| Mar | R$ 6.368 | **R$ 237.613** | R$ 4.729 | **R$ 193.936** | R$ 2.243 | **R$ 92.614** |
| Abr | R$ 3.944 | **R$ 184.296** | R$ 2.934 | **R$ 131.661** | R$ 767 | **R$ 49.852** |

Os relatórios oficiais (`get_manager_report_stats`, `get_organization_rankings`) já aplicam a hierarquia correta: **tx (gestor) > manual (barbeiro) > legacy**. O `ShopEvolution` ficou para trás e por isso "some" com a maior parte do faturamento de Março/Abril.

## Mudança

Atualizar a função `fetchShopEvolutionData` em `src/components/dashboard/manager/ShopEvolution.tsx` para aplicar a mesma hierarquia já usada nas RPCs do gestor, em cada produção diária:

1. Trazer também os campos `tx_basic_total`, `tx_extra_total`, `tx_products_total`, `manual_basic_total`, `manual_extra_total`, `manual_products_total` no `select` da query de `daily_productions`.
2. Para cada produção, escolher a fonte conforme prioridade:
   - Se `tx_basic + tx_extra + tx_products > 0` → usa os campos `tx_*`.
   - Senão, se `manual_basic + manual_extra + manual_products > 0` → usa `manual_*`.
   - Senão, se `services_basic_total` ou `services_extra_total` estão preenchidos → usa eles + `products_total`.
   - Senão, fallback final no `services_total` legado.
3. Aplicar a mesma derivação atual para o "Básico" quando ele vier zerado e existir extras (continua válido só na fonte legada).
4. A receita de assinaturas continua sendo lida de `sale_transactions` (já está correta).

Isso restaura a exibição de Serviços Básicos, Extras, Produtos e Assinaturas em Março e Abril e mantém os meses anteriores idênticos.

## Detalhes técnicos

Arquivo: `src/components/dashboard/manager/ShopEvolution.tsx`

- Atualizar o `select` da query `daily_productions` para incluir os campos `tx_*` e `manual_*`.
- Substituir o trecho atual de agregação (linhas ~139-165) por uma seleção da fonte por linha, espelhando a lógica do `get_organization_rankings`. Pseudo:

```ts
const txTotal = (tx_basic||0) + (tx_extra||0) + (tx_products||0);
const manualTotal = (m_basic||0) + (m_extra||0) + (m_products||0);

let basico, extra, produtos;
if (txTotal > 0) {
  basico = tx_basic; extra = tx_extra; produtos = tx_products;
} else if (manualTotal > 0) {
  basico = m_basic; extra = m_extra; produtos = m_products;
} else if (services_basic_total != null || services_extra_total != null) {
  basico = services_basic_total ?? 0;
  extra = services_extra_total ?? 0;
  // derivação atual de básico quando 0 + extras > 0 continua válida aqui
  produtos = products_total ?? 0;
} else {
  basico = services_total ?? 0; extra = 0; produtos = products_total ?? 0;
}
```

Sem mudanças de banco, sem mudanças nas RPCs e sem impacto nos demais relatórios.
