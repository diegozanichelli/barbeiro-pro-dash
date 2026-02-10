
# Profissionalizar Modulo de Assinaturas

## Resumo
Criar um catalogo de planos de assinatura, adicionar campos de acao/motivo nas transacoes, uma tela de gestao de planos e atualizar o Wizard de venda para usar dados estruturados.

---

## Etapa 1 -- Banco de Dados

### 1a. Nova tabela `subscription_plans`
- `id` (uuid, PK)
- `organization_id` (uuid, FK para organizations)
- `name` (text) -- Ex: "Plano Gold"
- `price` (numeric) -- Ex: 90.00
- `active` (boolean, default true)
- `created_at`, `updated_at` (timestamps)
- RLS: Gestores podem CRUD na sua organizacao, barbeiros podem SELECT

### 1b. Novas colunas em `sale_transactions`
- `subscription_plan_id` (uuid, nullable, FK para subscription_plans)
- `subscription_action` (text, nullable) -- valores: 'new', 'renew', 'upgrade', 'downgrade'
- `downgrade_reason` (text, nullable)

---

## Etapa 2 -- Tela de Gestao de Planos

Criar componente `SubscriptionPlansManagement.tsx` com:
- Tabela listando planos (Nome, Preco, Ativo)
- Botao "Novo Plano" abrindo modal simples (Nome + Preco)
- Switch para ativar/desativar planos
- Botao de editar cada plano

Adicionar na navegacao:
- No grupo **Gestao** do `ManagerNavigation`, adicionar item "Planos" (visivel apenas se `hasSubscriptionModule`)
- No `ManagerDashboard`, adicionar `TabsContent` para a nova aba "plans"

---

## Etapa 3 -- Atualizar o Wizard (SubscriptionWizardModal)

### Passo 1 -- Tipo de Cliente (expandido)
- Quando o usuario selecionar **"Ja e Cliente"**, exibir 3 sub-opcoes:
  - Renovacao
  - Upgrade
  - Downgrade
- Se **Downgrade** for selecionado, mostrar campo de texto "Motivo do Downgrade"
- Se **"Novo Cliente"**, a acao sera automaticamente `'new'`

### Passo 3 -- Selecao do Plano (substituir input)
- Buscar planos ativos da tabela `subscription_plans`
- Substituir o `Input` de texto por um `Select` com os planos cadastrados
- Ao selecionar um plano, gravar `subscription_plan_id` e `price_sold` automaticamente
- Manter campo "Nome do Cliente"

### Submit -- Gravar novos campos
- Enviar `subscription_plan_id`, `subscription_action` e `downgrade_reason` na transacao

---

## Etapa 4 -- Detalhes Tecnicos

### Migracao SQL
```text
CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
-- Politicas RLS para gestores e barbeiros

ALTER TABLE sale_transactions
  ADD COLUMN subscription_plan_id uuid REFERENCES subscription_plans(id),
  ADD COLUMN subscription_action text,
  ADD COLUMN downgrade_reason text;
```

### Arquivos a criar
- `src/components/dashboard/manager/SubscriptionPlansManagement.tsx` -- CRUD de planos
- `src/components/dashboard/manager/SubscriptionPlanModal.tsx` -- Modal de criar/editar plano

### Arquivos a modificar
- `src/components/dashboard/manager/ManagerNavigation.tsx` -- adicionar item "Planos" no grupo Gestao
- `src/components/dashboard/ManagerDashboard.tsx` -- adicionar TabsContent "plans"
- `src/components/dashboard/manager/SubscriptionWizardModal.tsx` -- logica expandida do wizard
- `src/integrations/supabase/types.ts` -- sera atualizado automaticamente

### Fluxo do Wizard atualizado
```text
Passo 1: Tipo de Cliente
  [Novo Cliente] --> action = 'new'
  [Ja e Cliente] --> mostra sub-opcoes:
    [Renovacao] --> action = 'renew'
    [Upgrade]   --> action = 'upgrade'
    [Downgrade] --> action = 'downgrade' + input motivo

Passo 2: Atribuicao (sem mudancas)

Passo 3: Detalhes
  Select com planos cadastrados (busca subscription_plans)
  Nome do Cliente
  Resumo com acao + plano + preco
```
