

# Fix: Scroll na lista de transacoes do modal "Gerenciar Producao"

## Problema

Mesmo apos adicionar `min-h-0` no container pai, o `ScrollArea` do Radix nao ativa a barra de rolagem porque ele precisa de uma **altura definida** (nao apenas `flex-1`) para calcular o overflow internamente.

## Causa Raiz

O componente `ScrollArea` do Radix UI calcula o scroll baseado na altura do seu container. Quando recebe apenas `flex-1`, ele expande junto com o conteudo em vez de restringir a area visivel. E necessario combinar `flex-1` com `h-0` (ou `min-h-0`) para forcar uma altura base de 0 e deixar o flex preencher o espaco disponivel.

## Correcao

**Arquivo:** `src/components/dashboard/manager/TransactionManagerModal.tsx`

### Alteracao 1 - ScrollArea (linha 459)

Adicionar `min-h-0` ao ScrollArea para que ele respeite o limite do container flex:

```text
ANTES:  <ScrollArea className="flex-1 px-6 py-4">
DEPOIS: <ScrollArea className="flex-1 min-h-0 px-6 py-4">
```

### Alteracao 2 - Fallback com overflow nativo

Caso o Radix ScrollArea continue sem funcionar (comportamento conhecido em certos layouts flex), substituir por um div com scroll nativo:

```text
ANTES:  <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-2">...</div>
        </ScrollArea>

DEPOIS: <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="space-y-2">...</div>
        </div>
```

A abordagem recomendada e a **Alteracao 2** (div nativo), pois e mais confiavel em contextos de flexbox aninhado e elimina a dependencia do calculo interno do Radix ScrollArea.

## Arquivo modificado

| Arquivo | Linha | Alteracao |
|---------|-------|-----------|
| `TransactionManagerModal.tsx` | ~459 | Substituir `ScrollArea` por `div` com `overflow-y-auto` |

## Resultado

Todos os itens da lista de transacoes serao acessiveis via scroll, mesmo quando houver 10+ itens no modal.

