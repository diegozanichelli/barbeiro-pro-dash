
# Acesso Rapido de Auditoria de Assinaturas no Painel Ao Vivo

## Resumo
Adicionar um botao de auditoria (icone Olho) ao lado do botao "Vender Assinatura" no painel Ao Vivo, que abre um modal compacto listando as ultimas 20 vendas de assinatura com edicao rapida inline.

---

## Alteracoes

### 1. Novo Componente: `src/components/dashboard/manager/SubscriptionAuditModal.tsx`

Modal Dialog contendo:
- Query das ultimas 20 `sale_transactions` com `item_type = 'subscription'` da organizacao, ordenadas por `created_at DESC`
- Join com `barbers(name)`, `subscription_plans(name)`, `units(name)` para exibir dados completos
- Tabela compacta com colunas: Hora, Cliente, Plano, Vendedor, Valor, Editar
- Ao clicar em Editar (icone Pencil), abre uma linha expandida inline ou sub-modal com:
  - **Vendedor**: Dropdown usando `BarberCombobox` (permite trocar de Recepcao para Barbeiro X)
  - **Plano**: Dropdown com planos ativos da organizacao
  - **Valor**: Input numerico para ajuste fino do `price_sold`
- Ao salvar, atualiza `sale_transactions` (campos: `barber_id`, `subscription_plan_id`, `item_name`, `price_sold`, `unit_id`) e recarrega a lista
- O campo `description` (nome do cliente) sera exibido na coluna Cliente

### 2. Alteracao: `src/components/dashboard/manager/LiveDashboard.tsx`

- Adicionar estado `subscriptionAuditOpen` (boolean)
- Adicionar botao Ghost/Outline com icone `Eye` ao lado do botao "Vender Assinatura" (linha ~592)
- Tooltip "Auditar Ultimas Vendas" usando `TooltipProvider`
- Renderizar `SubscriptionAuditModal` passando `organizationId` e callback de refresh

---

## Detalhes Tecnicos

### Query do Modal de Auditoria
```text
supabase
  .from("sale_transactions")
  .select("*, barbers(name), subscription_plans(name, price), units(name)")
  .eq("organization_id", organizationId)
  .eq("item_type", "subscription")
  .order("created_at", { ascending: false })
  .limit(20)
```

### Logica de Edicao Inline
Quando o gestor clica em Editar:
1. Estado `editingId` armazena o ID da transacao sendo editada
2. A linha da tabela exibe inputs em vez de texto
3. Campo Vendedor: `BarberCombobox` com `allowReception=true` para permitir selecionar "Recepcao" ou um barbeiro
4. Campo Plano: `Select` com planos ativos
5. Campo Valor: `Input type="number"` pre-preenchido com `price_sold`
6. Ao salvar: update em `sale_transactions` com os novos valores, incluindo atualizacao de `unit_id` (herdado do barbeiro selecionado) e `item_name` (prefixo "Assinatura" + nome do plano)

### Fluxo do Gestor
```text
Painel Ao Vivo -> Clica no Olho -> Modal abre com ultimas 20 vendas
-> Ve que "Joao" foi atribuido a "Recepcao" -> Clica no Lapis
-> Troca vendedor para "Ageu" -> Salvar -> Lista atualiza -> Fechar
```

### Componentes Reutilizados
- `BarberCombobox` (ja existente, suporta busca e selecao de barbeiro)
- `Dialog`, `Table`, `Select`, `Input`, `Button`, `Tooltip` (UI primitivos existentes)
