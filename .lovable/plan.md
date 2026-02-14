

# Fix: Adicionar barra de scroll na tabela do modal "Auditoria de Assinaturas"

## Problema

O modal `SubscriptionAuditModal` usa `overflow-y-auto` no `DialogContent` inteiro, mas a tabela de transacoes nao tem uma restricao de altura propria. Isso faz com que o modal inteiro role, sem uma barra de scroll visivel na area da lista.

## Solucao

Aplicar a mesma tecnica usada no `TransactionManagerModal`: envolver a `Table` em um `div` com `max-h-[50vh] overflow-y-auto`.

## Alteracao

**Arquivo:** `src/components/dashboard/manager/SubscriptionAuditModal.tsx`

**Linha 199 (onde comeca a `<Table>`):**

```text
ANTES:
          <Table>
            <TableHeader>
              ...
            </TableBody>
          </Table>

DEPOIS:
          <div className="max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader>
                ...
              </TableBody>
            </Table>
          </div>
```

Apenas envolve a tabela existente em um container com altura maxima fixa. O header e titulo do modal ficam sempre visiveis acima.
