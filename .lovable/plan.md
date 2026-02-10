
# Editar Movimentacoes de Assinatura na Aba Inteligencia

## Resumo
Adicionar um botao de edicao em cada linha da tabela "Movimentacoes Recentes" no `SubscriptionAnalytics.tsx`. Ao clicar, abre um modal compacto que permite ao gestor corrigir/complementar os dados de assinaturas antigas (principalmente as cadastradas antes do novo Wizard).

---

## O Problema
Transacoes de assinatura registradas antes da implementacao do Wizard nao possuem:
- `subscription_action` (new/renew/upgrade/downgrade)
- `subscription_plan_id` (vinculo ao plano do catalogo)
- `downgrade_reason` (motivo, quando aplicavel)
- `client_name` (nome do cliente)

Sem esses campos, os cards de resumo, graficos e metricas ficam incompletos.

---

## Solucao: Modal de Edicao de Assinatura

### Novo componente: `SubscriptionEditModal.tsx`
Um modal simples (Dialog) que recebe uma transacao e permite editar:

1. **Nome do Cliente** -- Input de texto
2. **Acao** -- Select com as 4 opcoes (Nova / Renovacao / Upgrade / Downgrade)
3. **Plano** -- Select buscando planos ativos de `subscription_plans`
4. **Motivo do Downgrade** -- Textarea, visivel apenas quando acao = "downgrade"

Ao salvar, faz UPDATE na `sale_transactions` com os campos corrigidos.

### Alteracoes no `SubscriptionAnalytics.tsx`
- Adicionar coluna "Acoes" na tabela com um botao de edicao (icone de lapis) em cada linha
- Ao clicar, abre o `SubscriptionEditModal` com os dados atuais da transacao pre-preenchidos
- Apos salvar com sucesso, recarrega os dados (chama `fetchData()` novamente)

---

## Detalhes Tecnicos

### Arquivos a criar
- `src/components/dashboard/manager/SubscriptionEditModal.tsx`

### Arquivos a modificar
- `src/components/dashboard/manager/SubscriptionAnalytics.tsx` -- adicionar botao de edicao e state do modal

### Interface do Modal
```text
+----------------------------------+
|  Editar Movimentacao             |
|                                  |
|  Nome do Cliente: [__________]   |
|  Acao:  [v Nova          ]       |
|  Plano: [v Plano Mensal  ]       |
|  Motivo: [_______________]       |
|  (so aparece se acao=downgrade)  |
|                                  |
|         [Cancelar]  [Salvar]     |
+----------------------------------+
```

### Query de UPDATE
```text
supabase
  .from("sale_transactions")
  .update({
    client_name,
    subscription_action,
    subscription_plan_id,
    downgrade_reason,
    item_name: `Assinatura ${planName}`  // atualiza o nome do item tambem
  })
  .eq("id", transactionId)
```

### Seguranca
- A RLS existente ja permite que managers facam UPDATE em `sale_transactions` da sua organizacao
- Nenhuma alteracao de banco necessaria

### Remocao do limite de 10 linhas
- Trocar `transactions.slice(0, 10)` por paginacao simples ou scroll, para que o gestor consiga acessar todos os registros antigos do periodo selecionado
