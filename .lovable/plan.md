
# Plano: Sistema de Cache e Motor de Regras para barber-ai-assistant

## Objetivo
Reduzir **80%+ dos custos de API** implementando:
1. **Cache de 4 horas** no banco de dados
2. **Motor de Regras** com templates gratuitos para cenários comuns
3. **Fallback para IA** apenas quando necessário

---

## Arquitetura da Solução

```text
REQUISIÇÃO DO BARBEIRO
         │
         ▼
┌────────────────────────────────────────┐
│ 1️⃣ VERIFICAR CACHE (4 horas)          │
│    → daily_productions.coach_message   │
│    → daily_productions.last_coach_at   │
└────────────────────────────────────────┘
         │
    Cache Válido?
    ┌────┴────┐
    │ SIM    │ NÃO
    ▼         ▼
  RETORNAR  ┌────────────────────────────┐
  CACHE     │ 2️⃣ MOTOR DE REGRAS        │
  (R$ 0)    │    → Zero Produtos?        │
            │    → Ticket Baixo?         │
            │    → Meta Batida?          │
            │    → Sem Extras?           │
            └────────────────────────────┘
                      │
               Regra Ativada?
               ┌────┴────┐
               │ SIM    │ NÃO
               ▼         ▼
             RETORNAR  ┌────────────────┐
             TEMPLATE  │ 3️⃣ CHAMAR IA  │
             (R$ 0)    │    (Fallback)  │
                       └────────────────┘
                              │
                              ▼
                       SALVAR EM CACHE
                       RETORNAR RESPOSTA
```

---

## Mudanças Necessárias

### 1. Migração do Banco de Dados
Adicionar 2 colunas à tabela `daily_productions`:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `coach_message` | TEXT | A última dica gerada pela IA |
| `last_coach_at` | TIMESTAMPTZ | Quando a dica foi gerada |

```sql
ALTER TABLE daily_productions 
ADD COLUMN IF NOT EXISTS coach_message TEXT,
ADD COLUMN IF NOT EXISTS last_coach_at TIMESTAMPTZ;
```

### 2. Motor de Regras (Templates Gratuitos)
Cenários detectados automaticamente antes de chamar a IA:

| Cenário | Condição | Template |
|---------|----------|----------|
| **Zero Produtos** | `products_count == 0 AND clients > 2` | "Fala [Nome]! O corte está ótimo, mas zerar produtos é deixar dinheiro na mesa. ⚠️ 0 produtos vendidos hoje com X clientes. > 'Doutor, pra manter esse corte impecável em casa, essa pomada é a arma secreta. Passo pra você?' 🚀 Missão: Os próximos 3 clientes saem com produto na mão!" |
| **Ticket Baixo** | `ticket_medio < 50` | "Alerta Vermelho, [Nome]! 📉 Seu ticket está em R$ X, abaixo de R$ 50. Você está vendendo apenas o básico. > 'Irmão, o corte é só o começo. Vamos fazer a barba também? O visual completo tem outro impacto.' 🚀 Missão: Ofereça Barba ou Sobrancelha pro próximo cliente!" |
| **Meta Batida** | `soldThisMonth >= monthlyGoal` | "Monstro Sagrado! 🚀 🔥 Meta batida, [Nome]! Já são R$ X de R$ Y (XXX%). > 'O que vier agora é lucro puro e bônus. Tente bater seu recorde pessoal hoje!' 🏆 Hora de fazer história!" |
| **Sem Extras** | `servicosExtras == 0 AND clientesAtendidos >= 2` | "Fala [Nome]! ⚠️ Você atendeu X clientes mas ZERO serviços extras. É dinheiro sumindo! > 'Doutor, finalizei o corte, mas a sobrancelha tá pedindo um alinhamento. Faço em 3 minutos e fecha o visual.' 🚀 Próximo cliente = Extra obrigatório!" |

### 3. Lógica da Edge Function (barber-ai-assistant)

```typescript
// PASSO 1: Verificar Cache (4 horas)
const { data: cachedProduction } = await supabase
  .from("daily_productions")
  .select("coach_message, last_coach_at")
  .eq("barber_id", barberId)
  .eq("date", today)
  .single();

const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
if (cachedProduction?.coach_message && 
    new Date(cachedProduction.last_coach_at) > fourHoursAgo) {
  // CACHE HIT - Retorna sem custo!
  return Response(JSON.stringify({ 
    message: cachedProduction.coach_message,
    source: "cache" 
  }));
}

// PASSO 2: Motor de Regras (Templates)
const template = checkRulesEngine(dayStats, barberName, monthlyGoal, soldThisMonth);
if (template) {
  // REGRA ATIVADA - Retorna template sem custo!
  await saveToCache(barberId, today, template);
  return Response(JSON.stringify({ 
    message: template,
    source: "rules_engine" 
  }));
}

// PASSO 3: Fallback - Chamar IA (cenários complexos)
const aiResponse = await callLovableAI(...);
await saveToCache(barberId, today, aiResponse);
return Response(JSON.stringify({ 
  message: aiResponse,
  source: "ai" 
}));
```

