

# Correção no Fluxo de Fechamento de Assinatura

## Situação Atual
O Wizard de Assinaturas (`SubscriptionWizardModal`) **ja bloqueia** a progressão se o gestor não escolher "Recepção" ou "Barbeiro", e já resolve automaticamente a unidade do barbeiro selecionado. Porém existem dois problemas reais:

1. **Bug de segurança**: A lista de unidades (para Recepção) não filtra por `organization_id` -- pode mostrar unidades de outras organizações
2. **Falta de feedback visual**: Quando o barbeiro é selecionado, o gestor não vê qual unidade será atribuída à assinatura, o que gera insegurança

## Correções

### 1. Filtrar unidades por organização
Na query de unidades (linha 92), adicionar `.eq("organization_id", organizationId)` para mostrar apenas as unidades da organização do gestor.

### 2. Mostrar unidade do barbeiro selecionado
Ao selecionar um barbeiro no passo 2 (Atribuição), exibir abaixo do seletor um badge informativo tipo:
"Unidade: Centro" -- mostrando que a assinatura será direcionada para aquela unidade automaticamente.

Essa informação já está disponível no `BarberCombobox` (o campo `unit_name` aparece abaixo do nome do barbeiro na lista), mas ao fechar o combobox, a informação se perde.

### 3. Limpar `SubscriptionConfirmModal` (código morto)
O componente antigo `SubscriptionConfirmModal.tsx` não é mais importado em nenhum lugar. Pode ser removido para evitar confusão futura.

---

## Detalhes Técnicos

### Arquivo a modificar
- `src/components/dashboard/manager/SubscriptionWizardModal.tsx`

### Mudanças no código

**Query de unidades (linha 92):**
Adicionar filtro por organização:
```text
supabase.from("units").select("id, name")
  .eq("organization_id", organizationId)
  .eq("status", "active")
  .order("name")
```

**Feedback visual do barbeiro selecionado (passo 2):**
Após o `BarberCombobox`, quando `selectedBarberId` estiver preenchido, buscar o nome da unidade do barbeiro e exibir um texto informativo como:
```text
"Assinatura será registrada na unidade: [Nome da Unidade]"
```

Para isso, salvar o `unit_name` junto ao `selectedBarberId` (usando os dados já disponíveis no `BarberCombobox`, ou fazendo uma consulta rápida ao selecionar).

### Arquivo a remover (opcional)
- `src/components/dashboard/barber/SubscriptionConfirmModal.tsx` -- código morto, não é mais usado

