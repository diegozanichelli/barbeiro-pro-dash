
# Ajuste da Logica de Producoes Pendentes + Confirmacao Retroativa no Historico

## Problema

O alerta de "Producoes Pendentes" considera pendente qualquer dia sem registro em `daily_productions`. Porem, se o barbeiro trabalhou, nao vendeu nada e nao registrou presenca, o dia continua aparecendo como pendente indefinidamente, mesmo nao havendo producao a lancar.

## Nova Regra de Pendencia

Um dia e pendente quando:
- Nao existe registro em `daily_productions` para aquela data
- **OU** existe registro mas `confirmed_presence = false`

Um dia **NAO** e pendente quando `confirmed_presence = true` (independente do `presence_type` ou dos valores).

## Alteracoes

### 1. Alerta no Dashboard do Barbeiro (`MissingProductionAlert.tsx`)

**Antes:** Busca apenas `date` de `daily_productions` e considera pendente qualquer dia util sem registro.

**Depois:** Busca `date` e `confirmed_presence` de `daily_productions`. Um dia e pendente se:
- Nao tem registro algum, OU
- Tem registro com `confirmed_presence = false`

A query passa a trazer `date, confirmed_presence` em vez de apenas `date`. A logica de filtragem muda para considerar como "presente" apenas datas com `confirmed_presence = true`.

### 2. Alerta no Dashboard do Gestor (`MissingProductionsAlert.tsx` - manager)

Mesma logica: buscar `barber_id, date, confirmed_presence` e considerar pendente os dias sem registro OU com `confirmed_presence = false`.

### 3. Confirmacao Retroativa no Historico (`BarberEditProductionModal.tsx`)

Quando o barbeiro clica em "Editar" um dia no historico e nao ha transacoes (carrinho vazio), adicionar uma secao **"Confirmar Status do Dia"** com as 3 opcoes de presenca:
- Trabalhei mas nao vendi (present)
- Folga (day_off)
- Falta / Atestado (absence)

Ao salvar com uma dessas opcoes (sem itens no carrinho):
- Atualizar `daily_productions` com `confirmed_presence = true` e `presence_type` escolhido
- Manter todos os valores monetarios zerados
- O dia deixa de aparecer como pendente

**Importante:** Se o barbeiro adicionar itens ao carrinho, o fluxo atual de salvar transacoes continua funcionando normalmente. A secao de presenca so aparece como alternativa quando o carrinho esta vazio.

### 4. Historico (`ProductionHistory.tsx`)

Os dias com `confirmed_presence = true` e valores zerados ja exibem badges (Presente/Folga/Falta) -- isso nao muda. A unica melhoria e que agora o barbeiro podera definir esses status retroativamente pelo modal de edicao.

## Secao Tecnica

### Arquivos modificados

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/dashboard/barber/MissingProductionAlert.tsx` | Buscar `date, confirmed_presence`; filtrar pendentes = sem registro OU `confirmed_presence = false` |
| `src/components/dashboard/manager/MissingProductionsAlert.tsx` | Mesma logica: buscar `confirmed_presence` e filtrar corretamente |
| `src/components/dashboard/barber/BarberEditProductionModal.tsx` | Adicionar secao de confirmacao de presenca quando carrinho vazio; salvar `confirmed_presence + presence_type` |

### Logica de filtragem (pseudo-codigo)

```text
dias_uteis = gerar dias uteis ate ontem (excluindo domingos)
producoes = SELECT date, confirmed_presence FROM daily_productions WHERE barber_id = X AND date BETWEEN ...

dias_confirmados = producoes.filter(p => p.confirmed_presence === true).map(p => p.date)
dias_pendentes = dias_uteis.filter(dia => !dias_confirmados.includes(dia))
```

### Fluxo do modal de edicao (carrinho vazio)

```text
Barbeiro abre "Editar" no historico
  -> Modal carrega catalogo + producao existente
  -> Se carrinho vazio, exibe secao "Confirmar Status do Dia"
     -> 3 opcoes: present / day_off / absence
     -> Botao "Confirmar" salva:
        UPDATE daily_productions SET confirmed_presence = true, presence_type = X WHERE id = Y
  -> Se carrinho tem itens, fluxo normal de salvar transacoes
```

### Sem impacto em:
- Triggers de comissao (`calculate_commission`, `recalculate_daily_production_from_transactions`)
- Campos `tx_*` (auditoria do gestor)
- Logica de divergencia
- Calculo de meta diaria (ja usa `confirmed_presence` corretamente)