### 4. Frontend (Indicador de Fonte)
Opcional: Mostrar badge se a resposta veio do cache ou template:

```tsx
{data?.source === "cache" && (
  <Badge variant="outline" className="text-xs">
    💾 Dica salva
  </Badge>
)}
```

---

## Estimativa de Economia

| Cenário | Frequência Estimada | Custo API |
|---------|---------------------|-----------|
| Cache Hit (4h) | ~40% das requisições | R$ 0,00 |
| Template (Regras) | ~35% das requisições | R$ 0,00 |
| IA (Fallback) | ~25% das requisições | Normal |

**Resultado**: Economia de **~75-80%** nos custos de API mantendo respostas personalizadas.

---

## Arquivos a Modificar

1. **Migração SQL** - Adicionar colunas `coach_message` e `last_coach_at`
2. **`supabase/functions/barber-ai-assistant/index.ts`** - Implementar cache + motor de regras
3. **`src/components/dashboard/barber/AIDailyCoachCard.tsx`** - (Opcional) Badge indicador de fonte

---

## Seção Técnica

### Templates com Formatação Markdown (Escaneável)
Cada template seguirá a estrutura visual já implementada:

```typescript
const TEMPLATES = {
  zero_products: (name: string, clients: number) => `
Fala ${name}! O corte está ótimo, mas zerar produtos é deixar dinheiro na mesa.

⚠️ 0 produtos vendidos hoje com ${clients} clientes.

> "Doutor, pra manter esse corte impecável em casa, essa pomada é a arma secreta. Passo pra você?"

🚀 Missão: Os próximos 3 clientes saem com produto na mão!`,

  low_ticket: (name: string, ticket: number) => `
Alerta Vermelho, ${name}!

📉 Ticket médio: R$ ${ticket.toFixed(2)} (abaixo de R$ 50)
⚠️ Você está vendendo apenas o básico.

> "Irmão, o corte é só o começo. Vamos fazer a barba também? O visual completo tem outro impacto."

🚀 Missão: Ofereça Barba ou Sobrancelha pro próximo cliente!`,

  goal_achieved: (name: string, sold: number, goal: number) => `
Monstro Sagrado! 🏆

🔥 Meta batida, ${name}! Já são R$ ${sold.toFixed(2)} de R$ ${goal.toFixed(2)} (${((sold/goal)*100).toFixed(0)}%).

> "O que vier agora é lucro puro e bônus. Hora de quebrar o recorde pessoal!"

🚀 Bora fazer história!`,

  no_extras: (name: string, clients: number) => `
Fala ${name}!

⚠️ ${clients} clientes atendidos mas ZERO serviços extras.
📉 É dinheiro sumindo da sua comissão!

> "Doutor, finalizei o corte, mas a sobrancelha tá pedindo um alinhamento. Faço em 3 minutos."

🚀 Próximo cliente = Extra obrigatório!`
};
```

### Função de Verificação de Regras
```typescript
function checkRulesEngine(
  dayStats: DayStats,
  barberName: string,
  monthlyGoal: number,
  soldThisMonth: number
): string | null {
  // Regra 1: Meta Batida (prioridade máxima - celebração!)
  if (monthlyGoal > 0 && soldThisMonth >= monthlyGoal) {
    return TEMPLATES.goal_achieved(barberName, soldThisMonth, monthlyGoal);
  }

  // Regra 2: Zero Produtos (com >= 3 clientes)
  if (Object.keys(dayStats.produtosVendidos).length === 0 && 
      dayStats.clientesAtendidos >= 3) {
    return TEMPLATES.zero_products(barberName, dayStats.clientesAtendidos);
  }

  // Regra 3: Ticket Baixo (< R$ 50)
  if (dayStats.ticketMedio > 0 && dayStats.ticketMedio < 50) {
    return TEMPLATES.low_ticket(barberName, dayStats.ticketMedio);
  }

  // Regra 4: Sem Extras (com >= 2 clientes)
  if (dayStats.servicosExtras === 0 && dayStats.clientesAtendidos >= 2) {
    return TEMPLATES.no_extras(barberName, dayStats.clientesAtendidos);
  }

  // Nenhuma regra ativada - fallback para IA
  return null;
}
```

### Parâmetro forceRefresh para "Nova dica"
O botão "Nova dica" enviará `forceRefresh: true` para ignorar cache e gerar nova resposta:

```typescript
// Frontend
await supabase.functions.invoke("barber-ai-assistant", {
  body: { ...payload, forceRefresh: true }
});

// Edge Function
const forceRefresh = body.forceRefresh === true;
if (!forceRefresh && cachedProduction?.coach_message && ...) {
  return cached response;
}
```
