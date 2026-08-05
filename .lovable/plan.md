# Varredura técnica — correções prioritárias

Fiz uma varredura no código e no banco. O volume atual é de **68.667 vendas** no total e **11.567 só nos últimos 30 dias**, ou seja ~385/dia. Isso muda tudo: qualquer relatório que leia a tabela de vendas sem paginação está sendo **cortado em 1.000 linhas** silenciosamente e mostrando números menores que a realidade.

## 1. Relatórios truncados em 1.000 linhas (crítico)

Já existe o helper de paginação (`fetchAllRows`), mas ele só está aplicado em 7 arquivos. Confirmei estes lugares lendo vendas de um período inteiro **sem** paginação:

| Tela | Impacto |
|---|---|
| Performance de Assinaturas (conversão) | Busca todas as vendas do período sem filtro de tipo → corta em 1.000. É exatamente o relatório de conversão que gerou dúvida antes: "adesões totais" e "oportunidades" podem estar subcontadas. |
| Apresentação Mensal | Mix de receita, clientes novos vs. recorrentes e top vendedores de extras cortam no mês cheio. |
| Comparativo de Unidades | Clientes, novos e assinaturas por unidade cortados. |
| Acompanhamento de Assinaturas | Só lê assinaturas (volume menor), mas sem paginação segue exposto a crescer e quebrar. |

**Correção:** envolver todas essas consultas em `fetchAllRows`, do mesmo jeito que já é feito em Folha de Pagamento e Recepção.

## 2. Fuso horário inconsistente (Manaus)

O padrão do projeto é Manaus (UTC-4), e a maioria das telas já usa `-04:00` explícito nas datas. Mas o **Comparativo de Unidades** monta o intervalo sem o fuso (`data + T00:00:00`), o que é lido como UTC. Resultado: o relatório inclui/exclui 4 horas erradas nas bordas — vendas da noite do último dia ficam de fora e vendas da noite anterior entram.

**Correção:** usar os helpers de data já centralizados (`manausDayStart` / `manausDayEnd`) nessas consultas, eliminando a montagem manual de string.

## 3. Consistência interna

- `Acompanhamento de Assinaturas` monta o fim do mês manualmente (`+ "T23:59:59"`), fora do padrão dos helpers.
- Há uso de `as any` para contornar tipos em consultas de assinatura no relatório de performance — funciona, mas esconde erros de coluna em tempo de compilação.

**Correção:** padronizar para os helpers de data e remover os `as any` onde os tipos gerados já cobrem as colunas.

## Fora de escopo desta rodada (verificado, sem ação necessária)

- **Testes e tipos:** 14 testes passando, checagem de tipos limpa.
- **Avisos do banco:** os 38 avisos do linter são os mesmos já triados antes (funções `SECURITY DEFINER` multi-tenant e extensão em `public`), sem falhas novas.
- **Painel Ao Vivo:** consulta apenas o dia corrente (~385 linhas), abaixo do limite — sem risco atual.
- **Dados soltos:** 313 vendas sem barbeiro (recepção, esperado) e 33 sem unidade (vendas antigas, já exibidas como "Unidade não informada").

## Detalhes técnicos

- Arquivos a alterar: `SubscriptionPerformanceReport.tsx`, `useMonthlyPresentationData.ts`, `UnitsComparison.tsx`, `SubscriptionsTracking.tsx`.
- Padrão de paginação: `fetchAllRows(() => query.range(...))` de `src/lib/supabasePagination.ts`, com a query recriada na factory (o builder do Supabase é mutável).
- Datas: `manausDayStart(iso)` / `manausDayEnd(iso)` de `src/lib/dateUtils.ts`.
- Nenhuma mudança de schema, RPC ou regra de negócio — os números só passam a refletir o conjunto completo de linhas.
