
# Correção: Duplicação de Produtos na Comissão do Barbeiro

## Problema Identificado

O barbeiro **Renan Alves** está vendo R$ 200 a mais na comissão porque o trigger do banco de dados está **somando indevidamente** os valores do Gestor (Ao Vivo) com os valores do Barbeiro (lançamento manual).

### Exemplo do dia 04/02/2026:
| Campo | Valor | Origem |
|-------|-------|--------|
| `tx_products_total` | R$ 252,00 | Gestor via Ao Vivo |
| `manual_products_total` | R$ 252,00 | Barbeiro via lançamento |
| `products_total` | **R$ 504,00** ❌ | ERRADO: está somando ambos |
| Correto | **R$ 252,00** ✅ | Deveria ser apenas o manual |

O mesmo produto (Máscara de Hidratação, Balm Cavaleira, OLEO VIP) foi registrado duas vezes - uma pelo gestor e outra pelo barbeiro. Isso é esperado pelo sistema de auditoria oculta, mas o trigger não deveria somar os dois valores.

---

## Solução

### 1. Corrigir o Trigger `recalculate_daily_production_from_transactions`

O trigger atual faz:
```sql
products_total = v_tx_products_total + COALESCE(v_manual_products_total, 0)
```

Precisa ser alterado para:
```sql
products_total = COALESCE(v_manual_products_total, 0)
```

E o mesmo para todos os campos legados (`services_basic_total`, `services_extra_total`).

### 2. Recalcular Produções Afetadas

Após corrigir o trigger, rodar um script para recalcular todas as `daily_productions` onde `tx_* > 0` E `manual_* > 0` (casos de duplicação).

---

## Detalhes Técnicos

### Alteração do Trigger (resumo das mudanças)

```sql
-- ANTES (ERRADO - soma tx + manual):
services_basic_total = v_tx_basic_total + COALESCE(v_manual_basic_total, 0),
services_extra_total = v_tx_extra_total + COALESCE(v_manual_extra_total, 0),
products_total = v_tx_products_total + COALESCE(v_manual_products_total, 0),

-- DEPOIS (CORRETO - usa apenas manual):
services_basic_total = COALESCE(v_manual_basic_total, 0),
services_extra_total = COALESCE(v_manual_extra_total, 0),
products_total = COALESCE(v_manual_products_total, 0),
```

### Script de Correção de Dados Históricos

Recalcular as produções afetadas do Renan e de outros barbeiros que possam ter o mesmo problema.

---

## Impacto

- **Renan Alves**: Comissão será corrigida de R$ 504 para R$ 252 em produtos no dia 04/02
- **Outros barbeiros**: Potencialmente afetados se tiveram lançamentos duplicados (gestor + barbeiro no mesmo dia)
- **Sistema de auditoria**: Continua funcionando - os campos `tx_*` ainda servem para comparação de divergência
