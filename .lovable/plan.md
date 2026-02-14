

# Fix: Forcar barra de scroll na lista de transacoes

## Problema

A area de transacoes usa `flex-1 min-h-0 overflow-y-auto`, mas como o conteudo e pequeno (1-4 itens), o flex nao restringe a altura e o scroll nunca aparece. Mesmo com muitos itens, a cadeia de flex containers nao propaga a restricao de altura corretamente.

## Solucao

Substituir a abordagem flex por uma **altura maxima fixa** no container scrollavel. Isso garante que o scroll apareca sempre, independente da quantidade de itens.

## Alteracao

**Arquivo:** `src/components/dashboard/manager/TransactionManagerModal.tsx`

**Linha 459:**

```text
ANTES:  <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
DEPOIS: <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
```

**Linha 445 (container pai):** Remover `flex-1 min-h-0` pois nao e mais necessario com altura fixa:

```text
ANTES:  <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
DEPOIS: <div className="flex-1 flex flex-col overflow-hidden">
```

Com `max-h-[50vh]`, a lista ocupa no maximo metade da tela, deixando espaco para header e footer. A barra de scroll aparece assim que o conteudo ultrapassar esse limite, mesmo com poucos itens o container fica bem dimensionado.

## Resultado

- Scroll funcional com qualquer quantidade de itens
- Header (titulo) e footer (total + botao) sempre visiveis
- Compativel com mobile e desktop

