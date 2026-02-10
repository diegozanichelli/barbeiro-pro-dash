
# Dashboard de Inteligencia de Assinaturas

## Resumo
Criar um novo componente `SubscriptionAnalytics.tsx` com metricas de movimentacao da carteira (new/renew/upgrade/downgrade), grafico de motivos de downgrade, funil de conversao e tabela de movimentacoes recentes. Sera integrado como nova sub-aba "Inteligencia" dentro da aba Evolucao.

---

## Componente: `src/components/dashboard/manager/SubscriptionAnalytics.tsx`

### Busca de Dados
- Query na `sale_transactions` do mes/ano selecionado onde `item_type = 'subscription'`
- Campos: `subscription_action`, `downgrade_reason`, `is_new_client`, `item_name`, `client_name`, `created_at`, `price_sold`, `subscription_plan_id`
- Join com `barbers(name)` e `subscription_plans(name)` para exibir nomes
- Query separada para total de clientes novos (todas transacoes com `is_new_client = true` e `source = 'manager'`)

### Secao 1: Cards de Resumo (4 cards no topo)
- **Novas Assinaturas**: count de `subscription_action = 'new'`
- **Renovacoes**: count de `subscription_action = 'renew'`
- **Upgrades**: count de `subscription_action = 'upgrade'` (icone verde TrendingUp)
- **Downgrades**: count de `subscription_action = 'downgrade'` (icone vermelho TrendingDown)

### Secao 2: Graficos de Analise

**Grafico A - Motivos de Downgrade (PieChart/Donut)**
- Agrupa por `downgrade_reason` das transacoes com `subscription_action = 'downgrade'`
- Se nao houver dados, exibe mensagem "Sem downgrades registrados"
- Usa Recharts `PieChart` com `innerRadius` para efeito donut

**Grafico B - Funil de Conversao (BarChart Horizontal)**
- Barra 1: Total de clientes novos atendidos (oportunidades) - `is_new_client = true` de qualquer transacao `source = 'manager'`
- Barra 2: Assinaturas vendidas para novos - `subscription_action = 'new'` AND `is_new_client = true`
- Label com % de conversao em destaque
- Usa Recharts `BarChart` com `layout="vertical"`

### Secao 3: Tabela de Movimentacoes Recentes
- Ultimas 10 transacoes de assinatura ordenadas por `created_at DESC`
- Colunas: Data | Cliente | Acao (Badge colorida) | Plano | Motivo
- Badges: new=verde, renew=azul, upgrade=emerald, downgrade=vermelho

### Filtros
- Seletor de mes e ano (mesmo padrao do `SubscriptionPerformanceReport`)

---

## Integracao na Navegacao

Adicionar como nova sub-aba "Inteligencia" no componente `BarberEvolution.tsx` (aba Evolucao do gestor), ao lado das sub-abas existentes (Barbearia, Comparativo, Barbeiro, Assinaturas, Recepcao).

- Nova TabsTrigger com icone `Brain` ou `BarChart3` e label "Inteligencia"
- TabsContent renderiza `<SubscriptionAnalytics />`
- O grid de tabs passa de `grid-cols-5` para `grid-cols-6`

---

## Detalhes Tecnicos

### Arquivos a criar
- `src/components/dashboard/manager/SubscriptionAnalytics.tsx`

### Arquivos a modificar
- `src/components/dashboard/manager/BarberEvolution.tsx` - adicionar nova sub-aba

### Dependencias utilizadas (ja instaladas)
- `recharts` - PieChart, BarChart, ResponsiveContainer
- `date-fns` + `date-fns-tz` - formatacao de datas
- Componentes UI existentes: Card, Badge, Table, Select, Skeleton

### Estrutura da Query Principal
```text
supabase
  .from("sale_transactions")
  .select("id, created_at, subscription_action, downgrade_reason, is_new_client, item_name, client_name, price_sold, barbers(name), subscription_plans(name)")
  .eq("item_type", "subscription")
  .gte("created_at", startDate)
  .lte("created_at", endDate)
  .order("created_at", { ascending: false })
```

### Mapeamento de cores das acoes
- new -> bg-green-500 (verde)
- renew -> bg-blue-500 (azul)
- upgrade -> bg-emerald-500 (emerald)
- downgrade -> bg-red-500 (vermelho)
