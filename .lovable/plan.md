

# Correcao: QuickSaleModal ainda cria daily_productions

## Diagnostico

A varredura completa identificou **1 unico ponto critico** no lado do gestor que ainda cria registros em `daily_productions`:

**`QuickSaleModal.tsx` - funcao `handleManualSale` (linhas 424-500)**

Essa funcao tem uma aba "Manual" que, ao ser usada pelo gestor, cria ou atualiza registros em `daily_productions` diretamente. O caminho do carrinho (`handleCartCheckout`) ja foi corrigido na refatoracao anterior, mas o caminho manual nao foi tocado.

### Demais arquivos verificados (sem problemas)

| Arquivo | Operacao | Veredicto |
|---------|----------|-----------|
| `LiveDashboard.tsx` | SELECT + maybeSingle | OK (ja corrigido) |
| `TransactionManagerModal.tsx` | INSERT com null | OK (ja corrigido) |
| `BarberSaleForm.tsx` | INSERT | OK (acao do barbeiro, correto) |
| `BarberDashboard.tsx` | INSERT (confirmar presenca) | OK (acao do barbeiro) |
| `DailyProductionForm.tsx` | UPSERT | OK (acao do barbeiro) |
| `ManagerReports.tsx` | SELECT + DELETE | OK (leitura/limpeza) |
| Todos os demais manager/* | SELECT only | OK |

---

## Correcao: Refatorar handleManualSale

A funcao `handleManualSale` sera reescrita para seguir o mesmo padrao do `handleCartCheckout`: inserir uma `sale_transaction` com `daily_production_id: null` (se nao existir producao) e **nunca criar** registros em `daily_productions`.

### Logica nova (linhas 424-500)

```text
handleManualSale:
  1. Buscar daily_production existente via maybeSingle() (nao single())
  2. productionId = existingProduction?.id || null
  3. Inserir UMA sale_transaction com:
     - barber_id, organization_id
     - daily_production_id: productionId (pode ser null)
     - item_type: "service" ou "product" conforme manualCategory
     - item_name: descricao generica baseada na categoria
     - service_category: "basic", "extra" ou null
     - price_sold: numericValue
     - commission_rate_used: 0, commission_amount: 0
     - source: "manager"
     - created_at: selectedDate.toISOString()
  4. NAO fazer insert/update em daily_productions
```

### Limpeza de fantasmas de hoje (13/02)

Apos a correcao do codigo, executar limpeza SQL dos registros fantasmas criados hoje:

```text
DELETE FROM daily_productions dp
WHERE dp.date = '2026-02-13'
  AND dp.confirmed_presence = false
  AND COALESCE(dp.services_basic_total, 0) = 0
  AND COALESCE(dp.services_extra_total, 0) = 0
  AND dp.products_total = 0
  AND dp.services_total = 0
  AND dp.clients_count = 0
  AND COALESCE(dp.tx_basic_total, 0) = 0
  AND COALESCE(dp.tx_extra_total, 0) = 0
  AND COALESCE(dp.tx_products_total, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM sale_transactions st
    WHERE st.daily_production_id = dp.id
  );
```

Nota: O barbeiro Ageu Felipe (que tem `confirmed_presence = true`) NAO sera afetado por esta query.

---

## Ordem de Execucao

1. Corrigir `handleManualSale` em `QuickSaleModal.tsx`
2. Executar limpeza SQL dos fantasmas de 13/02
3. Validar no painel Ao Vivo

## Arquivos Modificados

- `src/components/dashboard/manager/QuickSaleModal.tsx`
- Limpeza SQL (dados de 13/02)

## Resultado

- Nenhuma acao do gestor (carrinho OU manual) criara registros em `daily_productions`
- Transacoes manuais serao registradas como `sale_transactions` com source "manager"
- O trigger `trg_link_orphans_on_production_start` vinculara automaticamente quando o barbeiro iniciar o dia

