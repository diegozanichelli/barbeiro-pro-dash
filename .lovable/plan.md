

# Implementação Itens #4 e #6 — Funil de Conversão e Atribuição de Vendas

## Item #4 — Funil com clientes únicos por telefone

**Arquivo:** `src/components/dashboard/manager/SubscriptionAnalytics.tsx`

Trocar a contagem `totalNewClients` (que hoje conta linhas de transação com `is_new_client=true`) por uma contagem distinta de telefones.

- **Novo método de busca:** trocar a query head/count por `select("mobile_phone")` filtrando `is_new_client=true`, `source='manager'`, `organization_id`, e o intervalo do mês.
- **Cálculo:** `new Set(rows.map(r => r.mobile_phone).filter(Boolean)).size` → este vira o `totalNewClients`.
- **Impacto:** o denominador deixa de inflar quando o mesmo cliente novo compra corte + produto + assinatura no mesmo dia.
- **Edge case:** transações sem `mobile_phone` são descartadas da contagem (não dá pra distinguir cliente único). Vou adicionar um comentário no código explicando.
- **Adicionar filtro:** `.eq("organization_id", organizationId)` usando `useOrganization()` (hoje a query confia só na RLS).

---

## Item #6 — Forçar atribuição "Barbeiro vs Recepção" no QuickSaleModal

Hoje o `QuickSaleModal` é aberto a partir do botão `+` em uma linha de barbeiro específica no `LiveDashboard`, e existe um `Switch` discreto "Modo Recepção" dentro do modal. Vamos transformar isso num **passo de seleção obrigatório** no início do wizard.

### Mudanças no `LiveDashboard.tsx`

1. **Novo botão "Venda Recepção"** ao lado do botão de "Adicionar venda" (no header, perto da seleção de unidade), que abre o `QuickSaleModal` em modo recepção pré-selecionado.
2. Estender `quickSaleModal` state com `mode: 'barber' | 'reception' | 'unset'`.
3. Botão visualmente destacado (cor `secondary` ou ícone `Building2`) para diferenciar das vendas por barbeiro.

### Mudanças no `QuickSaleModal.tsx`

1. **Nova prop:** `initialMode?: 'barber' | 'reception'` (default `'barber'` quando aberto a partir de uma linha de barbeiro).
2. **Remover o Switch existente** "Modo Recepção" (linhas 1158-1162).
3. **Novo step de Atribuição** no Step 1 do wizard, com `ToggleGroup` exibindo:
   - **Botão Barbeiro** — mostra o nome do `barberName` recebido. Pré-selecionado quando aberto via linha do barbeiro.
   - **Botão Venda Recepção** — destacado em cor `secondary/primary`, ícone `Building2`. Pré-selecionado quando aberto via botão dedicado.
4. **Guarda de finalização:** desabilitar o botão "Finalizar Venda" enquanto `attribution === null`. Se o usuário tentar avançar, exibir toast: *"Ação necessária: Selecione um Barbeiro ou 'Venda Recepção' para prosseguir."*
5. **Lógica de envio:** `effectiveBarberId = attribution === 'reception' ? null : barberId` (lógica que já existe, só muda a fonte do estado).
6. **Título do modal:** atualizar dinamicamente — `Venda Rápida — {attribution === 'reception' ? '🏢 Recepção / Loja' : barberName}`.

### Mudanças no `ReceptionPerformanceReport.tsx`

Manter o critério atual (`barber_id IS NULL`) — agora ele será confiável porque o gestor sempre tem que escolher explicitamente. Adicionar pequeno texto na descrição do card:

> *"Considera apenas vendas de assinatura registradas como 'Venda Recepção' (sem atribuição a barbeiro)."*

---

## Detalhes Técnicos

**Diff resumido — SubscriptionAnalytics:**
```ts
const newClientsRes = await supabase
  .from("sale_transactions")
  .select("mobile_phone")
  .eq("is_new_client", true)
  .eq("source", "manager")
  .eq("organization_id", organizationId)
  .gte("created_at", start)
  .lte("created_at", end);

const uniquePhones = new Set(
  (newClientsRes.data || [])
    .map(r => r.mobile_phone)
    .filter(Boolean)
);
setTotalNewClients(uniquePhones.size);
```

**Diff resumido — QuickSaleModal (atribuição):**
```tsx
const [attribution, setAttribution] = useState<'barber' | 'reception' | null>(
  initialMode ?? 'barber'
);

// No Step 1, antes do tipo de cliente:
<ToggleGroup type="single" value={attribution ?? ''} onValueChange={(v) => setAttribution(v as any)}>
  <ToggleGroupItem value="barber"><Scissors /> {barberName}</ToggleGroupItem>
  <ToggleGroupItem value="reception" className="data-[state=on]:bg-primary">
    <Building2 /> Venda Recepção
  </ToggleGroupItem>
</ToggleGroup>

// No handleSubmit:
if (!attribution) {
  toast.error("Ação necessária: Selecione um Barbeiro ou 'Venda Recepção' para prosseguir.");
  return;
}
const effectiveBarberId = attribution === 'reception' ? null : barberId;
```

---

## Plano de Execução

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `SubscriptionAnalytics.tsx` | Trocar contagem para `COUNT(DISTINCT mobile_phone)` + filtro `organization_id` |
| 2 | `LiveDashboard.tsx` | Adicionar botão "Venda Recepção" no header e propagar `initialMode='reception'` |
| 3 | `QuickSaleModal.tsx` | Substituir Switch por `ToggleGroup` obrigatório de atribuição + guarda no submit |
| 4 | `ReceptionPerformanceReport.tsx` | Nota explicativa sobre o critério de "Venda Recepção" |

Sem mudanças de banco — apenas frontend.

