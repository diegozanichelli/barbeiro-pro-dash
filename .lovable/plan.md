
# Adicionar DatePicker e Corrigir Data Retroativa no QuickSaleModal

## Problema
O `QuickSaleModal` nao possui nenhum seletor de data. Ele sempre usa `getTodayString()` para a data da producao diaria e nao define `created_at` nas transacoes (usa o default do banco, que e `now()`). Isso impede lançamentos retroativos pelo gestor.

## Solucao
Adicionar um DatePicker identico ao do `BarberSaleForm` e usar a data selecionada tanto na `daily_productions.date` quanto no `created_at` das `sale_transactions`.

---

## Alteracoes no arquivo `src/components/dashboard/manager/QuickSaleModal.tsx`

### 1. Novos imports
Adicionar: `Calendar`, `Popover`, `PopoverContent`, `PopoverTrigger`, `CalendarIcon`, `format`, `ptBR`

### 2. Novo estado
```text
const [selectedDate, setSelectedDate] = useState<Date>(new Date());
const [datePickerOpen, setDatePickerOpen] = useState(false);
```

### 3. Reset do estado
Na funcao `resetForm()`, adicionar `setSelectedDate(new Date())` e `setDatePickerOpen(false)`.

### 4. DatePicker na UI
Adicionar o seletor de data na area do header (dentro da secao colapsavel, junto com "Nome do Cliente" e "Venda Recepcao"), com o mesmo estilo do `BarberSaleForm`:
- Botao mostrando "Hoje" ou a data formatada
- Calendario popup com `disabled={(date) => date > new Date()}`
- Destaque visual quando a data nao e hoje (cor de alerta)

### 5. Corrigir `handleCartCheckout`
- Trocar `const today = getTodayString()` por `const dateStr = format(selectedDate, "yyyy-MM-dd")`
- Usar `dateStr` nas queries de `daily_productions` (`.eq("date", dateStr)` e no insert)
- Adicionar `created_at` no payload de cada transacao:
```text
created_at: selectedDate.toISOString()
```

### 6. Corrigir `handleManualSale`
- Mesma logica: usar `format(selectedDate, "yyyy-MM-dd")` em vez de `getTodayString()`
- As transacoes manuais tambem devem respeitar a data escolhida

### 7. Logica de hora
Para datas passadas, a hora sera preservada como o momento do registro (horario atual aplicado ao dia selecionado). O importante e que o **dia** seja o correto para o filtro de producao diaria.
