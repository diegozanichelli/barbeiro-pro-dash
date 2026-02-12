

# Refatoracao Definitiva de Independencia de Fluxo

## Objetivo

Eliminar completamente a dependencia de `daily_production_id` no painel "Ao Vivo" do gestor. Nenhuma acao do gestor criara registros em `daily_productions`. O barbeiro continua com alerta de producao pendente ate fazer seu proprio lancamento.

---

## Acao 1: Consulta Independente (TransactionManagerModal.tsx)

### 1a. Interface - tornar `dailyProductionId` opcional (linha 50)

```text
dailyProductionId: string  -->  dailyProductionId?: string | null
```

### 1b. useEffect de abertura (linhas 112-116)

Trocar condicao de `dailyProductionId` para `barberId && date`:

```text
// Antes
if (open && dailyProductionId) { fetchTransactions(); }
// Depois
if (open && barberId && date) { fetchTransactions(); }
```

Atualizar dependencias do useEffect para `[open, barberId, date]`.

### 1c. fetchTransactions (linhas 135-153)

Substituir a query baseada em `daily_production_id` por busca via `barber_id` + intervalo de data:

```text
import { addDays, parseISO, format } from "date-fns";

const nextDay = format(addDays(parseISO(date), 1), "yyyy-MM-dd");

const { data, error } = await supabase
  .from("sale_transactions")
  .select("id, item_name, item_type, service_category, price_sold, commission_amount, description, client_name")
  .eq("barber_id", barberId)
  .eq("source", auditMode ? "barber" : "manager")
  .gte("created_at", `${date}T00:00:00`)
  .lt("created_at", `${nextDay}T00:00:00`)
  .order("created_at", { ascending: true });
```

Importar `addDays`, `parseISO` de `date-fns` (ja existente no projeto). `format` ja esta importada? Verificar e adicionar se necessario.

---

## Acao 2: Lancamento Sem Rastros (handleAddItems - linha 321)

Alterar `daily_production_id` para aceitar null:

```text
// Antes
daily_production_id: dailyProductionId,
// Depois
daily_production_id: dailyProductionId || null,
```

Isso garante que transacoes novas adicionadas pelo gestor nao precisam de um registro ancora.

---

## Acao 3: Edicao Independente (LiveDashboard.tsx)

### 3a. handleViewTransactions (linhas 360-379)

Eliminar a busca por `daily_productions`. Abrir o modal diretamente:

```text
const handleViewTransactions = (barber: Barber) => {
  setViewTransactionsModal({
    open: true,
    barberId: barber.id,
    barberName: barber.name,
    dailyProductionId: "",
    date: selectedDate,
  });
};
```

### 3b. handleEditClick (linhas 313-358)

Eliminar a criacao automatica de `daily_productions`. Abrir o modal diretamente com o ID existente (se houver) ou sem ele:

```text
const handleEditClick = async (barber: Barber) => {
  const { data: production } = await supabase
    .from("daily_productions")
    .select("id")
    .eq("barber_id", barber.id)
    .eq("date", selectedDate)
    .maybeSingle();

  setEditModal({
    open: true,
    barberId: barber.id,
    barberName: barber.name,
    dailyProductionId: production?.id || "",
    date: selectedDate,
  });
};
```

Se nao existir `daily_productions`, o modal abre mesmo assim. As transacoes serao inseridas com `daily_production_id: null`.

### 3c. State types (linhas 91-104)

Nenhuma alteracao necessaria nos types -- `dailyProductionId` ja e `string`, e passaremos `""` quando nao houver.

### 3d. Instancias do TransactionManagerModal no JSX (linhas 840-849 e 880-889)

Nenhuma alteracao necessaria -- os props ja passam as variaveis de estado que serao corretamente preenchidas pelas funcoes acima.

---

## Acao 4: Compatibilidade com ManagerReports (auditMode)

