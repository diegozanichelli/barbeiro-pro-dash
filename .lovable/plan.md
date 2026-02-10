

# Registro de Ocorrencias com Classificacao de Dias

## Resumo

Transformar o botao "Nao vendi nada" em um sistema de classificacao de dias, permitindo ao barbeiro registrar o motivo do dia sem vendas. Isso diferencia quem foi trabalhar e nao produziu (problema de vendas) de quem nao foi trabalhar (problema de escala).

---

## Alteracoes

### 1. Migracao de Banco de Dados

Adicionar coluna `presence_type` na tabela `daily_productions`:

```text
ALTER TABLE daily_productions 
ADD COLUMN presence_type TEXT DEFAULT NULL;
```

Valores possiveis:
- `present` -- Trabalhou mas nao vendeu (conta como dia trabalhado)
- `day_off` -- Folga / Troca de escala (NAO conta como dia trabalhado)
- `absence` -- Falta / Atestado (NAO conta como dia trabalhado)
- `NULL` -- Dia normal com vendas (comportamento atual)

Nao usamos ENUM para manter flexibilidade futura. A coluna permanece nullable para compatibilidade com registros existentes (dias com vendas nao precisam de classificacao).

### 2. Refatorar `ConfirmPresenceModal.tsx`

Transformar o modal em um formulario com 3 opcoes de classificacao:

- Adicionar RadioGroup com as 3 opcoes visuais (icones + descricao):
  - "Trabalhei mas nao vendi" (icone UserCheck, cor laranja)
  - "Folga / Troca de escala" (icone CalendarOff, cor azul)
  - "Falta / Atestado" (icone XCircle, cor vermelho)
- O campo "Clientes de assinatura atendidos" so aparece quando `present` for selecionado
- O seletor de data permanece
- Atualizar a interface de `onConfirm` para enviar `presence_type` junto com os dados

Nova assinatura do callback:
```text
onConfirm: (subscriptionClientsCount: number, date: string, presenceType: string) => void
```

### 3. Atualizar `BarberDashboard.tsx` -- handleConfirmPresence

- Receber o novo parametro `presenceType`
- Salvar `presence_type` no insert/update de `daily_productions`
- Para `present`: manter `confirmed_presence = true` (compatibilidade)
- Para `day_off` e `absence`: salvar `confirmed_presence = true` + `presence_type` correspondente
- Ajustar mensagens de toast conforme o tipo:
  - `present`: "Presenca registrada. Dia contabilizado na meta."
  - `day_off`: "Folga registrada. Voce tera que compensar nos dias restantes."
  - `absence`: "Falta registrada."

### 4. Atualizar logica de "Dias Trabalhados" em 3 arquivos

A regra muda: so conta como dia trabalhado se houve faturamento > 0 OU `presence_type = 'present'`. Dias com `day_off` ou `absence` NAO contam.

**`BarberDashboard.tsx`** (linha ~252):
```text
// ANTES:
return total > 0 || p.confirmed_presence === true;

// DEPOIS:
return total > 0 || (p.confirmed_presence === true && (p.presence_type === 'present' || p.presence_type === null));
```

**`LiveDashboard.tsx`** (linha ~392):
```text
// ANTES:
(p) => Number(p.commission_earned) > 0 || p.confirmed_presence === true

// DEPOIS:
(p) => Number(p.commission_earned) > 0 || (p.confirmed_presence === true && (p.presence_type === 'present' || p.presence_type === null))
```

**`DailyGoalsTracking.tsx`** (linha ~131):
```text
// Mesma logica acima
```

Importante: a query do `DailyGoalsTracking` e `LiveDashboard` precisam incluir `presence_type` no `.select()`.

### 5. Indicadores visuais nos dashboards

**`DailyGoalsTracking.tsx`** -- Badge do barbeiro:
- Trocar o badge generico "Presente s/ vendas" por badges especificos:
  - `present` -> Badge laranja "Presente s/ vendas" (mantido)
  - `day_off` -> Badge azul "Folga"
  - `absence` -> Badge vermelho "Falta"

**`LiveDashboard.tsx`** -- Card do barbeiro:
- Adicionar icone/badge visual no card conforme o `presence_type` do dia selecionado

### 6. ProductionHistory (historico do barbeiro)

Atualizar a exibicao do historico para mostrar a classificacao do dia quando `confirmed_presence = true`:
- Icone e texto indicando o tipo de ocorrencia registrada

---

## Impacto na Meta

A meta mensal (valor financeiro) NUNCA muda. O que muda e o calculo da meta diaria:

- `day_off` e `absence` NAO reduzem os `work_days` da meta cadastrada
- O barbeiro que folgou tera que vender mais nos dias restantes (meta diaria sobe automaticamente, pois `daysWorked` nao incrementa mas os dias do calendario passam)
- `present` conta como dia trabalhado, puxando a media para baixo (alerta de performance ruim)

---

## Compatibilidade

- Registros antigos com `confirmed_presence = true` e `presence_type = NULL` serao tratados como `present` (comportamento anterior preservado)
- Nenhuma alteracao em triggers existentes necessaria (a coluna `presence_type` nao participa de calculos financeiros)

