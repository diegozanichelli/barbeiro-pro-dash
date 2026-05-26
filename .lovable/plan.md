## Contexto da auditoria

Apenas o **Ponto 1** precisa de correção. Pontos 2 e 3 já estão matematicamente corretos no RPC `get_subscription_intelligence` (legacy_import é excluído por igualdade exata em `subscription_action='new'`, e o Δ MRR já usa `ELSE 0` quando `previous_price IS NULL`).

## Problema

No `SubscriptionAnalytics.tsx`, o estado inicial é:
```ts
const [sourceFilter, setSourceFilter] = useState<"manager" | "all">("manager");
```

Isso envia `p_source_filter='manager'` para o RPC, que aplica `AND source = 'manager'` em **todas** as agregações base (counts, revenue, Δ MRR, downgrade, oportunidades, conversão, tabela). Vendas com `source='barber'` (legado / app antigo do barbeiro) ficam invisíveis por padrão — exatamente o mesmo vazamento que corrigimos nos outros relatórios.

## Mudanças

### `src/components/dashboard/manager/SubscriptionAnalytics.tsx`
1. **Default do filtro** vira `"all"` (mostra Gestor + Barbeiro/legado por padrão).
2. **Inverter o dropdown** para refletir a nova semântica:
   - `"all"` → "Todas as origens (padrão)"
   - `"manager"` → "Apenas Gestor (auditoria)"
3. **Texto auxiliar** abaixo do dropdown explicando que o filtro é só uma lente de auditoria — a base global do painel já inclui todas as origens.
4. Nenhuma mudança no RPC: ele já trata `p_source_filter=null` como "todas as origens" (linha 56 do RPC).

### Verificação pós-fix
- Abrir o painel: o Δ MRR, contadores e tabela devem incluir transações `source='barber'` (legado).
- Trocar o dropdown para "Apenas Gestor" e confirmar que os números caem (filtro continua funcional como lente).
- Conferir que os 171 / 65 / Δ MRR refletem a base completa.

## Fora de escopo
- Nenhuma mudança no RPC.
- Nenhuma mudança nos cálculos de conversão ou Δ MRR (já corretos).
- Não tocar em `SubscriptionPerformanceReport` nem outros relatórios.
