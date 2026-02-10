
# Corrigir Edicao de Comanda do Barbeiro pelo Gestor

## Problema Identificado

Na funcao `handleEditClick` do `LiveDashboard.tsx` (linha 315), o codigo usa `.single()` para buscar a producao diaria do barbeiro. Quando nao existe producao para aquele barbeiro naquela data, o `.single()` lanca um erro do PostgREST que impede o modal de abrir. O gestor ve "Nenhuma producao encontrada para editar" e nao consegue prosseguir.

**Diferenca critica:** o `handleViewTransactions` (linha 336) ja usa `.maybeSingle()` corretamente, mas o `handleEditClick` nao.

Alem disso, quando o gestor navega para um dia sem producao registrada (ex: barbeiro novo ou dia retroativo), nao existe `daily_production` e o modal nunca abre -- o gestor nao consegue editar.

## Solucao

### 1. Trocar `.single()` por `.maybeSingle()` no `handleEditClick`

No arquivo `src/components/dashboard/manager/LiveDashboard.tsx`, linha 315:
- Trocar `.single()` por `.maybeSingle()`

### 2. Criar producao automaticamente se nao existir

Quando o gestor tenta editar a comanda de um barbeiro e nao existe `daily_production` para aquele dia:
- Criar automaticamente um registro de `daily_production` com valores zerados
- Usar o ID gerado para abrir o `TransactionManagerModal`
- Isso permite que o gestor adicione itens retroativos mesmo sem producao previa

### 3. Fluxo corrigido

```text
Gestor clica "Editar" no card do barbeiro
  -> Busca daily_production com .maybeSingle()
  -> Se existe: abre o modal com o ID existente
  -> Se NAO existe: cria nova daily_production zerada, usa o novo ID
  -> Modal abre normalmente em ambos os casos
  -> Gestor adiciona/remove itens
  -> Trigger recalcula totais automaticamente
```

## Arquivo Alterado

- `src/components/dashboard/manager/LiveDashboard.tsx` -- funcao `handleEditClick` (linhas 308-328)
