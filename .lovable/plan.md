## Objetivo

Transformar o **Plano de Guerra** (gerado no `WarPlanWizard` ao abrir o app do barbeiro) de um texto genérico baseado só em "quantos clientes na agenda + serviços confiantes" para um **briefing executivo personalizado**, lendo os dados reais daquele barbeiro: histórico de vendas, ticket médio, mix de serviços/produtos/extras, assinaturas vendidas, clientes novos, padrão por dia da semana e progresso na meta mensal.

## O que muda hoje vs. depois

**Hoje (`WarPlanWizard.generatePlan`):**
- Só usa: nº clientes na agenda + serviços marcados + meta diária.
- Gera texto fixo no frontend, sem ler nada do banco.
- Ignora produtos, extras, assinaturas, novos clientes, histórico, ticket real.

**Depois:**
- Backend (edge function) lê dados reais do barbeiro nos últimos 14–30 dias.
- IA monta um plano com 5 blocos: Diagnóstico, Meta do Dia, Top Armas, Pontos Cegos, Missão Tática.
- Frontend continua simples: usuário só informa "quantos clientes na agenda hoje" (1 input). O resto vem do banco.

## Blocos do novo plano

```text
🎯 META DO DIA
- Falta R$ X para meta diária / Y% da meta mensal
- Sequência atual: Z dias batendo / abaixo da meta

📊 SEU PERFIL (últimos 14 dias)
- Ticket médio: R$ X (vs R$ Y da loja)
- Conversão de produto: X% dos clientes
- Conversão de extras: X% dos clientes
- Assinaturas vendidas no mês: X
- Clientes novos no mês: X

🔥 TOP ARMAS (o que MAIS vende pra você)
- Top 3 serviços e top 3 produtos do barbeiro nos últimos 14d
- Receita estimada se replicar com N clientes de hoje

⚠️ PONTOS CEGOS (oportunidades perdidas)
- Serviços do catálogo que ele NUNCA vende
- Produtos com 0 vendas no mês
- Dia da semana com pior desempenho (se for hoje, alerta)

⚔️ MISSÃO TÁTICA DE HOJE
- "Para bater a meta com N clientes na agenda, você precisa
   de ticket médio R$ X. Sua média atual é R$ Y. Estratégia:
   oferecer [serviço top] + [produto top] em pelo menos
   K atendimentos."
- 1 meta de produto + 1 meta de extra + 1 meta de assinatura
```

## Mudanças técnicas

### 1. Edge function `barber-ai-assistant`
Adicionar novo tipo de request `war_plan` ao lado de `daily_insight` e `sales_help`:

```ts
interface WarPlanRequest {
  type: 'war_plan';
  barberId: string;
  organizationId: string;
  barberName: string;
  monthlyGoal: number;
  soldThisMonth: number;
  dailyTarget: number;
  todayRevenue: number;
  daysRemaining: number;
  clientsInAgenda: number;
}
```

Handler novo `buildWarPlan()` que:
- Reusa `fetchHistoricalStats` (já existe no arquivo, retorna top serviço/produto, conversão de produto, extras ratio, dayOfWeekSales, etc.).
- Adiciona consulta nova:
  - `sale_transactions` últimos 14d filtrando `barber_id = X` para top 3 serviços, top 3 produtos, contagem de `item_type = 'subscription'` no mês, contagem de `is_new_client = true` no mês.
  - `catalog_services` e `catalog_products` da org para detectar itens com **zero vendas** do barbeiro no período (pontos cegos).
  - Média de ticket da loja (mesma org, últimos 14d) para comparativo.
- Monta prompt rico com TODOS esses números e chama Lovable AI Gateway (`google/gemini-2.5-flash`) para gerar o texto final no formato dos 5 blocos. Se a IA falhar, fallback determinístico monta os mesmos blocos com template (sem "achismo").
- Salva `coach_message` em `daily_productions` do dia (mesma coluna já usada) com cache de 4h, igual ao `daily_insight`.

### 2. `WarPlanWizard.tsx`
Simplifica para 2 passos:
- **Passo 1:** input "Quantos clientes na agenda hoje?" (mantém).
- **Passo 2:** loading + chama edge function `barber-ai-assistant` com `type: 'war_plan'`. Mostra o plano retornado dentro de Card, e botão "Fechar e ver no painel".
- Remove o passo "selecionar serviços confiantes" (a IA decide pelos dados reais).

### 3. `BarberDashboard.tsx`
- Passa `soldThisMonth`, `dailyTarget`, `todayRevenue`, `daysRemaining`, `monthlyGoal`, `barberName`, `barberId`, `organizationId` para `WarPlanWizard` (a maioria já é calculada — só plumbing).
- `handleWarPlanComplete` continua salvando o texto em `daily_productions.coach_message` (já é o que acontece via cache da edge function).

### 4. Nada de schema novo
Tudo é leitura. Já temos: `sale_transactions` (com `is_new_client`, `item_type`, `subscription_plan_id`), `daily_productions`, `monthly_goals`, `catalog_services/products`. Sem migration.

## Arquivos afetados
- `supabase/functions/barber-ai-assistant/index.ts` (adicionar handler `war_plan`)
- `src/components/dashboard/barber/WarPlanWizard.tsx` (simplifica wizard, chama edge function)
- `src/components/dashboard/BarberDashboard.tsx` (passa props extras)

## O que mantém
- `WarPlanCard` (renderização) — sem mudança, só recebe texto mais rico.
- Lógica de "balanço do dia" pós-23h — sem mudança.
- Cache de 4h em `daily_productions.coach_message` — reusa.

Confirma que sigo por aí?