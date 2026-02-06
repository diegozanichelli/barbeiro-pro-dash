
# Plano: Nova Aba "Dicas da IA" no Dashboard do Barbeiro

## Resumo Executivo

Criar uma nova aba dedicada chamada "Dicas da IA" no painel do barbeiro para consolidar todas as funcionalidades de inteligência artificial. Isso vai limpar o painel principal ("Meu Painel") e melhorar significativamente a experiência do usuário.

---

## Situação Atual (Problema)

O painel principal do barbeiro está poluído com múltiplos cards de IA:

```text
┌─────────────────────────────────────────┐
│  "Meu Painel" (atual - poluído)         │
├─────────────────────────────────────────┤
│  [Meta de Produção]                     │
│  [Faturamento Hoje]                     │
│  [AIDailyCoachCard] ← POLUIÇÃO          │
│  [CoachingNudgeCard] ← POLUIÇÃO         │
│  [SubscriptionEarningsCard]             │
│  [Progresso Mensal]                     │
│  [Métricas]                             │
│  [PDV]                                  │
│                                         │
│  + Botão flutuante SalesHelpModal       │
└─────────────────────────────────────────┘
```

---

## Solução Proposta

Criar uma 4ª aba "Dicas da IA" com todas as funcionalidades agrupadas:

```text
┌─────────────────────────────────────────────────────────┐
│  [Meu Painel] [Histórico] [Rankings] [Dicas da IA]      │
└─────────────────────────────────────────────────────────┘

Nova Aba "Dicas da IA":
┌─────────────────────────────────────────┐
│  🤖 DICA DO COACH                       │
│  ┌───────────────────────────────────┐  │
│  │ AIDailyCoachCard (completo)       │  │
│  │ - Briefing tático personalizado   │  │
│  │ - Botão "Nova dica"               │  │
│  └───────────────────────────────────┘  │
│                                         │
│  💡 DICA DE VENDAS                      │
│  ┌───────────────────────────────────┐  │
│  │ CoachingNudgeCard (completo)      │  │
│  │ - Comparativo com a unidade       │  │
│  │ - Botão "Atualizar dica"          │  │
│  └───────────────────────────────────┘  │
│                                         │
│  🎯 SCRIPTS DE VENDA (Ajuda Rápida)     │
│  ┌───────────────────────────────────┐  │
│  │ Grid de cenários clicáveis:       │  │
│  │ [Cliente achou caro]              │  │
│  │ [Oferecer pomada]                 │  │
│  │ [Mudança de visual]               │  │
│  │ [Cliente com caspa]               │  │
│  │ [Serviço extra]                   │  │
│  │ [Fidelização]                     │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘

"Meu Painel" (limpo):
┌─────────────────────────────────────────┐
│  [Meta de Produção]                     │
│  [Faturamento Hoje]                     │
│  [SubscriptionEarningsCard]             │ ← SEM AI CARDS!
│  [Progresso Mensal]                     │
│  [Métricas]                             │
│  [PDV]                                  │
└─────────────────────────────────────────┘
```

---

## Alterações Técnicas

### Arquivo: `BarberDashboard.tsx`

**1. Adicionar nova aba na TabsList (linha 676-680):**
```tsx
<TabsList className="grid w-full grid-cols-4">
  <TabsTrigger value="daily">Meu Painel</TabsTrigger>
  <TabsTrigger value="history">Histórico</TabsTrigger>
  <TabsTrigger value="leaderboard">Rankings</TabsTrigger>
  <TabsTrigger value="ai-tips">Dicas da IA</TabsTrigger>
</TabsList>
```

**2. Remover do "Meu Painel" (TabsContent value="daily"):**
- Remover `AIDailyCoachCard` (linhas 814-825)
- Remover `CoachingNudgeCard` (linha 828)

**3. Remover botão flutuante `SalesHelpModal` (linha 969):**
- O conteúdo do SalesHelpModal será integrado diretamente na nova aba

**4. Criar novo `TabsContent value="ai-tips"`:**
- Renderizar `AIDailyCoachCard`
- Renderizar `CoachingNudgeCard`
- Criar seção com grid de cenários de venda (reutilizando lógica do SalesHelpModal)

### Novo Componente: `AITipsTab.tsx`

Componente dedicado para organizar o conteúdo da aba:

```text
src/components/dashboard/barber/AITipsTab.tsx
├── Props: barberId, organizationId, barberName, monthlyGoal, stats...
├── Seções:
│   ├── AIDailyCoachCard (existente, reutilizado)
│   ├── CoachingNudgeCard (existente, reutilizado)
│   └── SalesScriptsGrid (novo, baseado no SalesHelpModal)
```

**SalesScriptsGrid** - Grid de cards clicáveis:
- Mostra os 6 cenários como cards (sem modal flutuante)
- Ao clicar, expande inline ou abre dialog para mostrar o script
- Usa a mesma lógica de `SalesHelpModal` para chamar a edge function

---

## Fluxo de Dados

```text
AITipsTab
├── Recebe props do BarberDashboard
├── Renderiza:
│   ├── AIDailyCoachCard
│   │   └── Chama: barber-ai-assistant (type: daily_insight)
│   ├── CoachingNudgeCard
│   │   └── Chama: get-coaching-nudge
│   └── SalesScriptsGrid
│       └── Chama: barber-ai-assistant (type: sales_help)
```

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `BarberDashboard.tsx` | Adicionar 4ª aba, mover AI cards, remover SalesHelpModal |
| Novo: `AITipsTab.tsx` | Componente que agrupa todas as dicas de IA |

---

## Considerações de UX

1. **Ícone da Aba**: Usar ícone `Bot` ou `Sparkles` para identificar claramente a aba de IA

2. **Badge de Notificação** (opcional): Se houver nova dica disponível, mostrar um ponto de notificação na aba

3. **Mensagem Vazia**: Se o barbeiro não tiver meta cadastrada, mostrar mensagem orientando a solicitar ao gerente

4. **Responsividade**: Grid de scripts deve funcionar bem em mobile (1 coluna) e desktop (2-3 colunas)

---

## Benefícios

- **Painel Limpo**: Meu Painel focado apenas em métricas e lançamentos
- **Descobrimento**: Usuário pode explorar todas as ferramentas de IA em um só lugar
- **Performance**: Componentes de IA só carregam quando a aba é acessada
- **Escalabilidade**: Facilita adicionar novas funcionalidades de IA no futuro
