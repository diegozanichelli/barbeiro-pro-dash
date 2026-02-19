

# Restaurar Nome do Cliente no Modal "Gerenciar Producao"

## Problema

O modal "Gerenciar Producao" (componente `TransactionManagerModal.tsx`) busca o campo `client_name` da tabela `sale_transactions` (linha 143), mas nao o exibe na lista de transacoes. Anteriormente esse nome aparecia, mas foi perdido em alguma refatoracao visual.

## Solucao

Adicionar o `client_name` na linha de cada transacao, exibido como texto secundario ao lado do preco e comissao.

## Alteracao

**Arquivo:** `src/components/dashboard/manager/TransactionManagerModal.tsx`

**Local:** Bloco de renderizacao de cada transacao (linhas 468-481)

Adicionar o nome do cliente logo abaixo do nome do item, antes da linha de preco/comissao. Se `client_name` existir, exibi-lo com um icone de usuario ou simplesmente como texto em destaque sutil.

**Antes:**
```
<p className="text-xs text-muted-foreground">
  R$ 80,00 · Comissao: R$ 30,40
</p>
```

**Depois:**
```
{transaction.client_name && (
  <p className="text-xs text-muted-foreground/80">
    Cliente: {transaction.client_name}
  </p>
)}
<p className="text-xs text-muted-foreground">
  R$ 80,00 · Comissao: R$ 30,40
</p>
```

O nome do cliente aparecera entre o nome do servico e a linha de valores, apenas quando houver um nome registrado.

