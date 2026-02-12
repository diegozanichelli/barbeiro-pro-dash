
# Substituir Modal de Edicao Manual por Cards de Catalogo (ManagerReports)

## Problema

O modal "Editar Lancamento" no relatorio do gestor (`ManagerReports.tsx`, linhas 638-700) ainda usa inputs manuais (Total Servicos, Total Produtos, Qtd Servicos, etc.). Isso permite que o gestor insira valores avulsos que nao geram transacoes itemizadas, quebrando a integridade dos dados e o calculo de comissao.

## Solucao

Remover o modal antigo de inputs manuais e substituir pelo `TransactionManagerModal` existente, **porem com uma adaptacao critica**: as transacoes inseridas devem usar `source='barber'` (nao `source='manager'`), pois a edicao do gestor nesta tela de Relatorios/Auditoria e uma correcao da producao do barbeiro, nao um lancamento de caixa.

## Alteracoes

### 1. ManagerReports.tsx - Remover modal antigo

- Remover o state `editForm` (linhas 67-73) e a funcao `handleSaveEdit` (linhas 257-290)
- Remover todo o bloco `<Dialog>` do modal antigo (linhas 638-701)

### 2. ManagerReports.tsx - Adicionar TransactionManagerModal adaptado

- Importar o componente `TransactionManagerModal`
- Alterar `handleEdit` para abrir o `TransactionManagerModal` com os dados da producao selecionada (barberId, dailyProductionId, date, organizationId)
- Adaptar o state `editingProduction` para passar as props necessarias

### 3. TransactionManagerModal.tsx - Suportar modo "auditoria"

Adicionar uma prop `auditMode?: boolean` ao `TransactionManagerModal`:

- Quando `auditMode=true`:
  - O modal lista transacoes de `source='barber'` (em vez de `source='manager'`)
  - Ao adicionar novos itens, salva com `source='barber'`
  - O titulo muda para "Auditar Producao" em vez de "Gerenciar Producao"
  - A logica de "Limpar e Substituir" usa `source='barber'`
  
- Quando `auditMode=false` (padrao): comportamento atual mantido (gestao de caixa com `source='manager'`)

### 4. Fluxo de Auditoria

Quando o gestor clica em "Editar" no relatorio:
1. Abre o `TransactionManagerModal` em modo auditoria
2. Mostra os itens atuais do barbeiro (`source='barber'`)
3. O gestor pode excluir itens ou adicionar novos via cards
4. Ao salvar, os itens sao gravados com `source='barber'`
5. O trigger `recalculate_daily_production_from_transactions` recalcula automaticamente `services_basic_total`, `services_extra_total`, `products_total`
6. O trigger `calculate_commission` recalcula a comissao usando apenas os campos do barbeiro

## Secao Tecnica

| Arquivo | Alteracao |
|---|---|
| `src/components/dashboard/manager/ManagerReports.tsx` | Remove modal antigo de inputs, importa e usa `TransactionManagerModal` com `auditMode=true` |
| `src/components/dashboard/manager/TransactionManagerModal.tsx` | Adiciona prop `auditMode` que altera o `source` filtrado/inserido de `'manager'` para `'barber'` |

### Detalhes da prop `auditMode` no TransactionManagerModal

```text
// Linhas afetadas no TransactionManagerModal.tsx:

// 1. Interface - adicionar auditMode?: boolean
// 2. fetchTransactions (linha 139): .eq("source", auditMode ? "barber" : "manager")
// 3. handleAddItems (linha 312): source nao precisa ser definido aqui pois o trigger ja infere,
//    mas para consistencia: source = auditMode ? "barber" : "manager" (nao definido = default 'manager')
// 4. Titulo (linhas 417-419): auditMode ? "Auditar Producao" : "Gerenciar Producao"
```

### Detalhes da integracao no ManagerReports

```text
// Estado necessario para o TransactionManagerModal:
// - barberId: editingProduction.barber_id
// - barberName: obter do array 'barbers' filtrando por id
// - organizationId: obter do hook ou contexto
// - dailyProductionId: editingProduction.id
// - date: editingProduction.date

// A funcao handleEdit muda de preencher form manual para apenas setar editingProduction
// O componente TransactionManagerModal cuida do resto
```

## O que NAO muda

- O `TransactionManagerModal` no painel "AO VIVO" continua funcionando com `source='manager'` (padrao)
- O `BarberEditProductionModal` do barbeiro continua funcionando normalmente
- O botao de excluir producao no relatorio continua igual
