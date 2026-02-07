
# Plano: Adicionar Botao "Ver Comandas" por Barbeiro

## Objetivo

Adicionar um botao com icone de olho em cada card de barbeiro no "AO VIVO" que abre o modal de transacoes mostrando **apenas as comandas lancadas pelo gestor** para aquele barbeiro no dia selecionado.

---

## Visao do Resultado

```text
Card do Barbeiro (atualizado):
┌─────────────────────────────────────────────────┐
│  [Avatar] Gabriel Peter                         │
│           Unidade Centro                        │
│                                    [👁] [✏] [+] │ ← Novo botao de olho
│                                                 │
│  Progresso: ████████░░░░ 75%                   │
│  R$ 280,00 / R$ 380,00                         │
│                                                 │
│  Faltam 2 cortes para bater a meta             │
└─────────────────────────────────────────────────┘
```

Ao clicar no botao de olho:
- Abre o `TransactionManagerModal` existente
- Mostra **apenas** transacoes com `source = 'manager'`
- Permite visualizar e editar/excluir itens

---

## Alteracoes Necessarias

### 1. Arquivo: `TransactionManagerModal.tsx`

**Adicionar filtro por source na query:**

Linha 137, adicionar `.eq("source", "manager")`:

```typescript
const { data, error } = await supabase
  .from("sale_transactions")
  .select("id, item_name, item_type, service_category, price_sold, commission_amount, description")
  .eq("daily_production_id", dailyProductionId)
  .eq("source", "manager")  // ← NOVO: filtrar apenas transacoes do gestor
  .order("created_at", { ascending: true });
```

Isso garante que:
- Apenas comandas lancadas pelo gestor (via "AO VIVO") sao exibidas
- Lancamentos manuais do barbeiro (`source = 'barber'`) nao aparecem
- Nao ha risco de duplicacao ou conflito

### 2. Arquivo: `LiveDashboard.tsx`

**Adicionar import do icone Eye:**

Linha 14, atualizar imports:
```typescript
import { Plus, Radio, Loader2, Pencil, ChevronLeft, ChevronRight, Calendar, FileText, Crown, Eye } from "lucide-react";
```

**Adicionar novo estado para modal de visualizacao:**

Apos linha 95 (estado editModal), adicionar:
```typescript
const [viewTransactionsModal, setViewTransactionsModal] = useState<{
  open: boolean;
  barberId: string;
  barberName: string;
  dailyProductionId: string;
  date: string;
}>({ open: false, barberId: "", barberName: "", dailyProductionId: "", date: "" });
```

**Adicionar handler para abrir modal de visualizacao:**

Apos a funcao `handleEditClick` (linha 318), adicionar:
```typescript
const handleViewTransactions = async (barber: Barber) => {
  const { data: production } = await supabase
    .from("daily_productions")
    .select("id")
    .eq("barber_id", barber.id)
    .eq("date", selectedDate)
    .single();
  
  if (production) {
    setViewTransactionsModal({
      open: true,
      barberId: barber.id,
      barberName: barber.name,
      dailyProductionId: production.id,
      date: selectedDate,
    });
  } else {
    toast.info("Nenhuma comanda registrada para este barbeiro hoje");
  }
};
```

**Adicionar botao de olho no card do barbeiro:**

Entre linhas 643-668 (area de botoes), adicionar o botao antes do Pencil:

```tsx
<div className="flex gap-1">
  {/* Novo botao de visualizacao */}
  <Button
    size="sm"
    variant="ghost"
    className="h-8 w-8 p-0"
    onClick={() => handleViewTransactions(barber)}
    title="Ver comandas do gestor"
  >
    <Eye className="w-4 h-4" />
  </Button>
  
  {revenue > 0 && (
    <Button
      size="sm"
      variant="outline"
      className="h-8 w-8 p-0"
      onClick={() => handleEditClick(barber)}
      title="Editar lançamento"
    >
      <Pencil className="w-4 h-4" />
    </Button>
  )}
  {/* ... botao de + existente */}
</div>
```

**Adicionar segundo TransactionManagerModal:**

Apos linha 746, adicionar:
```tsx
{/* View Transactions Modal - Read-only view */}
<TransactionManagerModal
  open={viewTransactionsModal.open}
  onOpenChange={(open) => setViewTransactionsModal((prev) => ({ ...prev, open }))}
  barberId={viewTransactionsModal.barberId}
  barberName={viewTransactionsModal.barberName}
  organizationId={organizationId || ""}
  dailyProductionId={viewTransactionsModal.dailyProductionId}
  date={viewTransactionsModal.date}
  onSuccess={fetchData}
/>
```

---

## Estrutura Visual Final dos Botoes

```text
Ordem dos botoes no card:
[👁 Ver]  [✏ Editar*]  [+ Adicionar]
   ↓          ↓            ↓
  ghost    outline      default
 (sempre)  (se revenue>0) (sempre)

* O botao de editar so aparece se ha faturamento
```

---

## Seguranca e Integridade

| Aspecto | Garantia |
|---------|----------|
| Isolamento de dados | Query filtra `source = 'manager'` |
| Conflito com barbeiro | Impossivel - dados completamente separados |
| Auditoria | Gestor ve apenas suas proprias entradas |
| Edicao segura | Excluir item recalcula totais via trigger |

---

## Resumo das Alteracoes

| Arquivo | Linha | Alteracao |
|---------|-------|-----------|
| `TransactionManagerModal.tsx` | 137 | Adicionar `.eq("source", "manager")` |
| `LiveDashboard.tsx` | 14 | Importar icone `Eye` |
| `LiveDashboard.tsx` | ~96 | Novo estado `viewTransactionsModal` |
| `LiveDashboard.tsx` | ~319 | Nova funcao `handleViewTransactions` |
| `LiveDashboard.tsx` | ~644 | Novo botao com icone Eye |
| `LiveDashboard.tsx` | ~747 | Novo `TransactionManagerModal` para visualizacao |
