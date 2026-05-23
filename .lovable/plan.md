# Origem de cliente: regra "últimos 3 atendimentos" + reanálise diária

## Contexto
Hoje já existe `suggest_client_origin_units` / `apply_auto_origin_units` (botão "Atribuir origens automaticamente" na aba Clientes), mas a lógica usa **frequência geral por barbeiro** (todo o histórico) e só roda quando o gestor clica. Com a importação CSV de clientes novos, queremos a regra **dinâmica baseada nos últimos 3 atendimentos**, recomputada **toda madrugada**.

## Regra de negócio (árvore de decisão)

Para cada cliente, buscar os **últimos 3 atendimentos** (transações `item_type='service'` com `barber_id IS NOT NULL`), ordenados por `created_at DESC`:

1. **3+ atendimentos** → barbeiro majoritário (2 ou 3 ocorrências nas últimas 3). Empate triplo (A,B,C) → desempate pelo mais recente.
2. **2 atendimentos** → mesmo barbeiro nas duas vezes vence; diferentes → desempate pelo mais recente.
3. **1 atendimento** → esse barbeiro.
4. **0 atendimentos** (importado via CSV) → não mexer; manter origem importada (ou `NULL`).

Origem = `barbers.unit_id` do barbeiro escolhido. (Opcional: usar `sale_transactions.unit_id` do atendimento — ver "Decisão pendente".)

A regra **sobrescreve** a origem atual sempre que o cálculo mudar (cliente migrou de barbeiro → migra de unidade), exceto quando não há nenhum atendimento.

## Mudanças

### 1. Banco

- **Substituir** `suggest_client_origin_units(p_organization_id)` por nova versão com a árvore acima. Implementação em SQL puro com CTE:
  - `last3` = `ROW_NUMBER() OVER (PARTITION BY mobile_phone ORDER BY created_at DESC)` ≤ 3, filtrando `item_type='service'`, `barber_id NOT NULL`, `organization_id`.
  - `counts` = agrupa por `(client_id, barber_id)` com `count(*)` e `max(created_at)` dentro do top 3.
  - Vencedor por cliente = `ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY count DESC, max_created_at DESC)` = 1.
  - Resolve `unit_id` via `barbers`.
  - Retorna `client_id, suggested_unit_id, suggested_unit_name, suggested_barber_id, suggested_barber_name, basis ('last3_majority'|'last3_tiebreak_recent'|'single_visit'), recent_visits int`.

- **Nova RPC** `recompute_all_client_origins(p_organization_id uuid)` (SECURITY DEFINER):
  - Para cada cliente da org, calcula vencedor (mesma CTE), faz `UPDATE clients SET subscription_unit_id = winner_unit_id WHERE subscription_unit_id IS DISTINCT FROM winner_unit_id`.
  - **Importante:** só atualiza quando há vencedor (≥1 atendimento). Não toca em clientes 0-atendimentos.
  - Retorna `{ scanned, updated, unchanged, no_history }`.

- **Manter** `apply_auto_origin_units` como wrapper que chama a nova lógica (compatibilidade com o botão atual). Pode internamente delegar para `recompute_all_client_origins` mas restrito a quem está `NULL` se quisermos preservar o comportamento manual antigo — **decisão**: redirecionar para a regra nova (sobrescreve), já que essa é a intenção.

### 2. Cron diário

Habilitar `pg_cron` + `pg_net` (se ainda não estiverem) e criar job que roda às **04:00 Manaus (08:00 UTC)** chamando uma nova Edge Function `recompute-client-origins`:

- A função itera todas as organizações ativas e chama `recompute_all_client_origins(org_id)` via service role.
- Loga sumário em uma nova tabela `client_origin_recompute_logs` (`ran_at, organization_id, scanned, updated, unchanged, no_history, duration_ms, errors jsonb`).
- `verify_jwt = false`, autorizada por header secreto + service role.

Alternativa mais simples (preferida): cron chama diretamente a RPC para cada org via `net.http_post` para PostgREST. Mas como precisamos iterar orgs, **Edge Function é mais limpa**.

### 3. Frontend (`ClientsManagement.tsx`)

- Trocar o texto do botão/banner "Atribuir origens automaticamente" para refletir a nova regra: **"Recalcular origens (últimos 3 atendimentos)"**.
- Pequeno texto auxiliar: "Roda automaticamente toda madrugada. Use aqui para forçar agora."
- Card do cliente: ao mostrar badge de origem sugerida, exibir `basis` em tooltip (ex: "Maioria nos últimos 3 cortes", "Único atendimento", "Empate — último corte").
- Filtro "Sem origem" continua igual (clientes com `subscription_unit_id IS NULL` E sem histórico).

### 4. Memória

Atualizar `mem://features/client-origin-attribution` com:
- Regra dos últimos 3 atendimentos + desempate por recência.
- Cron diário 04:00 Manaus via Edge Function `recompute-client-origins`.
- Sobrescreve origem manual quando histórico mudar (clientes 0-atendimentos preservados).

## Decisões pendentes (preciso confirmar)

1. **Origem = unidade atual do barbeiro** (`barbers.unit_id`) **ou unidade do atendimento** (`sale_transactions.unit_id`)? Sua mensagem cita as duas opções. Recomendo `barbers.unit_id` por consistência (barbeiro itinerante mantém a casa-base), mas confirme.
2. **Sobrescrever origem manual?** Se um gestor editou manualmente a unidade de um cliente, o cron deve respeitar essa escolha ou sobrescrever conforme o histórico? Recomendo **sobrescrever** (regra dinâmica é a fonte da verdade), mas posso adicionar um flag `clients.origin_locked boolean` para travar casos especiais — diga se quer.
3. **Cron diário**: 04:00 Manaus está OK?

## Fora de escopo

- Não muda o wizard de assinatura.
- Não toca em `barbers.unit_id`.
- Não cria UI nova para visualizar logs do cron (pode vir depois se precisar).
