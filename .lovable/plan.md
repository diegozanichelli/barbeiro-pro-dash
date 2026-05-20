## Problema

Na aba **Clientes**, quando uma pílula de filtro está ativa ("Sem telefone", "Nome incompleto" ou "Inadimplentes >30d"), a barra de busca por nome/telefone só procura dentro daquele subconjunto.

Foi isso que aconteceu com o cliente **AUGUSTO FABRICIO BATISTA DOS REIS** (92 99312-1712): ele existe no banco (org Barbearia SGP-B), mas não é inadimplente / tem telefone / tem nome completo, então quando o filtro de qualidade está ativo ele fica invisível para a busca. A tela mostra "Nenhum cliente neste filtro" em vez de localizar o cliente.

## Solução

Quando o usuário digitar algo na busca, a busca por nome/telefone deve **ignorar a pílula de filtro de qualidade** e procurar em todos os clientes da organização. A pílula continua selecionada visualmente, mas com um aviso claro indicando que a busca está sobrescrevendo o filtro.

## Mudanças (frontend apenas)

Arquivo: `src/components/dashboard/manager/ClientsManagement.tsx`

1. Na função `filtered`, aplicar o filtro de qualidade (`no_phone` / `incomplete_name` / `overdue`) **apenas quando `search.trim()` estiver vazio**. Quando há busca, ignorar o filtro e procurar em todos os clientes.

2. Acima da grid, quando houver busca ativa **e** uma pílula de qualidade selecionada, mostrar um banner discreto:
   > "Mostrando resultados em todos os clientes. [Limpar busca] para voltar ao filtro **{nome do filtro}**."

3. Manter os contadores das pílulas calculados sobre o total (já é assim) — não muda nada nos badges.

4. Ajustar a mensagem de empty state para distinguir os dois casos:
   - Busca ativa sem resultados → "Nenhum cliente encontrado para *(termo)*"
   - Filtro ativo sem busca e sem resultados → "Nenhum cliente neste filtro"

## Fora de escopo

- Não mexer em RPC nem RLS.
- Não alterar a lógica de detecção de inadimplência, telefone inválido ou nome incompleto.
- Não mexer no `SubscriptionWizardModal`.
