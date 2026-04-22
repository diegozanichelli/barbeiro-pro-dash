

# Gap de Arquitetura: vender assinatura para cliente "Da Casa"

## Diagnóstico

Quando consolidamos os botões do Ao Vivo e fizemos o `QuickSaleModal` ser o ponto de entrada único, **deixamos um caso real de fora**: o gestor identifica um cliente "Da Casa" (avulso recorrente) e quer **convertê-lo em assinante na hora**, junto ou não com um corte/produto.

### Por que não funciona hoje

No Step 1 do `QuickSaleModal`, o "Tipo de Cliente" tem 3 opções:

| Tipo | Significado atual | Permite criar assinatura? |
|---|---|---|
| **Novo** | Primeiro atendimento | ❌ Não |
| **Da Casa** | Avulso, sem plano | ❌ Não |
| **Assinante** | **Já tem** um plano ativo | ❌ Não — só aplica desconto |

No Step 2, o catálogo só mostra **Serviços** e **Produtos** (`activeTab: "services" | "products" | "manual"`). Não existe aba/cartão para adicionar **Plano de Assinatura** ao carrinho. A criação de transação `item_type='subscription'` com `subscription_action='new'` só acontece no `SubscriptionWizardModal`, que tiramos do header.

**Resultado prático:** o caminho do "cliente Da Casa que aceitou assinar" foi quebrado. Hoje o gestor teria que:
1. Salvar o corte como "Da Casa".
2. Reabrir o modal, marcar "Assinante", escolher o plano… mas isso só presume que ele já é — não cria a adesão (`subscription_action='new'`).
3. Não há caminho 100% funcional sem voltar ao `SubscriptionWizardModal`.

---

## Proposta — adicionar "Assinatura" como item de carrinho

Tratar **plano de assinatura como um terceiro tipo de item** no Step 2 (ao lado de Serviços e Produtos), igual o `SubscriptionWizardModal` faz internamente, mas dentro do fluxo unificado. O "Tipo de Cliente" deixa de ser pré-requisito para vender assinatura — passa a ser **consequência** do que está no carrinho.

### Mudanças concretas

**1. `QuickSaleModal.tsx` — Step 2: nova aba "Assinatura"**
- Adicionar `"subscription"` em `CategoryTab` → `"services" | "products" | "subscription" | "manual"`.
- Nova aba lista os `subscription_plans` ativos como cards (igual cards de catálogo).
- Ao clicar num plano, adiciona ao carrinho um item especial:
  ```ts
  { type: "subscription", planId, name, customPrice: plan.price, action: "new" | "renew" | "upgrade" | "downgrade" }
  ```
- Ao lado do plano selecionado no carrinho, exibir um pequeno `Select` com a **ação** (`Nova / Renovar / Upgrade / Downgrade`), **pré-selecionado conforme o tipo do cliente**:
  - "Da Casa" ou "Novo" → default `Nova`
  - "Assinante" (já tem plano) → default `Renovar` (ou `Upgrade` se preço maior)
- Se `action === "downgrade"`, abrir input de motivo (mesmo campo que o Wizard já tem).
- Permitir **apenas 1 plano por carrinho** (validação ao adicionar segundo).

**2. `QuickSaleModal.tsx` — Step 1: relaxar a relação Tipo × Assinatura**
- Manter o seletor "Novo / Da Casa / Assinante" como está, mas:
  - Tornar o campo "Plano selecionado" (que aparece em Assinante) **opcional** quando o gestor pretende vender o plano agora.
  - Adicionar dica visual: *"Para criar uma nova assinatura, vá para o próximo passo e adicione o plano no carrinho."*
- Lógica de desconto de serviços inclusos (`getEffectiveItemPrice`) continua igual, mas passa a considerar **também o plano que está no carrinho** (não só o `subscription_plan_id` já vinculado em `clients`).

