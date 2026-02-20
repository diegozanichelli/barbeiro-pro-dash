
# Exibir Dados Legados no Modal "Gerenciar Producao"

## Problema

Barbeiros que lancaram producao pelo formulario manual antigo (campos de totais) gravaram dados apenas na tabela `daily_productions`, sem criar registros individuais em `sale_transactions`. Quando o gestor abre o modal "Auditar Producao" (TransactionManagerModal), ele busca somente em `sale_transactions` e encontra zero registros -- mostrando "Nenhuma transacao registrada", mesmo havendo faturamento e comissao na tabela de producoes.

Isso afeta todas as barbearias cujos barbeiros usaram o formulario manual, nao apenas a Chezz.

## Solucao

Quando o modal abrir em modo auditoria (`auditMode=true`), detectar se existem zero transacoes mas o `daily_productions` correspondente tem valores. Nesse caso, exibir um card informativo com os totais legados, orientando o gestor a adicionar itens retroativos se desejar corrigir.

## Alteracao

**Arquivo:** `src/components/dashboard/manager/TransactionManagerModal.tsx`

### 1. Buscar dados legados do daily_productions

Apos o `fetchTransactions` retornar vazio em modo auditoria, buscar o registro de `daily_productions` correspondente (usando `barberId` e `date`) para verificar se ha valores de producao.

### 2. Exibir card informativo quando houver dados legados

No bloco que hoje mostra "Nenhuma transacao registrada" (linhas 450-457), adicionar uma condicao: se existem dados legados (totais > 0), mostrar um card amarelo com:

- Titulo: "Producao lancada pelo formulario manual"
- Os totais existentes: Servicos Basicos, Servicos Extras, Produtos, Comissao
- Mensagem: "Este lancamento foi feito pelo formulario antigo (valores totais). Para detalhar os itens, use o botao abaixo."

Se nao houver dados legados, manter a mensagem atual "Nenhuma transacao registrada".

### 3. Botao "Adicionar Item Retroativo" permanece disponivel

O gestor podera adicionar itens do catalogo normalmente. Ao salvar, o trigger existente recalcula o `daily_productions` automaticamente.

## Secao Tecnica

### Novo estado

```text
legacyProduction: { servicesBasic: number, servicesExtra: number, products: number, commission: number } | null
```

### Busca condicional

Disparada quando `transactions.length === 0 && auditMode && date && barberId`, consultando:

```text
daily_productions WHERE barber_id = X AND date = Y
```

### Renderizacao condicional (bloco vazio, linhas 450-457)

```text
Se transactions.length === 0:
  Se legacyProduction com valores > 0:
    -> Card amarelo com totais legados + mensagem explicativa
  Senao:
    -> Mensagem atual "Nenhuma transacao registrada"
```

### Arquivos modificados

| Arquivo | Acao |
|---------|------|
| `TransactionManagerModal.tsx` | Adicionar estado legacyProduction, busca em daily_productions, card informativo |
