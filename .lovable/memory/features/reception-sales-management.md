---
name: reception-sales-management
description: Reception sales tracking with mandatory unit_id and barber_id null
type: feature
---

Vendas de "Recepção / Loja" são registradas sem atribuição a barbeiro (`barber_id` e `daily_production_id` como NULL).

**Unit ID obrigatório (atualizado)**: ao escolher "Venda Recepção" no `QuickSaleModal`, o gestor deve informar em qual recepção/unidade a venda aconteceu. Regras:

- 1 unidade ativa: pré-seleção automática, seletor oculto.
- 2+ unidades: seletor obrigatório no Step 1, sem default; bloqueia avanço com toast.
- Pré-seleção inteligente vinda do filtro `selectedUnit` do header do Ao Vivo.
- Vendas atribuídas a barbeiro derivam `unit_id` automaticamente de `barbers.unit_id`.

A RPC `create_sale_and_ensure_production` aceita `p_unit_id uuid` e resolve com fallback (param > barber.unit_id > NULL). Grava em `sale_transactions.unit_id` para alimentar o relatório `ReceptionPerformanceReport` corretamente. Vendas antigas continuam aparecendo como "Unidade não informada".