**3. `handleCartCheckout` — montar transação de assinatura**
- Quando o carrinho contiver um item `type: "subscription"`, adicionar ao array `transactions` um registro com:
  ```ts
  {
    item_type: "subscription",
    item_name: `Assinatura ${planName}`,
    price_sold: plan.price,
    subscription_plan_id: planId,
    subscription_action: actionSelecionada, // 'new' | 'renew' | 'upgrade' | 'downgrade'
    downgrade_reason: action === 'downgrade' ? motivo : null,
    is_new_client: clientType === 'new',
    catalog_service_id: null,
    catalog_product_id: null,
  }
  ```
- Após sucesso da RPC `create_sale_and_ensure_production`, chamar `ensureSubscriptionAssigned` com o `planId` do carrinho (não mais com `selectedSubscriptionPlanId` do Step 1) para vincular `clients.subscription_plan_id`.
- Comissão de assinatura: enviar `commission_rate_used: 0`, `commission_amount: 0` (já é a regra — memória `subscription-commission-rate`).

**4. UX — feedback claro no carrinho**
- Card do plano no carrinho mostra ícone Crown amarelo + badge da ação (`Nova adesão`, `Renovação`, etc).
- Toast final diferenciado: *"Assinatura criada para João — 1 corte + Plano Premium"* quando o carrinho tem mistura.

**5. `SubscriptionWizardModal`**
- Continua existindo, sem mudanças. Vira fallback contextual (ex.: aba Inteligência de Assinaturas), conforme decidido na auditoria UX anterior.

---

## Detalhes Técnicos

**Aba nova no Step 2:**
```tsx
<TabsList>
  <TabsTrigger value="services"><Scissors /> Serviços</TabsTrigger>
  <TabsTrigger value="products"><Package /> Produtos</TabsTrigger>
  <TabsTrigger value="subscription"><Crown /> Assinatura</TabsTrigger>
  <TabsTrigger value="manual"><Hash /> Manual</TabsTrigger>
</TabsList>
```

**Tipagem do CartItem estendida:**
```ts
interface SubscriptionCartItem {
  tempId: string;
  type: "subscription";
  planId: string;
  name: string;
  customPrice: number;
  action: "new" | "renew" | "upgrade" | "downgrade";
  downgradeReason?: string;
}
type AnyCartItem = CartItem | SubscriptionCartItem;
```

**Determinação automática da `action`:**
```ts
function inferAction(clientType: ClientType, currentPlan: Plan | null, newPlan: Plan): SubscriptionAction {
  if (clientType === "new" || clientType === "without_subscription") return "new";
  if (!currentPlan) return "new";
  if (currentPlan.id === newPlan.id) return "renew";
  return newPlan.price >= currentPlan.price ? "upgrade" : "downgrade";
}
```

**Sem mudanças de banco** — a tabela `sale_transactions` já suporta `item_type='subscription'` + `subscription_action` + `subscription_plan_id`.

---

## Impacto

| Antes | Depois |
|---|---|
| Cliente "Da Casa" não vira assinante no fluxo principal | Assinatura é item de carrinho, qualquer tipo de cliente pode aderir |
| Mistura corte + adesão exige 2 modais | Carrinho único: corte + plano numa só transação |
| `subscription_action` só nasce no Wizard | Nasce no `QuickSaleModal` com regra explícita |

---

## Plano de execução

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `QuickSaleModal.tsx` | Estender `CategoryTab` e `CartItem` para suportar tipo `subscription` |
| 2 | `QuickSaleModal.tsx` | Nova aba "Assinatura" no Step 2 listando `subscription_plans` |
| 3 | `QuickSaleModal.tsx` | Seletor de ação (Nova/Renovar/Upgrade/Downgrade) por item do carrinho + motivo do downgrade |
| 4 | `QuickSaleModal.tsx` | `handleCartCheckout` monta transação `item_type='subscription'` e atualiza `clients.subscription_plan_id` ao final |
| 5 | `QuickSaleModal.tsx` | `getEffectiveItemPrice` considera plano no carrinho para zerar serviços inclusos |
| 6 | `QuickSaleModal.tsx` | Texto de ajuda no Step 1 indicando como aderir um plano |

Sem migração de banco. Apenas frontend. Estimativa: 1 sessão de implementação.

