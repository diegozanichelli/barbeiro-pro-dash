

# Plano: "Plano de Guerra" — Wizard de Estratégia Diária do Barbeiro

## Resumo

Ao abrir o dashboard, o barbeiro vê uma caixa flutuante perguntando "Vamos montar sua estratégia do dia?". Ao clicar, passa por 2 passos (agenda + serviços confiantes), recebe um plano tático calculado, e ao finalizar é redirecionado para a aba "Dicas da IA" onde o card "Dica do Coach" é substituído pelo "PLANO DE GUERRA" até o fim do dia.

## Arquivos

### 1. Novo: `src/components/dashboard/barber/WarPlanWizard.tsx`
Componente modal/wizard com 3 etapas:

- **Step 1 (Agenda)**: Input numérico "Quantos clientes na agenda hoje?"
- **Step 2 (Skillset)**: Busca `catalog_services` da organização (filtro `is_active = true`). Lista de seleção múltipla com checkboxes: "Em quais serviços você está mais confiante hoje?"
- **Step 3 (Resultado — Plano de Guerra)**: Calcula e exibe o plano tático

**Lógica de cálculo (Step 3)**:
- `gapToGoal = dailyTarget - todayRevenue`
- Dos serviços selecionados, calcula quantos clientes precisam fazer cada serviço para fechar o gap
- Identifica serviços de baixo ticket (< R$30 ou categorias como sobrancelha, depilação) como "estratégia extra"
- Gera texto dinâmico: "Para bater sua meta de R$ [X], foque em oferecer [Serviço] para [N] clientes. Como estratégia extra, adicione [Serviço Baixo Ticket] para aumentar seu ticket médio em [Z]%."

**Persistência**: Salva o plano no `localStorage` com chave `war_plan_YYYY-MM-DD_barberId`. Ao carregar, se existe plano para hoje, não mostra o wizard de novo — vai direto para o plano na aba IA.

### 2. Novo: `src/components/dashboard/barber/WarPlanCard.tsx`
Card visual "PLANO DE GUERRA" com estética motivacional (gradiente, icones de alvo/espada). Mostra o plano gerado. Substitui o `AIDailyCoachCard` na `AITipsTab` quando existe plano para hoje.

### 3. Modificar: `src/components/dashboard/barber/AITipsTab.tsx`
- Receber prop `warPlan` (string | null)
- Se `warPlan` existe, renderizar `WarPlanCard` em vez de `AIDailyCoachCard`

### 4. Modificar: `src/components/dashboard/BarberDashboard.tsx`
- State: `warPlanMessage` (string | null), `showWarPlanWizard` (boolean)
- No `useEffect` inicial, checar localStorage por plano de hoje. Se não existe, setar `showWarPlanWizard = true`
- Renderizar `WarPlanWizard` como dialog flutuante
- Ao finalizar wizard: salvar no localStorage, setar `warPlanMessage`, setar `activeTab = "ai-tips"`
- Passar `warPlan` para `AITipsTab`

### Props necessárias para o Wizard
- `organizationId`, `dailyTarget`, `todayRevenue` (para calcular gap)
- `onComplete(planText: string)` callback
- `open` / `onOpenChange`

## Visual
O card "PLANO DE GUERRA" terá fundo gradiente escuro com bordas douradas/primárias, ícone de alvo, e o texto do plano com formatação destacada (valores em negrito/cor primária).