O `ManagerReports.tsx` (linha 594-604) usa `TransactionManagerModal` com `auditMode={true}` e sempre passa um `dailyProductionId` valido vindo de registros existentes em `daily_productions`. Como `dailyProductionId` agora e opcional, a compatibilidade e mantida automaticamente. Nenhuma alteracao necessaria.

---

## Acao 5: Trigger de Vinculo Tardio (SQL)

Criar a funcao e o trigger `trg_link_orphans_on_production_start`:

```text
CREATE OR REPLACE FUNCTION public.link_orphan_transactions()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_next_day date;
BEGIN
  v_next_day := NEW.date + interval '1 day';

  UPDATE sale_transactions
  SET daily_production_id = NEW.id
  WHERE barber_id = NEW.barber_id
    AND daily_production_id IS NULL
    AND created_at >= NEW.date::timestamp
    AND created_at < v_next_day::timestamp;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_orphans_on_production_start
  AFTER INSERT ON daily_productions
  FOR EACH ROW
  EXECUTE FUNCTION link_orphan_transactions();
```

Quando o barbeiro logar e criar seu registro de producao (ou quando uma auditoria criar o registro manualmente), todas as transacoes orfas daquele dia serao automaticamente vinculadas. O trigger existente `recalculate_daily_production_from_transactions` sera disparado em cascata e preenchera os campos `tx_*`.

---

## Acao 6: Limpeza de Fantasmas (SQL)

Deletar registros de `daily_productions` de hoje (12/02) que estao com producao completamente zerada, presenca nao confirmada, e sem transacoes vinculadas:

```text
DELETE FROM daily_productions dp
WHERE dp.date = '2026-02-12'
  AND dp.services_basic_total IS NOT DISTINCT FROM 0
  AND dp.services_extra_total IS NOT DISTINCT FROM 0
  AND dp.products_total = 0
  AND dp.services_total = 0
  AND dp.clients_count = 0
  AND COALESCE(dp.tx_basic_total, 0) = 0
  AND COALESCE(dp.tx_extra_total, 0) = 0
  AND COALESCE(dp.tx_products_total, 0) = 0
  AND dp.confirmed_presence = false
  AND NOT EXISTS (
    SELECT 1 FROM sale_transactions st
    WHERE st.daily_production_id = dp.id
  );
```

**Ordem critica**: A Acao 1 (consulta independente) DEVE ser implantada e estar ativa ANTES da Acao 6 (limpeza). Isso garante que o faturamento do gestor (ex: Lucas Prata R$ 170) continua visivel no olhinho mesmo apos a limpeza dos fantasmas.

---

## Alerta de Producao Pendente

O componente `MissingProductionAlert` (usado no dashboard do barbeiro) verifica a existencia de registros em `daily_productions` apenas para dias **anteriores a hoje** (ate ontem). A limpeza de fantasmas de hoje nao afeta este alerta. Barbeiros continuarao vendo "producao pendente" para os dias em que nao fizeram lancamento.

---

## Ordem de Execucao

1. Alterar `TransactionManagerModal.tsx` (Acoes 1 e 2)
2. Alterar `LiveDashboard.tsx` (Acao 3)
3. Executar migracao SQL com trigger (Acao 5)
4. Executar limpeza de fantasmas (Acao 6)
5. Validar: abrir olhinho do Lucas Prata e Jhon Belchior

## Arquivos Modificados

- `src/components/dashboard/manager/TransactionManagerModal.tsx`
- `src/components/dashboard/manager/LiveDashboard.tsx`
- Migracao SQL (trigger + limpeza)

## Resultado Final

- Gestor visualiza e edita faturamento normalmente (olhinho e lapis)
- Nenhuma acao do gestor cria registros em `daily_productions`
- Dashboard do barbeiro permanece zerado ate o barbeiro fazer seu lancamento
- Transacoes orfas sao vinculadas automaticamente quando o barbeiro inicia o dia
- Alerta de producao pendente continua funcional

