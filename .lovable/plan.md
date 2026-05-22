## Objetivo
Adicionar 5ª flag **"Sem origem"** na aba Clientes (clientes com `subscription_unit_id` nulo), com inferência automática da unidade baseada no barbeiro mais frequente nas vendas do cliente e opção do gestor sobrescrever.

## 1. Backend (RPC)

Criar RPC `suggest_client_origin_units(p_organization_id uuid)`:
- Para cada cliente da org sem `subscription_unit_id`, varre `sale_transactions` filtrando por `mobile_phone` do cliente.
- Agrupa por `barber_id` → conta ocorrências → pega o barbeiro mais frequente → retorna `barbers.unit_id` correspondente.
- Fallback: se cliente não tem nenhuma venda com barbeiro, usa `unit_id` da venda mais recente (qualquer fonte). Se nem isso existir, retorna `null` (não sugere).
- Retorna `TABLE(client_id uuid, suggested_unit_id uuid, suggested_unit_name text, confidence_count int, basis text)` onde `basis` é `'barber_frequency'` ou `'last_sale'`.

Criar RPC `apply_auto_origin_units(p_organization_id uuid)`:
- Chama a anterior internamente e faz `UPDATE clients SET subscription_unit_id = suggested_unit_id` apenas onde `subscription_unit_id IS NULL` e `suggested_unit_id IS NOT NULL`.
- Retorna `{ updated_count int, skipped_count int }`.
- Marcada `SECURITY DEFINER` com check `has_role(auth.uid(), 'manager')` + isolamento por `organization_id`.

## 2. Frontend — `ClientsManagement.tsx`

### Novo filtro
- Adicionar `"no_origin"` ao tipo `FilterKey`.
- Função `hasNoOrigin(c) = !c.subscription_unit_id`.
- Contador no `counts` + botão na barra de filtros com ícone `MapPinOff` (cor neutra, sem `alert`).
- Incluir `subscription_unit_id` já está no select (`select`). OK.

### Sugestão por card
- Ao montar lista (uma vez por carga), chamar `suggest_client_origin_units` e guardar `Map<client_id, {unit_id, unit_name, basis}>`.
- No card do cliente, quando `hasNoOrigin(c)` e existe sugestão: badge amarelo "Sem origem → sugerido: **{unidade}**" + botão pequeno **"Aplicar"** (chama update single).
- Quando não há sugestão: badge cinza "Sem origem".

### Edição manual (sempre disponível)
- Dropdown novo no card `"Origem ▾"` listando todas as unidades ativas da org + opção "Limpar". Salva direto em `clients.subscription_unit_id`. Aparece para **qualquer** cliente (não só sem-origem), para gestor poder trocar.

### Ação em lote
- Quando filtro `"no_origin"` está ativo, mostrar banner no topo com:
  - "X clientes sem origem · Y com sugestão automática"
  - Botão **"Atribuir origens automaticamente"** → chama `apply_auto_origin_units` → toast com resumo `{updated, skipped}` → `fetchData()`.

## 3. Detalhes técnicos
- Tipos: adicionar `subscription_unit_id`, `subscription_unit_name?` ao `Client` (já tem `subscription_unit_id`).
- Buscar `units` ativos (id, name) no `fetchData` (similar a `plans`).
- Performance: RPC roda no Postgres em uma query (CTE com `ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY count DESC)`).
- Reaproveitar o componente `ClientDetailModal` para também ter o seletor de unidade lá (opcional — versão inicial só no card).
- Nada de migração de dados em massa silenciosa: lote é sempre disparado por clique do gestor.

## 4. Memória
Atualizar `mem://index.md` com referência a `mem://features/client-origin-attribution` documentando: campo `subscription_unit_id`, fonte de inferência (barbeiro mais frequente → unit do barbeiro, fallback última venda), e que a aplicação automática é sempre acionada manualmente pelo gestor.

## Fora de escopo
- Não toca em `barbers.unit_id` nem em vendas históricas.
- Não cria nova tabela — usa coluna existente `clients.subscription_unit_id`.
- Não muda o wizard de assinatura.
