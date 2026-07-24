## Objetivo
No painel do super admin, permitir definir uma **data de vencimento** para contas que não estão na recorrência automática (Stripe) e desativá-las sozinho quando essa data chegar.

## Mudanças

### 1. Banco de dados (migration)
- Adicionar em `public.organizations`:
  - `access_expires_at date` (nullable) — data limite de acesso quando não há recorrência.
  - `auto_deactivate boolean not null default false` — liga/desliga o desativador para a org.
- Sem alteração no `valid_subscription_status` check (continuamos usando `past_due` como estado desativado, igual ao `revoke-free-access`).

### 2. Edge Function `auto-deactivate-expired` (nova, `verify_jwt = false`)
- Roda com service role.
- `UPDATE organizations SET subscription_status='past_due' WHERE auto_deactivate = true AND access_expires_at IS NOT NULL AND access_expires_at < CURRENT_DATE (America/Manaus) AND subscription_status IN ('active','trial','gratuita')`.
- Retorna quantas foram desativadas.

### 3. Agendamento (pg_cron via `supabase--insert`)
- Job diário às 03:10 Manaus (07:10 UTC) chamando a edge function via `pg_net.http_post` (mesmo padrão do `check-performance-alerts`). Extensões `pg_cron` e `pg_net` já usadas no projeto.

### 4. UI — `SuperAdminDashboard.tsx`
Na tabela de organizações (para contas **sem** `stripe_customer_id` recorrente, i.e. `gratuita`/`trial`/`active` manual):
- Nova coluna **"Vencimento"** mostrando `access_expires_at` (ou "—") + badge "Auto-desativar" quando `auto_deactivate` estiver ligado.
- Novo botão/modal **"Definir vencimento"** com:
  - date picker (`access_expires_at`)
  - switch `auto_deactivate`
  - botão Salvar (update direto na tabela via RLS de super_admin já existente) e botão Remover vencimento.
- Destacar em vermelho quando `access_expires_at` estiver a ≤ 3 dias.

### 5. Segurança
- Update permitido apenas para `super_admin` (política já existente em `organizations`).
- Edge function usa service role e não expõe dados.

## Fora de escopo
- Notificação por e-mail antes do vencimento (pode virar próximo passo).
- Contas com Stripe recorrente ativa continuam sendo controladas pelo webhook do Stripe; o campo de vencimento fica apenas informativo caso o gestor preencha.
