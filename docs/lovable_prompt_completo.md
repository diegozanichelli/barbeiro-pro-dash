# Prompt completo para implementar no Lovable (Performance Barber)

Use este prompt no Lovable para aplicar **todas as mudanças já definidas** no projeto, preservando regras de negócio e compatibilidade com dados legados.

---

## Prompt para colar no Lovable

Você é um engenheiro sênior responsável por atualizar o projeto **Performance Barber** (React 18 + TypeScript + Supabase + shadcn/ui), sem quebrar clientes atuais.

### 1) Regras obrigatórias (NÃO alterar)
- Domingo continua como dia de bônus (faturamento pode existir, mas não consome dia útil oficial).
- Feriado de organização deve reduzir dias úteis oficiais do mês (feriado = fechamento da unidade).
- Assinaturas continuam fora do faturamento operacional diário.
- Compatibilidade “Chezz Case”: manter busca híbrida em produção/transações (registros antigos por id e novos por data, quando aplicável no fluxo atual).

### 2) Feriados por organização (completo)
- Garantir migration da tabela `organization_holidays` com RLS e trigger de `updated_at`.
- Garantir tipagem em `src/integrations/supabase/types.ts`.
- Garantir hook `useOrganizationHolidays` com filtros por `organizationId`, `month`, `year`.
- Atualizar `calculateRemainingWorkDays(today?, holidayDates=[])` para ignorar domingos + datas em `holidayDates`.
- Integrar `holidayDates` nos cálculos de:
  - `BarberDashboard`
  - `DailyGoalsTracking`
  - `LiveDashboard`
  - `MissingProductionAlert`
  - `MissingProductionsAlert`
- Em feriado, bloquear alertas de “Produção pendente”.
- Se houver venda em feriado, tratar como bônus (soma valor, sem consumir dia útil oficial).

### 3) Gestão de feriados no frontend (Metas)
- Em `GoalsManagement`:
  - Botão visível “Configurar Feriados”.
  - Dialog com calendário múltiplo + botão “Salvar Feriados”.
  - Salvar por mês/ano atual do filtro (remove e recria somente o mês filtrado).
  - Tratar ausência da tabela com mensagem amigável.
- **Evitar qualquer duplicação de função** (ex.: `fetchHolidays`, `handleSaveHolidays`).
- Padronizar nomes para evitar colisões de build (ex.: `loadHolidaysForMonth`, `saveHolidaysForMonth`).

### 4) Refatoração UX do `BarberEditProductionModal`
- Trocar layout de cards/vitrine por layout “extrato em lista”.
- Adicionar topo fixo com contador grande de `clients_count`: `[ - ] número [ + ]`.
- Lista de itens com linha compacta:
  - nome à esquerda
  - preço clicável à direita (edição rápida com `CurrencyInput`)
  - lixeira vermelha na extrema direita
- Botão largo no fim da lista: `+ Adicionar Serviço/Produto`.
- Alvos de toque mobile com altura mínima de 48px.
- Manter lógica atual de salvar:
  - replace de transações `source='barber'`
  - update de `clients_count` e `manual_clients_count`
  - fluxo de divergência preservado
- Presença:
  - manter “Registrar Presença”
  - se houver itens lançados, mostrar confirmação antes de limpar
  - ao confirmar presença, limpar lançamentos do barbeiro e atualizar `daily_productions` com `confirmed_presence` e `presence_type`
- Histórico da comanda anterior (visualização para correção):
  - Exibir a **comanda anterior lançada** apenas para consulta/conferência (não manter como estado ativo final).
  - Objetivo: permitir visualizar o que foi lançado antes para corrigir com segurança.
  - Ao salvar a correção:
    1. deletar registros antigos da produção editada (`source='barber'`),
    2. registrar a nova comanda corrigida como novo conjunto de transações,
    3. manter apenas o resultado final corrigido como comanda vigente.

### 5) Qualidade técnica obrigatória
- Eliminar `any` nos arquivos alterados.
- Corrigir dependências de hooks (`useEffect`, `useMemo`, `useCallback`).
- Não criar try/catch ao redor de imports.
- Garantir build em ambiente Netlify/Bun sem erros de redeclaração.

### 6) Check de entrega
Executar e apresentar resultado:
1. `npx eslint` (zero erros nos arquivos alterados)
2. `bun run build` (sucesso)
3. Validar manualmente:
   - salvar feriados
   - cálculos de dias úteis com feriado
   - alerta pendente bloqueado em feriado
   - edição rápida no modal do barbeiro
   - registro de presença com confirmação

### 7) Formato de resposta esperado
- Liste arquivos alterados.
- Explique por que as regras de negócio foram preservadas.
- Traga evidência dos comandos (`eslint` e `build`).
- Se algo depender de migration não aplicada, informar claramente o comando para aplicar (`supabase db push`) e seguir com fallback de UI.

---

## Observação
Se o Lovable acusar erro de schema cache da tabela `organization_holidays`, executar:
- migration
- e depois reload de schema (ex.: `NOTIFY pgrst, 'reload schema';` quando aplicável no ambiente)
