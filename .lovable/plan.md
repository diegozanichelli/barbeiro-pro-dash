## Objetivo

Eliminar a confusão entre **tipo de aquisição** (novo vs recorrente) e **estado de assinatura** (assinante ativo). A condição "assinante" passa a ser **derivada automaticamente** do telefone do cliente e exibida apenas como informação visual, sem corromper a métrica de Novo Cliente.

## O que muda na experiência do gestor

### Antes
Toggle com 3 opções: `Novo` / `Da Casa` / `Assinante`. O gestor podia (errado) marcar "Assinante" para um cliente novo que estava aderindo um plano — e ele sumia da métrica de novos.

### Depois
- Toggle com **2 opções**: `Novo Cliente` / `Da Casa`.
- O sistema preenche automaticamente baseado no telefone:
  - Telefone **encontrado** na base → `Da Casa`
  - Telefone **não encontrado** → `Novo Cliente`
- Se o cliente identificado tem assinatura ativa, aparece um **badge dourado "✨ Assinante Ativo"** ao lado do badge de identificação, **sem trocar a categoria**.
- Mesmo que um cliente Novo adicione um plano de assinatura no carrinho, ele continua contado como Novo Cliente na métrica de aquisição.

## Mudanças técnicas

Arquivo único: `src/components/dashboard/manager/QuickSaleModal.tsx`

### 1. Tipo binário
- Substituir `type ClientType = "new" | "without_subscription" | "with_subscription"` por `type ClientType = "new" | "returning"`.
- Atualizar `inferSubscriptionAction` para receber `hasActiveSubscription: boolean` (derivado de `cyclePlanId`) em vez de `clientType`. Lógica nova: se não há plano ativo → `"new"`; se há e é o mesmo → `"renew"`; senão `upgrade`/`downgrade` por preço.

### 2. Detecção automática (já existe — só simplificar)
- `useClientHistory` já distingue `phone_found` / `name_found` / `not_found`. Mapear:
  - `phone_found` ou `name_found` → `setClientType("returning")`
  - `not_found` → `setClientType("new")`
- Remover `manualOverride` para tipo (a binária é determinística pelo lookup; deixar override só em caso extremo, ou remover de vez — recomendo **remover** para garantir integridade da métrica).
- `useSubscriptionCycle` já retorna `cyclePlanId` / `cyclePlanName`. Derivar `isActiveSubscriber = !!cyclePlanId && !loadingCycle`. Esse boolean **não** influencia `clientType`.

### 3. UI
- Remover o `<ToggleGroupItem value="with_subscription">` (botão Assinante) e o bloco de seleção de plano que aparecia abaixo dele (linhas ~1804-1856). O plano atual passa a ser apenas exibido como info ao lado do nome.
- Adicionar badge `✨ Assinante Ativo: <plano>` em `renderClientBadge()` (ou na linha do nome) quando `isActiveSubscriber === true`. Cor âmbar/dourado, sem ação clicável.
- Atualizar copy do hint: "Quer aderir um plano agora? Vá ao próximo passo e adicione a Assinatura no carrinho." (mantido para `returning` sem plano e para `new`).

### 4. Submit / RPC
- `is_new_client` no payload: `clientType === "new"` (já é assim — só fica explícito como única fonte de verdade).
- `ensureSubscriptionAssigned`: continuar atualizando `clients.subscription_plan_id` apenas quando há `subscriptionInCart` (assinatura sendo vendida nessa venda). Remover o caminho que atualizava baseado em `selectedSubscriptionPlanId` quando o gestor marcava "Assinante" manualmente.
- `inferSubscriptionAction` em `handleAddSubscriptionToCart`: passar `hasActiveSubscription` derivado do hook em vez de `clientType`.

### 5. Limpezas
- Remover state: `selectedSubscriptionPlanId`, `subscriptionPlanAutoDetected`, `isResolvingSubscription`, `manualOverride` (ou só `manualOverride` do tipo).
- Remover handler `handleClientTypeChange` (vira `setClientType` direto).
- Remover `useEffect` em ~801-815 que setava `with_subscription` baseado em `cyclePlanId` — agora só guardamos o boolean para o badge.
- Atualizar `canProceedStep1` removendo `hasSubscriptionResolved` (não há mais seleção bloqueante de plano no Step 1).
- Remover ícone `Crown` do import se não for mais usado.

### 6. Memória de projeto
- Atualizar `mem://features/global-client-type-classification` para refletir a nova classificação binária.
- Adicionar nota: "Status de assinante é derivado automaticamente — nunca selecionado manualmente."

## Resultado esperado

- Métrica de "Novos Clientes" volta a ser confiável (cliente novo que assinou continua sendo contado).
- Menos cliques por venda (1 escolha a menos).
- Badge dourado deixa claro quando o atendimento é de um assinante, sem misturar conceitos.
- O fluxo de **vender uma assinatura** continua igual: aba Assinatura → escolher plano → adicionar ao carrinho. A `subscription_action` (`new`/`renew`/`upgrade`/`downgrade`) é calculada corretamente a partir do plano atual detectado.
