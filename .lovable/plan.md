

# Resultado da Varredura e Proximos Passos

## Diagnostico Completo

A varredura tecnica revelou que **NENHUMA transacao esta orfã neste momento**. Todos os 5 barbeiros mencionados (Pablo Igor, Braiom Souza, Gabriel Oliveira, Lorran Patrick e Jhon Belchior) tem suas transacoes dos dias 10 e 11/02 corretamente vinculadas a registros em `daily_productions`, com totais computados.

Isso indica que o problema original ja foi resolvido pela migracao anterior da RPC, ou que as transacoes foram criadas corretamente pelo `QuickSaleModal` (que ja possui logica de criacao de `daily_productions` antes da insercao).

## O que JA esta implementado (correcoes anteriores)

1. **RPC `get_organization_rankings`** -- ja expandida com `products_count`, `extras_count`, `subscriptions_count` via SECURITY DEFINER
2. **Leaderboard.tsx** -- ja usa apenas a RPC, sem query direta em `sale_transactions`
3. **Refetch automatico** -- `visibilitychange` listener ja ativo no Leaderboard
4. **QuickSaleModal** -- ja cria `daily_productions` antes de inserir transacoes (linhas 370-404)

## O que falta implementar (rede de seguranca)

### 1. Trigger de seguranca no banco de dados (SQL)

Criar um trigger `BEFORE INSERT` em `sale_transactions` que, quando `daily_production_id` for NULL mas `barber_id` for preenchido:
- Calcula a data usando timezone de Manaus
- Cria automaticamente o `daily_productions` se nao existir (INSERT ON CONFLICT DO NOTHING)
- Vincula a transacao ao registro criado

Isso funciona como rede de seguranca final, impedindo que qualquer transacao futura fique orfã independente de falha no frontend.

### 2. Verificacao pos-correcao

Apos a migracao, executar:

```text
SELECT count(*) FROM sale_transactions WHERE daily_production_id IS NULL AND barber_id IS NOT NULL;
-- Resultado esperado: 0
```

## Secao Tecnica

### Migracao SQL - Trigger de seguranca

```text
CREATE OR REPLACE FUNCTION public.ensure_daily_production_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date date;
  v_production_id uuid;
  v_org_id uuid;
BEGIN
  -- So atua quando daily_production_id e NULL e barber_id existe
  IF NEW.daily_production_id IS NOT NULL OR NEW.barber_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calcula data em Manaus (GMT-4)
  v_date := (NEW.created_at AT TIME ZONE 'America/Manaus')::date;
  v_org_id := COALESCE(NEW.organization_id, (SELECT organization_id FROM barbers WHERE id = NEW.barber_id));

  -- Cria daily_production se nao existir
  INSERT INTO daily_productions (barber_id, organization_id, date, clients_count, services_count, products_count)
  VALUES (NEW.barber_id, v_org_id, v_date, 0, 0, 0)
  ON CONFLICT (barber_id, date) DO NOTHING;

  -- Busca o ID
  SELECT id INTO v_production_id
  FROM daily_productions
  WHERE barber_id = NEW.barber_id AND date = v_date;

  NEW.daily_production_id := v_production_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_daily_production_link
  BEFORE INSERT ON sale_transactions
  FOR EACH ROW
  EXECUTE FUNCTION ensure_daily_production_link();
```

**Nota:** Este trigger depende de um indice UNIQUE em `daily_productions(barber_id, date)` para o `ON CONFLICT` funcionar. Se esse constraint nao existir, sera criado na mesma migracao.

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| Migracao SQL | Criar trigger `ensure_daily_production_link` como rede de seguranca |

### Verificacoes

- Nenhuma alteracao no frontend e necessaria (QuickSaleModal ja funciona corretamente)
- Os 5 barbeiros ja tem dados corretos no sistema
- O trigger so sera acionado em casos extremos (falha de rede parcial, race condition)

