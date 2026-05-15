## Blindagem de telefone obrigatório — guards no frontend

Os triggers de banco já bloqueiam `is_new_client=true` ou `subscription_action='new'` sem `mobile_phone`. Falta blindar o frontend para mostrar mensagem amigável **antes** do `RAISE EXCEPTION` aparecer como erro Postgres bruto.

### Pontos de inserção/edição que disparam o trigger

Mapeei os fluxos que gravam em `sale_transactions` com `is_new_client` ou `subscription_action='new'`:

1. **`QuickSaleModal.tsx`** — POS principal do gestor/recepção (vende serviço/produto/assinatura, marca cliente novo)
2. **`SubscriptionWizardModal.tsx`** — wizard de nova adesão (sempre `action='new'`)
3. **`SubscriptionAuditModal.tsx`** — edição rápida das últimas 20 assinaturas (pode editar uma adesão `new`)
4. **`SubscriptionEditModal.tsx`** — edição completa de assinatura
5. **`TransactionManagerModal.tsx`** — modo auditoria do gestor (substitui transações do barbeiro)
6. **`DayReviewModal.tsx`** — *NÃO* insere `is_new_client` nem assinatura (só confirma presença e limpa source=barber). Sem risco direto, mas vou adicionar um guard defensivo se algum dia voltar a inserir.

### Plano de blindagem

#### 1. Helper compartilhado `src/lib/saleGuards.ts`

Centraliza a regra para evitar duplicação:

```ts
import { isValidPhone, sanitizePhone } from "@/lib/phoneUtils";

export function assertPhoneForNewClient(opts: {
  isNewClient?: boolean;
  subscriptionAction?: string | null;
  mobilePhone?: string | null;
}): { ok: true } | { ok: false; message: string };
```

Regra: se `isNewClient === true` **ou** `subscriptionAction === 'new'`, exige `mobilePhone` válido (`isValidPhone`). Mensagens em pt-BR:
- "Cliente novo precisa de telefone válido (11 dígitos com DDD)."
- "Nova adesão de assinatura precisa de telefone válido."

#### 2. `QuickSaleModal.tsx`

- No `handleSubmit`, antes do insert, chamar `assertPhoneForNewClient` para cada item do carrinho que tenha `is_new_client=true` ou for assinatura `new`.
- Se falhar: `toast.error(message)`, focar no campo de telefone, abortar.

#### 3. `SubscriptionWizardModal.tsx`

- Como toda venda do wizard é `action='new'`, validar telefone obrigatório no step de cliente (já tem campo, mas torná-lo bloqueante via `isValidPhone` antes de avançar para o step final).
- Mensagem de erro inline + toast.

#### 4. `SubscriptionAuditModal.tsx`

- Adicionar campo `mobile_phone` editável (com máscara via `formatPhone`) **só quando** `tx.subscription_action === 'new'` e `tx.mobile_phone` estiver vazio (legacy).
- No `handleSave`, se `subscription_action === 'new'` e telefone inválido → bloquear com toast amigável.
- Mostrar badge "⚠️ sem telefone" nas linhas legacy para o gestor identificar.

#### 5. `SubscriptionEditModal.tsx`

- Mesma regra do AuditModal: campo telefone obrigatório quando `action='new'`.

#### 6. `TransactionManagerModal.tsx`

- Validar antes do insert em lote: qualquer linha com `is_new_client=true` precisa de telefone válido. Se faltar, mostrar resumo dos itens problemáticos antes de tentar gravar.

#### 7. Tratamento genérico de erro do trigger

Em todos os `catch` dos handlers acima, traduzir mensagens Postgres conhecidas:

```ts
function translateSaleError(error: unknown): string {
  const msg = String((error as any)?.message ?? "");
  if (msg.includes("mobile_phone") && msg.includes("new client"))
    return "Telefone obrigatório para cliente novo.";
  if (msg.includes("mobile_phone") && msg.includes("subscription"))
    return "Telefone obrigatório para nova adesão.";
  return msg || "Erro ao salvar venda.";
}
```

### Arquivos a editar

- **Novo:** `src/lib/saleGuards.ts`
- `src/components/dashboard/manager/QuickSaleModal.tsx`
- `src/components/dashboard/manager/SubscriptionWizardModal.tsx`
- `src/components/dashboard/manager/SubscriptionAuditModal.tsx`
- `src/components/dashboard/manager/SubscriptionEditModal.tsx`
- `src/components/dashboard/manager/TransactionManagerModal.tsx`

### Fora deste escopo (já cobertos por DB)

- Backfill de `unit_id` e `mobile_phone` (migration anterior)
- Trigger `trg_enforce_mobile_phone_for_new_clients` (já ativo)
- `DayReviewModal` — não insere `is_new_client`, sem mudança necessária

### Validação após implementar

1. Tentar criar venda com `cliente novo` sem telefone no QuickSale → deve mostrar toast amigável, não erro Postgres
2. Tentar editar adesão legacy sem telefone no AuditModal → campo aparece, validação bloqueia
3. Wizard de assinatura sem telefone → step bloqueia avançar
