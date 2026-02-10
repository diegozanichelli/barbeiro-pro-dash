
# Adicionar Coluna "Unidade" na Tabela de Movimentacoes Recentes

## Resumo
Adicionar uma coluna "Unidade" na tabela de Movimentacoes Recentes do dashboard de Inteligencia de Assinaturas, para que o gestor saiba a qual unidade cada assinatura pertence.

---

## Alteracoes

### Arquivo: `src/components/dashboard/manager/SubscriptionAnalytics.tsx`

**1. Atualizar a query para buscar o nome da unidade**
Adicionar `units(name)` no select da query principal via o campo `unit_id` que ja existe em `sale_transactions`:

```text
.select("..., units(name)")
```

**2. Atualizar a interface `SubscriptionTransaction`**
Adicionar o campo:
```text
units: { name: string } | null;
```

**3. Adicionar coluna "Unidade" na tabela**
- Novo `TableHead` com label "Unidade" entre "Data" e "Cliente"
- Novo `TableCell` exibindo `t.units?.name || "--"`

A ordem das colunas ficara: Data | Unidade | Cliente | Acao | Plano | Motivo | (editar)
