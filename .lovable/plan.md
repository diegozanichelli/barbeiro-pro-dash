

# Plano: Aprimorar Modal de Assinatura com Detalhes para Auditoria

## Objetivo

Transformar o modal de confirmação de assinatura de um simples "Sim/Não" para um formulário que coleta informações essenciais para auditoria e controle gerencial.

---

## Alterações Necessárias

### 1. Banco de Dados - Adicionar Coluna `description`

A tabela `sale_transactions` atualmente **não possui** uma coluna para descrição/observações. Precisamos criá-la:

| Coluna | Tipo | Nullable | Descrição |
|--------|------|----------|-----------|
| `description` | TEXT | YES | Observações da venda (nome do cliente, forma de pagamento, etc) |

**SQL da Migration:**
```sql
ALTER TABLE sale_transactions 
ADD COLUMN description TEXT;

COMMENT ON COLUMN sale_transactions.description IS 'Observações da transação (nome do cliente, detalhes, etc)';
```

---

### 2. Alteração do SubscriptionConfirmModal

**Estado Atual:**
- Modal com 2 botões: "Não" e "Sim, Vendi uma Assinatura"
- Salva `item_name: "Venda de Assinatura"` (genérico)

**Novo Fluxo:**

```text
┌────────────────────────────────────────────────────────┐
│           Esta venda incluiu uma Assinatura?          │
├────────────────────────────────────────────────────────┤
│                                                        │
│  [Etapa 1: Pergunta inicial]                          │
│                                                        │
│  Botão [Não]           Botão [Sim, Incluiu]           │
│                              │                         │
│                              ▼                         │
│  [Etapa 2: Formulário de Detalhes]                    │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Qual o plano vendido? *                         │  │
│  │ [________________________]                      │  │
│  │ Ex: Gold, Prata, Duo...                         │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Nome do Cliente / Obs *                         │  │
│  │ [________________________]                      │  │
│  │ Nome do cliente para conferência               │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  Botão [Voltar]        Botão [Confirmar Assinatura]   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Campos do Formulário:**

| Campo | Label | Placeholder | Obrigatório |
|-------|-------|-------------|-------------|
| `subscriptionPlan` | Qual o plano vendido? | Ex: Gold, Prata, Duo... | Sim |
| `clientNotes` | Nome do Cliente / Obs | Nome do cliente para conferência | Sim |

---

### 3. Lógica de Salvamento

**Antes:**
```typescript
item_name: "Venda de Assinatura",
// Sem campo description
```

**Depois:**
```typescript
item_name: `Assinatura ${subscriptionPlan}`,  // Ex: "Assinatura Gold"
description: clientNotes,                      // Ex: "Cliente João Silva - Pago no Pix"
```

---

## Resumo das Mudanças

| Arquivo/Recurso | Alteração |
|-----------------|-----------|
| **Banco de Dados** | Adicionar coluna `description` (TEXT, nullable) |
| **SubscriptionConfirmModal.tsx** | Adicionar formulário com 2 inputs obrigatórios e fluxo de 2 etapas |
| **types.ts** | Será atualizado automaticamente após migração |

---

## Resultado Esperado

### No Registro do Banco:
```json
{
  "item_type": "subscription",
  "item_name": "Assinatura Black",
  "description": "Cliente João Silva - Pago no Pix",
  "barber_id": "...",
  "price_sold": 0
}
```

### No Relatório de Assinaturas (futuro):
| Barbeiro | Plano | Cliente/Obs | Data |
|----------|-------|-------------|------|
| Carlos | Assinatura Black | Cliente João Silva - Pago no Pix | 03/02/2026 |
| Werlen | Assinatura Gold | Maria Souza | 02/02/2026 |

---

## Seção Técnica

### Estrutura do Componente Atualizado

```typescript
// Estados adicionais
const [step, setStep] = useState<"question" | "form">("question");
const [subscriptionPlan, setSubscriptionPlan] = useState("");
const [clientNotes, setClientNotes] = useState("");

// Validação
const isFormValid = subscriptionPlan.trim().length > 0 && clientNotes.trim().length > 0;

// Fluxo
// 1. Usuário clica "Sim" → setStep("form")
// 2. Preenche os campos obrigatórios
// 3. Clica "Confirmar" → salva com dados detalhados
// 4. Botão "Voltar" → setStep("question")
```

### Reset ao Fechar

```typescript
// Ao fechar ou completar, resetar estados
const resetModal = () => {
  setStep("question");
  setSubscriptionPlan("");
  setClientNotes("");
};
```

### Atualização do TypeScript Types

Após a migração, o campo `description` será reconhecido automaticamente no tipo da tabela `sale_transactions`.

