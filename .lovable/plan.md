
# Plano: Registrar Atendimentos de Assinatura (Trabalho sem Venda)

## Contexto do Problema

Atualmente, quando o barbeiro clica em **"Não vendi nada hoje"**, o sistema registra:
- `clients_count: 0`
- `confirmed_presence: true`

Porém, o cenário real é diferente: o barbeiro pode ter **atendido 10 clientes de assinatura** que já pagaram a mensalidade. Esses atendimentos representam **trabalho realizado** e devem ser contabilizados para métricas de produtividade (ranking por clientes atendidos), mesmo que o faturamento direto seja R$ 0,00.

---

## Solução Proposta

Evoluir o fluxo de **"Confirmar Presença"** para perguntar **quantos clientes de assinatura foram atendidos**.

### Fluxo de UX

1. Barbeiro clica em **"Não vendi nada hoje"**
2. Abre um **mini modal** perguntando:
   - "Quantos clientes de assinatura você atendeu hoje?"
   - Input numérico (default: 0)
3. Ao confirmar:
   - Sistema registra `confirmed_presence: true`
   - Sistema registra `clients_count: [valor informado]`
   - Opcionalmente: criar transações de "Atendimento Assinatura" para rastreio da IA

---

## Implementação Técnica

### 1. Criar Componente de Modal (`ConfirmPresenceModal.tsx`)

```text
src/components/dashboard/barber/ConfirmPresenceModal.tsx (NOVO)
```

**Estrutura:**
- Dialog/Modal simples
- Título: "Confirmar Presença"
- Descrição: "Você trabalhou hoje mas não teve vendas diretas. Registre quantos clientes de assinatura atendeu para contabilizar o dia."
- Input numérico: "Clientes de assinatura atendidos"
- Botões: "Cancelar" e "Confirmar"

### 2. Atualizar Função `handleConfirmPresence`

**Arquivo:** `src/components/dashboard/BarberDashboard.tsx`

**Mudanças:**
- Remover chamada direta ao clicar no botão
- Abrir o modal de confirmação
- Passar o número de clientes informado para a função de salvamento
- Atualizar o INSERT/UPDATE para usar o `clients_count` do modal

```typescript
// Antes (linha 452):
clients_count: 0,

// Depois:
clients_count: subscriptionClientsCount, // valor vindo do modal
```

### 3. (Opcional) Registrar Transações para Rastreio da IA

Para manter a inteligência da IA sobre "o que foi feito", podemos criar transações simbólicas:

```text
Item: "Atendimento Assinatura"
Tipo: service
Categoria: basic
Valor: R$ 0,00
Quantidade: [número informado pelo barbeiro]
```

**Benefício:** A IA conseguirá ver que o barbeiro atendeu X clientes de assinatura naquele dia, mesmo sem faturamento.

**Desvantagem:** Aumenta complexidade. Se o gestor não quiser esse nível de rastreio, podemos pular essa etapa.

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/components/dashboard/barber/ConfirmPresenceModal.tsx` | Criar novo componente |
| `src/components/dashboard/BarberDashboard.tsx` | Integrar modal e atualizar lógica |

---

## Detalhes Técnicos

### Estado do Modal

```typescript
const [presenceModal, setPresenceModal] = useState<{
  open: boolean;
  clientsCount: number;
}>({ open: false, clientsCount: 0 });
```

### Validação

- Aceitar valores de 0 até 100 (limite razoável)
- Se informar 0, comportamento igual ao atual (só confirma presença)
- Se informar > 0, registra os clientes atendidos

### Feedback Visual

Após confirmar, mostrar mensagem contextual:
- Se `clients_count = 0`: "Dia contabilizado. Foco total amanhã!"
- Se `clients_count > 0`: "Registrado! Você atendeu X clientes de assinatura hoje."

---

## Resultado Esperado

- O barbeiro pode informar que **trabalhou** mesmo sem vender
- O número de **clientes de assinatura atendidos** é contabilizado
- O dia é contado para o cálculo de **meta diária** (dias trabalhados)
- As métricas de **produtividade por cliente** ficam mais precisas
