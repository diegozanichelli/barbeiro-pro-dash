

# Auditoria UX: "Vender Assinatura" vs "Venda Recepção" no Ao Vivo

## Diagnóstico — onde está a confusão

Hoje o cabeçalho do **Ao Vivo** tem 3 gatilhos de venda que se sobrepõem:

| Botão | Modal | Quando faz sentido | Sobreposição |
|---|---|---|---|
| **+** (linha do barbeiro) | `QuickSaleModal` (modo barbeiro) | Venda atribuída a um profissional específico | — |
| **🟡 Vender Assinatura** | `SubscriptionWizardModal` | Adesão / renovação / upgrade de plano | Pode ser feita pela recepção OU por um barbeiro |
| **🏢 Venda Recepção** | `QuickSaleModal` (modo recepção) | Venda sem atribuição (loja/balcão) | Suporta serviço, produto **e assinatura** internamente |

**Problemas reais:**

1. **Eixos misturados.** "Vender Assinatura" é um **tipo de item**; "Venda Recepção" é uma **forma de atribuição**. O gestor precisa escolher entre eixos diferentes — não é uma escolha apples-to-apples.
2. **Caminho ambíguo para vender uma assinatura na recepção.** O gestor pode (a) clicar "Vender Assinatura" e escolher "Recepção" no Step 2, OU (b) clicar "Venda Recepção" e adicionar uma assinatura no carrinho. Dois caminhos = dúvida + métricas inconsistentes (auditadas no item #3 anterior).
3. **Retrabalho.** Cliente que entra para assinar e leva um produto: o gestor abre o Wizard de Assinatura, finaliza, depois abre Venda Recepção para o produto. Deveria ser um único fluxo.
4. **Visual.** Os dois botões ficam lado a lado com pesos visuais diferentes (dourado vs cinza com borda dourada), reforçando que são "irmãos" quando na verdade são eixos ortogonais.

---

## Proposta — Um único ponto de entrada para vendas sem atribuição

Consolidar em **UM botão principal "Nova Venda"** que abre o `QuickSaleModal` já existente, com a atribuição (Barbeiro/Recepção) como **primeiro passo obrigatório** (já implementado no item #6 anterior). O `SubscriptionWizardModal` vira um **atalho contextual**, não um botão de mesmo peso.

### Layout do header (depois)

```text
[ + Nova Venda ]   [ 👁 Auditar ]
```

- **+ Nova Venda** (primário, destacado): abre `QuickSaleModal` com `attribution = null` — o gestor escolhe Barbeiro ou Recepção no Step 1 e o tipo de item (serviço/produto/assinatura) no Step 2. Fluxo único.
- **👁 Auditar**: mantém como está — entrada para `SubscriptionAuditModal`.
- O botão **+** dentro de cada linha de barbeiro continua igual (atalho rápido com barbeiro pré-selecionado).

### Por que NÃO manter "Vender Assinatura" como botão separado?

- O `QuickSaleModal` já tem suporte completo a assinatura (`selectedSubscriptionPlanId`, `subscription_action`, autodetecção de plano por telefone). 
- O wizard dedicado existe por motivos históricos, mas duplica lógica de identificação de cliente, atribuição e validação.
- **Uma exceção**: a tela de **Performance de Assinaturas** (Evolução) e o botão **+** dentro dela ainda podem manter um atalho "Vender Assinatura" → abre o `QuickSaleModal` com `forceItemType='subscription'` (escopo contextual, não global).

---

## Mudanças concretas

### 1. `LiveDashboard.tsx` — header
- **Remover** o botão "Vender Assinatura" (linhas 814-822).
- **Renomear** "Venda Recepção" → "**Nova Venda**", trocar variant `secondary` por `default`, manter ícone `Plus`.
- Ao clicar, abrir `QuickSaleModal` com `barberId=""`, `barberName=""`, **sem** `mode` (deixar o usuário escolher no Step 1, com Barbeiro/Recepção como `null` inicial).
- Manter o botão **👁 Auditar** ao lado.

### 2. `QuickSaleModal.tsx` — Step 1 de Atribuição
- Quando `attribution === null` (caso do novo "Nova Venda"), o ToggleGroup precisa exibir **lista de barbeiros** + opção "Recepção" — não só o barbeiro pré-selecionado vs Recepção.
- Adicionar um `Select` ou `BarberCombobox` dentro do toggle "Barbeiro" para escolher qual profissional, quando vier sem `barberId`.
- Manter o atalho atual: se aberto a partir do botão **+** de uma linha, vem com barbeiro pré-selecionado e ToggleGroup já em "barber".

### 3. `SubscriptionWizardModal.tsx`
- **Manter** o componente (não remover) — ainda é útil em fluxos contextuais (ex: aba Inteligência de Assinaturas, conversão de cliente).
- **Remover** apenas a entrada via header do Ao Vivo.
- (Opcional, fora deste escopo) Avaliar futuramente se vale aposentar de vez em favor do `QuickSaleModal`.

### 4. Memória
- Atualizar `mem://features/subscription-flow-bridge` e `mem://features/subscription-wizard-attribution-logic` notando que o ponto de entrada principal no Ao Vivo é o `QuickSaleModal` unificado.

---

## Impacto esperado

| Antes | Depois |
|---|---|
| 3 gatilhos no header | 2 (Nova Venda + Auditar) |
| 2 caminhos para vender assinatura sem barbeiro | 1 caminho único |
| Atribuição implícita no nome do botão | Atribuição explícita como Step 1 obrigatório |
| Retrabalho ao misturar assinatura + produto | Carrinho unificado |

Sem mudanças de banco. Apenas frontend.

---

## Antes de implementar — 1 decisão

**Quer que o `SubscriptionWizardModal` continue acessível como atalho em outro lugar (ex: dentro do card "Inteligência de Assinaturas" na aba Evolução), ou pode ser totalmente desativado?**

- **(a)** Manter como atalho contextual na aba Evolução (recomendado — preserva o fluxo guiado para gestores que preferem o wizard passo-a-passo).
- **(b)** Remover de todos os lugares e usar somente o `QuickSaleModal` unificado.
- **(c)** Manter como está em outras abas; mexer só no header do Ao Vivo.

