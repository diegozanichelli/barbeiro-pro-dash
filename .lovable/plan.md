## Objetivo
Auditar a aba **Inteligência de Assinaturas** (`SubscriptionAnalytics.tsx`) — não corrigir ainda. Mapear inconsistências na arquitetura e no fluxo de dados, comparando com as outras 2 abas do trio (Conversão por Barbeiro, Vendas da Recepção) e com `SubscriptionsTracking`.

## Achados (ordenados por gravidade)

### 1. Janela temporal usa fuso do navegador, não Manaus  [ALTO]
```ts
const refDate = new Date(selectedYear, selectedMonth, 1);
const start = startOfMonth(refDate).toISOString();
const end   = endOfMonth(refDate).toISOString();
```
- `new Date(y,m,1)` cria a meia-noite no fuso **do browser**, depois `.toISOString()` converte para UTC.
- Resultado: para usuários fora de America/Manaus (ou DST), transações da virada de mês caem na aba errada.
- Quebra a regra Core do projeto: usar `getManausDate` + datas puras `YYYY-MM-DD`. As outras abas (`SubscriptionsTracking`, `SubscriptionPerformanceReport`) já seguem o padrão correto — esta aba é a única destoante.

### 2. Filtro `source='manager'` cria divergência entre abas  [ALTO]
- `SubscriptionAnalytics` filtra `.eq('source','manager')` nas duas queries (subs e novos clientes).
- `SubscriptionsTracking` (aba "Assinaturas por Barbeiro") **não filtra** `source`.
- Consequência: o total mensal de uma aba não bate com a outra. Qualquer registro legado `source='barber'` some apenas aqui.
- Memória do projeto diz "barber-readonly-app", mas dados históricos antes do lockdown existem e ficam invisíveis somente nesta aba.

### 3. Funil de Conversão pode passar de 100% / contar errado  [ALTO]
```ts
const newSubs = transactions.filter(t => t.subscription_action==='new' && t.is_new_client).length;
const totalNewClients = uniquePhones.size; // só conta phones != null
const conversionRate = newSubs / totalNewClients;
```
- **Numerador** inclui assinaturas `is_new_client=true` mesmo **sem `mobile_phone`** (dados legados).
- **Denominador** descarta linhas sem `mobile_phone`.
- → `newSubs > totalNewClients` é matematicamente possível: taxa > 100%.
- Além disso, o conceito "cliente novo" é definido pelo flag transacional, não pela primeira ocorrência na tabela `clients`. O mesmo celular pode ser marcado `is_new_client=true` em meses diferentes (erro de operação) e inflar o denominador.

### 4. Falta filtro por unidade  [MÉDIO]
- Todos os outros relatórios de assinatura têm seletor de unidade (`SubscriptionsTracking`, `SubscriptionPerformanceReport`, `ReceptionPerformanceReport`).
- Esta aba mostra agregado da organização inteira sem opção de filtrar → gestor multi-unidade não consegue analisar por loja.
- Coluna "Unidade" aparece na tabela mas não é filtrável; e fica "—" para vendas de recepção (ver achado 7).

### 5. Sem agregação server-side: viola regra >1000 rows  [MÉDIO]
- Query traz **todas as linhas** de `sale_transactions` do mês (com 3 joins) para agregar no front.
- Regra do projeto: aggregations >1000 rows devem ir para RPC (ex.: `get_subscription_intelligence_stats`).
- Em orgs maduras isso quebra silenciosamente no limite de 1000 do PostgREST → métricas subestimadas sem aviso.

### 6. Sem registro do plano anterior em upgrade/downgrade  [MÉDIO — arquitetura]
- `subscription_action='upgrade'|'downgrade'` é gravado, mas a tabela não tem `previous_plan_id` nem `previous_price`.
- Impossível calcular delta real de MRR (Δ receita por migração).
- "Motivos de Downgrade" é texto livre (`downgrade_reason`) sem dicionário/enum → gráfico de pizza vai fragmentar em variações de digitação.

### 7. `unit_id` ausente para vendas de recepção  [MÉDIO]
- Trigger `fill_sale_transaction_unit_id` popula `unit_id` a partir de `barbers.unit_id`.
- Vendas da recepção têm `barber_id=NULL` → `unit_id` fica NULL → coluna "Unidade" mostra "—".
- O `SubscriptionWizardModal` precisaria forçar `unit_id` explícito para recepção. Hoje a granularidade por unidade da Inteligência está incompleta.

### 8. Snapshot do "mês corrente" congela ao montar  [BAIXO]
```ts
const manausNow = useMemo(() => getManausDate(), []);
const [selectedMonth] = useState(manausNow.getMonth());
```
- Se a página fica aberta passando da virada de mês, o select continua no mês antigo.

### 9. Edição via modal pode "sumir" a linha  [BAIXO — UX]
- `SubscriptionEditModal.onSaved → fetchData`. Se o gestor mudar `source` para 'barber' ou mover de mês, a transação desaparece da tabela sem aviso.

### 10. Estados de loading parciais  [BAIXO]
- `Promise.all` de duas queries com `setLoading(false)` apenas no fim — OK. Mas erros (`subRes.error`) são silenciosamente ignorados: nada é mostrado ao usuário se a query falhar.

## Mapa do fluxo atual

```text
SubscriptionAnalytics (mount)
  └─ fetchData()
       ├─ Q1: sale_transactions WHERE item_type='subscription' AND source='manager'
       │       AND created_at BETWEEN [browser-TZ start] AND [browser-TZ end]
       │       JOIN barbers, subscription_plans, units
       │       ↳ usa: counts/revenue por action, downgradeData, tabela, numerador funil
       │
       └─ Q2: sale_transactions WHERE is_new_client=true AND source='manager'
               SELECT mobile_phone
               ↳ usa: Set(phones).size = denominador funil

Divergências vs outras abas:
  - SubscriptionsTracking → não filtra source, usa dateUtils Manaus ✅
  - SubscriptionPerformanceReport → filtra unidade, lógica "estrita vs penetração" ✅
  - SubscriptionAnalytics → filtra source='manager', sem unidade, TZ navegador ❌
```

## Próximos passos sugeridos (não executar agora)

Em ordem de prioridade caso o usuário queira corrigir:
1. Padronizar janela temporal com `getManausDate` + strings `YYYY-MM-DD` (achado 1).
2. Alinhar política de `source`: ou todas as 4 abas filtram `manager`, ou nenhuma — definir e documentar (achado 2).
3. Recalcular funil garantindo `newSubs ≤ totalNewClients` (filtrar numerador por `mobile_phone NOT NULL`, ou mudar denominador para contar adesões, não oportunidades) (achado 3).
4. Adicionar filtro por unidade igual às outras abas (achado 4).
5. Migrar agregações para RPC `get_subscription_intelligence` (achado 5).
6. Avaliar adicionar colunas `previous_plan_id` / `previous_price` para upgrades/downgrades (achado 6).
7. Forçar `unit_id` no Wizard para vendas de recepção (achado 7).

Quer que eu detalhe planos de correção para algum desses itens específicos?
