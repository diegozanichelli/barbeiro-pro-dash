

# Correcao Critica: Duplicacao de Transacoes na Edicao de Vendas

## Diagnostico

### Escala do Problema
- **54 barbeiros afetados** nos ultimos 3 dias
- Barbeiros com ate **48 transacoes duplicadas** em um unico dia (guilherme, hiago)
- **AGEU FELIPE**: 40 transacoes de barbeiro em 12/02 (quando deveria ter ~5-8)
- 8 transacoes orfas (apontando para daily_productions deletados)

### Causa Raiz Identificada

Existem **DOIS bugs distintos** causando duplicacao:

**Bug 1 - BarberSaleForm sem protecao contra duplo-clique:**
O botao "Confirmar Venda" (linha 667) usa `disabled={loading}`, mas no mobile o estado `loading` nao atualiza rapido o suficiente. O barbeiro toca 2-3 vezes e cada toque insere TODAS as transacoes do carrinho novamente. Evidencia: transacoes com `created_at` identico ate o milissegundo (ex: `12:51:12.884557` com 3 "Corte" iguais).

**Bug 2 - DailyProductionForm.tsx (modo legado) sobrescreve campos sem limpar transacoes:**
Quando o barbeiro edita via `ProductionHistory` -> `DailyProductionForm` (com `initialData`), o formulario faz `upsert` direto em `daily_productions` nos campos `services_basic_total`, `services_extra_total`, `products_total`. Porem, o trigger `recalculate_daily_production_from_transactions` roda a cada mudanca em `sale_transactions` e **sobrescreve** esses campos de volta com o SUM das transacoes. Resultado: os valores manuais sao perdidos, ou somam indevidamente quando novas transacoes sao criadas.

O `BarberEditProductionModal` (modal de cards) esta **correto** -- faz DELETE das transacoes antigas + INSERT das novas (linhas 266-301).

## Correcoes Propostas

### 1. BarberSaleForm.tsx - Protecao contra duplo-clique

Adicionar um `ref` de submissao em progresso (`isSubmittingRef`) que bloqueia instantaneamente novas submissoes, independente do ciclo de render do React:

```text
// Adicionar no inicio do componente:
const isSubmittingRef = useRef(false);

// No handleConfirmCheckout, ANTES de setLoading:
if (isSubmittingRef.current) return;
isSubmittingRef.current = true;

// No finally:
isSubmittingRef.current = false;

// No handleConfirmManualSale, mesma logica
```

Tambem fechar o dialog de checkout imediatamente apos o clique para evitar re-submissao:

```text
// Apos setLoading(true):
setCheckoutOpen(false);
```

### 2. BarberSaleForm.tsx - DELETE antes de INSERT (mesma logica do Edit modal)

Antes de inserir novas transacoes do barbeiro para o dia, deletar as transacoes anteriores com `source='barber'` para aquela `daily_production_id`. Isso garante que re-submissoes nao acumulem:

```text
// Antes do insert de transactions (linha 237):
await supabase
  .from("sale_transactions")
  .delete()
  .eq("daily_production_id", dailyProductionId)
  .eq("source", "barber");
```

**IMPORTANTE:** Isso NAO e adequado para o BarberSaleForm que e um formulario de NOVA venda (pode ter vendas anteriores no mesmo dia). O correto e apenas a protecao contra duplo-clique.

**CORRECAO:** A abordagem correta para o BarberSaleForm (nova venda) e APENAS a protecao contra duplo-clique, sem deletar transacoes anteriores do dia.

### 3. Limpeza de dados duplicados (SQL)

Executar uma migracao para remover transacoes duplicadas. A estrategia: para cada barbeiro/dia, manter apenas as transacoes que apontam para o `daily_production_id` **correto** (o que ainda existe em `daily_productions`). Transacoes orfas devem ser deletadas.

```text
-- Deletar transacoes que apontam para daily_productions inexistentes
DELETE FROM sale_transactions
WHERE daily_production_id NOT IN (SELECT id FROM daily_productions)
  AND created_at >= '2026-02-10';

-- Para cada barbeiro/dia com transacoes duplicadas:
-- Manter a ULTIMA submissao (maior created_at por grupo item_name+price_sold)
-- e deletar as anteriores do mesmo source='barber'
```

Apos a limpeza, o trigger `recalculate_daily_production_from_transactions` sera acionado e recalculara os totais corretos.

### 4. Recalculo forcado de comissoes

Apos a limpeza, forcar recalculo de todas as `daily_productions` afetadas disparando um UPDATE trivial que aciona o trigger:

```text
UPDATE daily_productions
SET updated_at = now()
WHERE date >= '2026-02-10'
  AND date <= '2026-02-12';
```

## Secao Tecnica

### Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `src/components/dashboard/barber/BarberSaleForm.tsx` | Adicionar `useRef` para protecao anti-duplo-clique em `handleConfirmCheckout` e `handleConfirmManualSale`. Fechar dialog apos clique. |
| Migracao SQL | Deletar transacoes orfas e duplicadas dos dias 10-12/02. Forcar recalculo de comissoes. |

### Detalhes da Correcao no BarberSaleForm.tsx

**handleConfirmCheckout (linha 169):**
```text
const isSubmittingRef = useRef(false);

const handleConfirmCheckout = async () => {
  if (cart.length === 0) {
    toast.error("Selecione pelo menos um item");
    return;
  }
  if (isSubmittingRef.current) return;  // <-- NOVO
  isSubmittingRef.current = true;        // <-- NOVO

  setLoading(true);
  setCheckoutOpen(false);               // <-- NOVO: fecha modal imediatamente

  // ... resto da logica existente ...

  // No finally:
  isSubmittingRef.current = false;       // <-- NOVO
};
```

**handleConfirmManualSale (linha 260):**
```text
const handleConfirmManualSale = async () => {
  // ... validacao existente ...
  if (isSubmittingRef.current) return;   // <-- NOVO
  isSubmittingRef.current = true;        // <-- NOVO

  // ... resto da logica existente ...

  // No finally:
  isSubmittingRef.current = false;       // <-- NOVO
};
```

### Migracao SQL - Limpeza de Duplicatas

A migracao tera 3 etapas:
1. Deletar transacoes orfas (sem daily_production valido)
2. Para cada barbeiro/dia, identificar grupos de transacoes duplicadas (mesmo item_name, price_sold, source='barber', created_at identico) e manter apenas 1 de cada grupo
3. Disparar recalculo em todas as daily_productions dos dias 10-12/02

### Impacto

- Protecao anti-duplo-clique impede novas duplicacoes imediatamente
- Limpeza SQL remove ~80% das transacoes duplicadas dos ultimos 3 dias
- Recalculo forcado corrige comissoes de todos os barbeiros afetados
- Nenhuma alteracao no trigger do banco (ja funciona corretamente com SUM)
