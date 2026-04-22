

# Corrigir contagem de "Clientes Novos" (Jesus e outros)

## Diagnóstico

Investiguei `sale_transactions` no banco. O barbeiro Jesus em **abril/2026** tem só 2 linhas com `is_new_client = true` — ambas são `item_type = 'subscription'`. **Zero serviços** marcados como cliente novo.

Olhando a base inteira da Performance Barber, o padrão se repete em quase todos os barbeiros:
- Diego Indriago: 5 novos / **0 serviços** marcados / 5 assinaturas
- Renan Alves: 4 / **0** / 4
- Fagner Serra: 3 / **0** / 3
- Jesus, Joaquim, Gabriel Peter, Henrique, Cesar, Carlos, AGEU: idem

Conclusão: a recepção **só marca "Cliente Novo" quando vende assinatura**. Cliente novo que veio só cortar cabelo passa marcado como "Da Casa".

## Causa raiz no código

No `QuickSaleModal.tsx`, quando o autocomplete responde `status === "not_found"` (telefone que não existe na base):

```ts
} else if (res.status === "not_found") {
  // Não muda automaticamente — o gestor decide manualmente
}
```

E o default inicial do `clientType` é `"without_subscription"` ("Da Casa"). Resultado: o gestor digita um telefone que **nunca foi atendido antes**, o sistema sabe disso, mas mantém o toggle em "Da Casa". Só sobra um aviso visual sutil (não-bloqueante) que o gestor ignora.

Isso quebra o relatório de Performance de Assinaturas (Evolução → Assinaturas), o Funil em Inteligência de Assinaturas, e a taxa de conversão geral.

## Solução em 3 camadas

### 1. Auto-sugerir "Cliente Novo" quando telefone não existe (mudança principal)

Em `QuickSaleModal.tsx`, dentro dos 3 handlers do autocomplete (`useEffect` do telefone, `onValueChange` do telefone, e ao confirmar nome):

```ts
} else if (res.status === "not_found") {
  if (!manualOverride) setClientType("new");
}
```

Comportamento resultante:
- Telefone novo + sem override manual → toggle pula automaticamente para **"Novo"** (verde).
- Telefone existente → continua indo para "Da Casa" (como já é hoje).
- Gestor pode trocar manualmente a qualquer momento (`manualOverride` segue funcionando).

### 2. Banner visual quando o sistema sinalizar "cliente nunca atendido"

Logo abaixo do `ToggleGroup` de Tipo de Cliente, quando `clientHistory.status === "not_found"` E `clientType === "new"` E `!manualOverride`:

```tsx
<div className="rounded-md bg-green-500/10 border border-green-500/30 px-2.5 py-1.5 text-[11px] text-green-700 dark:text-green-400 flex items-center gap-1.5">
  <UserPlus className="w-3 h-3" />
  Telefone não encontrado na base — marcamos como <strong>Cliente Novo</strong> automaticamente.
</div>
```

E quando o gestor força "Da Casa" num telefone desconhecido (`status === "not_found"` + `clientType !== "new"` + `manualOverride === true`):

```tsx
<div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
  <AlertCircle className="w-3 h-3" />
  Esse telefone não está na base. Tem certeza que não é um cliente novo?
</div>
```

Não bloqueia, só chama atenção.

### 3. Backfill (opcional, mas recomendado)

Para corrigir os relatórios passados de abril/2026, posso gerar um SQL que marque retroativamente como `is_new_client = true` toda transação `source = 'manager'` cujo `mobile_phone` aparece pela **primeira vez** na história da `sale_transactions` da organização (ou seja, foi o primeiro atendimento daquele celular).

Migration `mark_first_visit_as_new_client.sql`:
```sql
WITH first_visit AS (
  SELECT DISTINCT ON (organization_id, mobile_phone)
    id
  FROM sale_transactions
  WHERE mobile_phone IS NOT NULL
    AND source = 'manager'
  ORDER BY organization_id, mobile_phone, created_at ASC
)
UPDATE sale_transactions st
SET is_new_client = true
FROM first_visit fv
WHERE st.id = fv.id
  AND st.is_new_client IS DISTINCT FROM true;
```

Isso reescreve a história de forma justa: a primeira aparição de cada celular vira oficialmente "Cliente Novo". Os relatórios da aba Evolução e Inteligência passam a refletir a realidade.

> ⚠️ Esse passo é opcional. Se preferir manter o histórico intocado e só corrigir daqui pra frente, basta aplicar os passos 1 e 2.

## Arquivos afetados

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/components/dashboard/manager/QuickSaleModal.tsx` | Auto-sugerir `"new"` em 3 pontos do fluxo + 2 banners de feedback visual |
| 2 | `supabase/migrations/<timestamp>_mark_first_visit_as_new_client.sql` | Backfill retroativo (opcional — eu pergunto antes de criar) |
| 3 | `mem://features/global-client-type-classification` | Atualizar memória registrando que o sistema agora **sugere** o tipo automaticamente |

## Impacto esperado

- Relatório **Performance de Assinaturas (Recepção/Evolução)** passa a mostrar o número real de oportunidades por barbeiro.
- Taxa de conversão geral cai (porque o denominador agora inclui todos os clientes novos), mas vira um número confiável.
- Funil em **Inteligência de Assinaturas** fica preciso.
- Métricas de "Cliente Novo" no dashboard do barbeiro (se houver) também ficam corretas.

## Ponto de decisão

Antes de implementar eu confirmo com você:
1. ✅ **Aplicar passo 1 + 2** (auto-marcação + feedback visual) — **recomendado, sem risco.**
2. ⚠️ **Aplicar também passo 3** (backfill retroativo) — corrige o passado, mas reescreve dados. Decida se vale.

