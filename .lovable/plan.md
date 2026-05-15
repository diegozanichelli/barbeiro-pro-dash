
## Correção do Relatório de Conversão de Assinaturas

Decisões aplicadas:
- Itens 1 e 2 → **opção C: mostrar as duas métricas** (Conversão estrita + Penetração)
- Itens 4 (oportunidades sem telefone) e 5 (filtro de unidade) → **adiados**
- Itens 3, 6, 7, 8 → corrigidos agora

Arquivos afetados (somente frontend):
- `src/components/dashboard/manager/SubscriptionPerformanceReport.tsx`
- `src/components/dashboard/manager/SubscriptionScopeInfo.tsx`

---

### 1. Buscar `is_new_client` e `mobile_phone` em todas as transações

Hoje só guardamos `mobile_phone` para clientes novos. Precisamos de `is_new_client` em **todas** as linhas (inclusive nas vendas de assinatura) para cruzar quem virou assinante sendo cliente novo. Já está no `select`, só precisa ser usado no agregador.

### 2. Calcular **duas** métricas por barbeiro

Para cada barbeiro (e recepção):

```text
Oportunidades         = pessoas únicas (Set<phone>) com is_new_client=true
Ades. Cliente Novo    = transações subscription + action='new' + is_new_client=true
Ades. Totais          = transações subscription + action='new' (qualquer cliente)

Conversão estrita (%) = Ades. Cliente Novo  ÷ Oportunidades  × 100   (≤100%)
Penetração      (%)   = Ades. Totais        ÷ Oportunidades  × 100   (pode >100%)
```

### 3. Total geral deduplicado entre barbeiros (item 3)

Construir um `Set<phone>` global unindo todas as oportunidades (barbeiros + recepção) — não somar os `.size` individuais. Mesma pessoa atendida por dois barbeiros conta como 1 no total geral.

### 4. Timezone Manaus nas bordas do filtro de data (item 6)

Trocar:
```ts
.gte("created_at", `${startDate}T00:00:00`)
.lte("created_at", `${endDate}T23:59:59`)
```
por:
```ts
.gte("created_at", `${startDate}T00:00:00-04:00`)
.lte("created_at", `${endDate}T23:59:59-04:00`)
```

### 5. Badge especial "venda sem oportunidade" (item 7)

Quando `oportunidades = 0` e `vendas > 0`:
```
⚠️ Sem oportunidade registrada (N vendas)
```
Substitui o atual "N/A" silencioso, sinalizando bug de cadastro (cliente novo não foi marcado).

### 6. UI da tabela e dos cards de resumo

**Tabela** ganha duas colunas distintas:

```text
Barbeiro | Oportunidades | Ades. Cliente Novo | Ades. Totais | Conversão Estrita | Penetração
```

**Cards de resumo** (3 → 4):

1. 🎯 Oportunidades (pessoas únicas)
2. 👤 Ades. de Cliente Novo
3. 👑 Ades. Totais (incl. clientes da casa)
4. 📉 Conversão Estrita / Penetração (lado a lado num só card, ex.: `28% / 47%`)

Tooltips atualizados explicando a diferença entre as duas taxas.

### 7. Atualizar `SubscriptionScopeInfo.tsx` (item 8)

Corrigir o footer que afirma "o total de Novas Assinaturas da Carteira coincide com o total da Conversão" — não coincide (Carteira inclui renovações). Reescrever para deixar claro:

- **Carteira**: todas as movimentações (`action ∈ {new, renew, upgrade, downgrade}`)
- **Conversão → Ades. Totais**: apenas `action='new'`
- **Conversão → Ades. Cliente Novo**: `action='new' AND is_new_client=true`
- **Recepção**: subset de `action='new'` sem barber_id

E o tooltip de "👑 Vendas" no `SubscriptionPerformanceReport` (que hoje diz "mesmo critério da Carteira") será reescrito para o critério real.

---

### Próximos passos (fora deste plano)

- Item 4 — desenhar como tratar oportunidades sem telefone (você pediu para repensar).
- Item 5 — desenhar UX do filtro de unidade.
