

## Plan: Cancelar Conta pelo Super Admin (com cancelamento Stripe)

### Resumo
Adicionar um botão "Cancelar Conta" no painel Super Admin que cancela a assinatura do cliente no Stripe e atualiza o status da organização para `trial`.

### Alterações

**1. Nova Edge Function: `cancel-organization-subscription`**
- Recebe `organizationId` no body
- Verifica que o chamador é super_admin
- Busca o `stripe_customer_id` da organização
- Se existir, lista as assinaturas ativas no Stripe e cancela todas
- Atualiza `subscription_status` para `"trial"` na tabela `organizations`
- Retorna sucesso/erro

**2. Atualizar `supabase/config.toml`**
- Adicionar entrada `[functions.cancel-organization-subscription]` com `verify_jwt = true`

**3. Atualizar `SuperAdminDashboard.tsx`**
- Adicionar função `handleCancelSubscription(orgId)` que chama a nova edge function
- Adicionar botão "Cancelar Conta" na coluna de ações da tabela de organizações (visível para orgs com status `active`)
- Incluir diálogo de confirmação (AlertDialog) antes de executar o cancelamento
- Atualizar `getStatusBadge` para incluir o mapeamento de `past_due` se necessário

### Fluxo
1. Super admin clica em "Cancelar Conta" na linha da organização
2. AlertDialog pede confirmação: "Isso cancelará a assinatura no Stripe e colocará a conta em modo trial"
3. Ao confirmar, chama a edge function
4. Edge function cancela no Stripe + atualiza DB para `trial`
5. UI atualiza a lista

