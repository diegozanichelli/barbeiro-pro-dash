

# Capturar a Unidade na "Venda Recepção"

## O problema

Hoje, ao escolher **"Venda Recepção"** no `QuickSaleModal`, o sistema grava `barber_id = NULL` mas **não grava em qual recepção/unidade** a venda aconteceu. Para barbearias com mais de uma filial, isso significa:

- A venda existe, mas fica órfã de unidade.
- O relatório **Performance de Assinaturas (Recepção)** já tenta ler `unit_id`, mas como nada é gravado, todas as vendas caem no balde **"Unidade não informada"**.
- O dono da rede não consegue saber qual recepção está vendendo mais, qual está parada, nem comparar performance entre filiais.

A coluna `sale_transactions.unit_id` já existe no banco — só falta o fluxo do PDV preenchê-la.

---

## Solução — seletor obrigatório de Unidade quando for Recepção

Quando o gestor marcar **"Venda Recepção"** no Step 1, aparece **logo abaixo do toggle** um seletor obrigatório de **"Em qual recepção?"** listando todas as unidades ativas da barbearia.

Regras:

- **1 unidade ativa**: pré-seleciona automaticamente, esconde o seletor (não polui a UI).
- **2+ unidades**: mostra o seletor, obrigatório, sem default. Sem unidade selecionada → bloqueia o avanço com toast: *"Selecione em qual recepção a venda aconteceu."*
- **Pré-seleção inteligente**: se o gestor já estiver com uma unidade filtrada no header do Ao Vivo (`selectedUnit !== "all"`), o seletor abre já com aquela unidade marcada (mas editável).
- **Venda atribuída a barbeiro**: a unidade vem automaticamente do cadastro do barbeiro (`barber.unit_id`) — não precisa pedir nada ao gestor.

---

## Mudanças concretas

### 1. `LiveDashboard.tsx`
- Estender o estado `quickSaleModal` com `prefillUnitId?: string`.
- Ao abrir pelo botão **"Nova Venda"**, passar `prefillUnitId = selectedUnit !== "all" ? selectedUnit : undefined`.
- Passar a lista `units` e `prefillUnitId` como novas props para `<QuickSaleModal />`.

### 2. `QuickSaleModal.tsx`
- **Novas props:** `units: { id: string; name: string }[]` e `prefillUnitId?: string`.
- **Novo estado:** `selectedUnitId: string | null`, inicializado com:
  - `prefillUnitId` (se houver), OU
  - o ID da única unidade ativa (se `units.length === 1`), OU
  - `null`.
- Para vendas de barbeiro, derivar `unitId` a partir do `barber.unit_id` consultado junto com a busca já existente de barbeiros (`availableBarbers`).
- **UI no Step 1** (logo abaixo do `ToggleGroup` de atribuição, só quando `attribution === "reception"` e `units.length > 1`):
  ```text
  🏢 Em qual recepção?
  [ Select com lista de unidades ativas ]
  ```
- **Validação:** estender `attributionResolved` para também exigir `selectedUnitId` quando `isReceptionSale === true` e houver mais de uma unidade. Bloquear `canProceedStep1` e o submit manual com toast claro.
- **Envio:** incluir `p_unit_id` no payload da RPC `create_sale_and_ensure_production` (ver item 3). Cobre os dois caminhos: `handleCartCheckout` e o submit do "Manual".

### 3. RPC `create_sale_and_ensure_production` (migração)
- Adicionar parâmetro `p_unit_id uuid DEFAULT NULL`.
- Resolver a unidade efetiva dentro da função, com fallback automático:
  1. Se `p_unit_id` foi passado → usa ele.
  2. Senão, se `p_barber_id` não-nulo → `SELECT unit_id FROM barbers WHERE id = p_barber_id`.
  3. Senão → `NULL` (compatível com vendas legadas).
- Gravar a unidade resolvida na coluna `sale_transactions.unit_id` no `INSERT`.
- Sem mudanças de schema na tabela (`unit_id` já existe e é nullable).

### 4. `ReceptionPerformanceReport.tsx`
- Sem mudanças. A partir de agora, novas vendas vão alimentar corretamente a quebra por unidade que o relatório já implementa. Vendas antigas (pré-correção) continuam aparecendo agrupadas em **"Unidade não informada"**, sem retroativo.

---

## Detalhes Técnicos

**Lookup de unidade do barbeiro no QuickSaleModal:**
```ts
const resolvedUnitId = isReceptionSale
  ? selectedUnitId
  : (availableBarbers.find(b => b.id === effectiveBarberIdResolved)?.unit_id ?? null);
```

**Chamada da RPC:**
```ts
await supabase.rpc("create_sale_and_ensure_production", {
  p_organization_id: organizationId,
  p_barber_id: isReceptionSale ? null : effectiveBarberIdResolved,
  p_unit_id: resolvedUnitId,         // novo
  p_date: dateStr,
  p_transactions: [...],
  p_source: "manager",
});
```

**Trecho da migração:**
```sql
CREATE OR REPLACE FUNCTION public.create_sale_and_ensure_production(
  p_organization_id uuid,
  p_barber_id uuid DEFAULT NULL,
  p_date date DEFAULT CURRENT_DATE,
  p_transactions jsonb DEFAULT '[]',
  p_source text DEFAULT 'manager',
  p_unit_id uuid DEFAULT NULL          -- novo
) ...
DECLARE v_unit_id uuid;
BEGIN
  v_unit_id := COALESCE(
    p_unit_id,
    (SELECT unit_id FROM barbers WHERE id = p_barber_id)
  );
  -- ... INSERT inclui v_unit_id em sale_transactions.unit_id
```

---

## Plano de execução

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | Migração SQL | Adicionar `p_unit_id` à RPC + fallback via `barbers.unit_id` + gravar `sale_transactions.unit_id` |
| 2 | `LiveDashboard.tsx` | Estender state e props para passar `units` + `prefillUnitId` (vindo do filtro) |
| 3 | `QuickSaleModal.tsx` | Novo seletor "Em qual recepção?" no Step 1, validação obrigatória e envio de `p_unit_id` |
| 4 | Memória | Atualizar `mem://features/reception-sales-management` registrando que recepção agora exige `unit_id` |

Sem retroatividade em vendas antigas. Frontend + 1 migração de RPC. Estimativa: 1 sessão.

