
# Fix: Scroll na Lista de Transacoes do Modal "Gerenciar Producao"

## Problema

O modal "Gerenciar Producao" mostra "Total (10 itens)" mas apenas 4 sao visiveis. O conteudo ultrapassa a area do modal sem ativar o scroll. Isso ocorre na view de lista (transacoes existentes), nao na view de adicionar itens (que ja foi corrigida).

## Causa Raiz

O container da lista (linha 445) usa `flex-1` mas falta `min-h-0`. Em flexbox, itens com `flex-1` nao encolhem abaixo do tamanho do conteudo por padrao (`min-height: auto`). O `ScrollArea` interno nao consegue calcular a altura disponivel e nao ativa a barra de rolagem.

## Correcao

**Arquivo:** `src/components/dashboard/manager/TransactionManagerModal.tsx`

**Linha 445:**

```text
ANTES: <div className="flex-1 flex flex-col overflow-hidden">
DEPOIS: <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
```

Uma unica alteracao de uma linha. O `min-h-0` permite que o container flex encolha, fazendo o `ScrollArea` (linha 459) funcionar corretamente com scroll.
