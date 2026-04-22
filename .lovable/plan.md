

# Corrigir erro "Could not choose the best candidate function" no PDV

## Diagnóstico

Confirmado via `pg_proc`: existem **duas versões** da RPC `create_sale_and_ensure_production` no banco:

| OID | Assinatura |
|---|---|
| 167956 | `(p_organization_id, p_barber_id, p_date, p_transactions, p_source)` — **5 args, antiga** |
| 201925 | `(p_organization_id, p_barber_id, p_date, p_transactions, p_source, p_unit_id)` — **6 args, atual** |

Quando o frontend chama `supabase.rpc("create_sale_and_ensure_production", { ... })` sem `p_unit_id` (ex.: vendas atribuídas a barbeiro com 1 unidade), o Postgres não consegue decidir entre as duas e devolve `42725 — function is not unique`. **Toda venda do PDV trava** com o tooltip vermelho que apareceu na tela.

A versão antiga ficou órfã de uma migration anterior (provavelmente quando `p_unit_id` foi adicionado, criou-se uma nova função em vez de substituir a antiga via `CREATE OR REPLACE`).

## Solução

Migration única que **remove a versão antiga** (5 args) e mantém apenas a versão canônica (6 args, com `p_unit_id`).

### Migration

```sql
DROP FUNCTION IF EXISTS public.create_sale_and_ensure_production(
  uuid, uuid, date, jsonb, text
);
```

A versão com 6 args (`p_unit_id`) permanece intacta. Ela já tem fallback interno: se `p_unit_id` vier `NULL`, deriva de `barbers.unit_id`; se não houver barbeiro, fica `NULL` (recepção sem unidade).

## Resultado esperado

| Cenário | Antes | Depois |
|---|---|---|
| Venda atribuída a barbeiro (sem `p_unit_id` no payload) | ❌ `function is not unique` | ✅ Resolve `unit_id` via `barbers.unit_id` |
| Venda de recepção com `p_unit_id` | ❌ Mesmo erro | ✅ Grava `unit_id` informado |
| Venda de recepção sem unidade | ❌ Mesmo erro | ✅ Grava `unit_id = NULL` |

## Arquivos afetados

| # | Arquivo | Ação |
|---|---|---|
| 1 | `supabase/migrations/<timestamp>_drop_legacy_create_sale_rpc.sql` | **Nova** — `DROP FUNCTION` da versão de 5 args |

## Impacto / risco

- **Zero impacto** no frontend — nenhum lugar do código chama a versão de 5 args explicitamente; todos os call sites já passam `p_unit_id` (mesmo que `null`).
- **Zero risco de perda de dados** — `DROP FUNCTION` não toca em tabelas.
- **Reversível** — se necessário, a versão antiga pode ser recriada via migration.
- **Resolve o bloqueio total do PDV** que está travando o atendimento agora.

## Prioridade

🔴 **CRÍTICA** — atendentes estão impossibilitados de registrar vendas. Aplicar imediatamente após aprovação.

