## Objetivo

Criar um relatório individual por barbeiro, com intervalo de datas livre, exportável em PDF, mostrando o que ele mais e menos vende (separado por serviço, produto e assinatura) e a lista completa de clientes com o que cada um consumiu.

## Onde fica

Novo item no menu **Relatórios** do gestor: **"Relatório do Barbeiro"**.

Filtros no topo:
- Unidade (opcional)
- Barbeiro (obrigatório, combobox já existente)
- Data inicial e data final (intervalo livre, fuso Manaus)
- Botões: **Gerar relatório** e **Exportar PDF**

O relatório aparece primeiro na tela (preview) e o PDF é a mesma estrutura.

## Conteúdo do relatório

1. **Cabeçalho** — nome do barbeiro, unidade(s), período (dd/mm/aaaa a dd/mm/aaaa), data de emissão.
2. **Resumo geral** — faturamento total, comissão, nº de atendimentos (comandas), nº de clientes únicos, ticket médio.
3. **Quebra por categoria** — três blocos separados com faturamento, quantidade e ticket médio de cada:
   - Serviços básicos/extras
   - Produtos
   - Assinaturas (mantidas separadas do operacional, como já é a regra do sistema)
4. **O que mais vende / o que menos vende** — por categoria (serviço, produto, assinatura), lista **completa** de itens do período ordenada por faturamento, com quantidade, faturamento e % do total da categoria. Os 3 primeiros ficam destacados como "mais vendidos" e os 3 últimos como "menos vendidos".
5. **Itens do catálogo que ele nunca vendeu no período** — lista de oportunidades perdidas (itens ativos do catálogo sem nenhuma venda dele).
6. **Clientes** — lista **completa** de clientes do período, ordenada por valor gasto, com: nome, telefone (mascarado), nº de visitas, valor total e **o que consumiu** (itens agrupados com quantidade). Destaque para o Top 10.
7. **Rodapé** — numeração de páginas e observação de que assinaturas não entram na meta operacional.

## Detalhes técnicos

- **Dados**: nova RPC `get_barber_report_range(p_barber_id, p_start, p_end, p_unit_id)` retornando JSON com: totais, quebra por `item_type`/`service_category`, agregação por `item_name` e agregação por cliente (`mobile_phone` + itens consumidos). Agregação feita no banco para não bater no limite de 1000 linhas do PostgREST.
- Nomes de clientes: usar a tabela `clients` como fonte do nome (os nomes em `sale_transactions` são efêmeros/limpos após 30 dias); fallback para "Cliente sem cadastro" quando não houver telefone.
- **PDF**: gerar com `jspdf` + `jspdf-autotable` (novas dependências), diretamente no navegador — tabelas paginam sozinhas, acentuação correta, e o arquivo sai como `relatorio-<barbeiro>-<inicio>-a-<fim>.pdf`. Não usa impressão do navegador.
- Componentes novos: `src/components/dashboard/manager/BarberReportPage.tsx` (filtros + preview) e `src/lib/barberReportPdf.ts` (montagem do PDF).
- Registrar a nova rota/aba em `ManagerNavigation.tsx` dentro do grupo **Relatórios**.
- Textos e formatação em pt-BR, valores em BRL, datas em fuso Manaus.
