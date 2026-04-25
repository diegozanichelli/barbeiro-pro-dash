
# Forçar escolha de Atribuição + Lockdown do app do barbeiro

Dois ajustes complementares: (1) UX da recepção que não deixa esquecer de atribuir a venda; (2) remover de vez a capacidade do barbeiro lançar/editar venda no app dele — barbeiro só visualiza e confere.

---

## Parte 1 — Destaque pulsante na Atribuição (QuickSaleModal)

### Comportamento atual (problema do print)

1. Recepção digita telefone novo.
2. Sistema marca "Tipo de Cliente = Novo" automaticamente. ✓
3. **Falha:** o card "Atribuição da Venda" continua passivo, igual aos outros, e a recepção não percebe que precisa escolher Barbeiro/Recepção. O botão "Continuar" fica laranja como se estivesse pronto, mas só dá erro ao clicar.

### Comportamento novo

Logo após o cliente ser **identificado** (qualquer status: novo, recorrente, assinante) e **enquanto `attribution === null`**, o card de Atribuição da Venda recebe:

- **Anel laranja pulsante** por 3 segundos (`ring-2 ring-amber-500 animate-pulse shadow-lg shadow-amber-500/30`).
- **Auto-scroll suave** até o card (`scrollIntoView({ behavior: "smooth", block: "center" })`).
- **Pequena seta + texto** acima do ToggleGroup: *"⬇ Próximo passo: quem está atendendo?"* (cor amber, desaparece assim que o gestor clica em qualquer opção).
- O botão **Continuar** fica desabilitado e ganha tooltip *"Selecione Barbeiro ou Recepção primeiro"* enquanto `attribution === null` (já é assim hoje, mas vamos reforçar com o tooltip).

A pulsação dispara via `useEffect` que observa `clientHistory.status` ir de `idle/checking` → `phone_found | name_found | not_found`. Um state `attributionHighlight` controla a animação e é zerado quando o gestor escolhe qualquer opção do ToggleGroup ou quando o modal fecha.

### Edge cases

- **Modal aberto pelo barbeiro (já com `barberId` setado)**: `attribution` já vem como `"barber"` por default → não pulsa, não atrapalha.
- **Modal reaberto na mesma sessão**: o highlight só dispara uma vez por identificação (controlado pelo `useEffect` que reage à mudança de status, não em loop).

### Arquivo afetado

- `src/components/dashboard/manager/QuickSaleModal.tsx`
  - Novo state `attributionHighlight: boolean` e `useRef<HTMLDivElement>` para o card de Atribuição.
  - Novo `useEffect` que dispara quando `clientHistory.status` sai de checking e `attribution === null`.
  - Novo `useEffect` com `setTimeout(3000)` para parar a pulsação automaticamente.
  - Texto auxiliar acima do ToggleGroup (~linha 1497).
  - Classes condicionais no card wrapper (~linha 1494).
  - Tooltip no botão Continuar (~linha 1760).

---

## Parte 2 — Lockdown: barbeiro não lança nem edita venda

### Estado atual descoberto

Boa notícia: o `BarberDashboard.tsx` **já não importa** mais o `BarberSaleForm` nem o `BarberEditProductionModal`. A aba "Ao Vivo" do barbeiro (linha 1165) já se descreve como *"Painel somente leitura"*, e a aba "Meu Painel" terminou em uma **Central de Conferência** (linha 1118-1122) que diz literalmente *"Lançamentos são feitos pela recepção. Aqui você apenas acompanha e confirma."*

O que ainda existe e precisa ser fechado:

1. Os arquivos órfãos `BarberSaleForm.tsx` e `BarberEditProductionModal.tsx` continuam no repositório (lixo morto, risco de alguém reativar por engano).
2. A RLS atual permite ao barbeiro `UPDATE` e `DELETE` em `sale_transactions` próprias com `source='barber'` (memory `barber-transaction-edit-rls`).
3. O `DayReviewModal` permite confirmar presença/ausência — isso **continua valendo** (faz parte da conferência, não é lançamento).

### O que muda

**a) Deletar arquivos órfãos**
- Remover `src/components/dashboard/barber/BarberSaleForm.tsx`
- Remover `src/components/dashboard/barber/BarberEditProductionModal.tsx`
- Remover qualquer import residual (já confirmado: nenhum no `BarberDashboard.tsx`).

**b) Endurecer a RLS de `sale_transactions`**

Migration que **revoga** as políticas de UPDATE/DELETE do barbeiro sobre `sale_transactions`. O barbeiro continua com `SELECT` para visualizar, mas perde a permissão de modificar.

```sql
-- Revoga permissão de barbeiro mexer em transações
DROP POLICY IF EXISTS "Barbers can update own transactions" ON public.sale_transactions;
DROP POLICY IF EXISTS "Barbers can delete own transactions" ON public.sale_transactions;
```

Política de `INSERT` do barbeiro (se existir) também é revogada — todo lançamento passa pela recepção via `create_sale_and_ensure_production` (RPC já existente, executada com perfil de gestor).

**c) Reforço visual no app do barbeiro**

No topo da aba "Meu Painel", adicionar um banner informativo discreto (uma vez, sem ser intrusivo):

> *"📋 Este app é somente para acompanhamento. Todos os lançamentos são feitos pela recepção. Encontrou erro? Avise o gestor."*

Compacto, fundo `bg-muted/30`, cor `text-muted-foreground`, dispensável visualmente mas elimina dúvida.

### Arquivos afetados

- `src/components/dashboard/barber/BarberSaleForm.tsx` → **deletar**
- `src/components/dashboard/barber/BarberEditProductionModal.tsx` → **deletar**
- `src/components/dashboard/BarberDashboard.tsx` → adicionar banner read-only no topo da aba "daily"
- Nova migration SQL → revoga policies de UPDATE/DELETE/INSERT de barbeiro em `sale_transactions`

### Memory a atualizar

- `mem://security/barber-transaction-edit-rls` → atualizar para refletir o lockdown (barbeiro perde UPDATE/DELETE).
- `mem://features/barber-sale-form-catalog-only` → marcar como obsoleto/removido.
- Adicionar nova memory: *"Barbeiro é read-only — todos os lançamentos passam pela recepção via QuickSaleModal."*

---

## Resumo do que o usuário vai sentir

**Recepção (gestor):**
- Identifica o cliente → o card de "Atribuição da Venda" pulsa em laranja por 3s e a tela rola até ele.
- Impossível esquecer de marcar Barbeiro ou Recepção; o botão Continuar fica travado com tooltip explicando.

**Barbeiro:**
- Abre o app e vê um banner *"App somente para acompanhamento"*.
- Não tem mais nenhum botão de criar/editar/excluir venda em lugar nenhum — interface inteira é leitura + Conferência (presença/ausência) + Histórico.
- Tentativas via API direta falham por RLS (defesa em profundidade).

---

## Detalhes técnicos

- A pulsação usa apenas Tailwind (`animate-pulse` + classes amber existentes), sem novo CSS.
- O `scrollIntoView` é disparado dentro do `useEffect` com `requestAnimationFrame` para esperar o layout estabilizar.
- A migration de RLS é idempotente (`DROP POLICY IF EXISTS`) — segura para rodar mesmo se policies já não existirem.
- Nenhuma RPC muda. Nenhum dado existente é afetado. Vendas antigas com `source='barber'` permanecem intactas, só não podem mais ser editadas pelo próprio barbeiro (gestor continua podendo via TransactionManagerModal).
- Os arquivos deletados são órfãos confirmados via grep (`rg -n "BarberSaleForm" src/` retorna apenas o próprio arquivo).
