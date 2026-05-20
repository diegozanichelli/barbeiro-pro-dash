# Filtros de cadastro + inadimplentes na tela Clientes

Objetivo: permitir ao gestor entrar em **Clientes** e em 1 clique filtrar quem precisa de atenção — cadastros incompletos (sem telefone ou só primeiro nome) e assinantes que não pagam há mais de 30 dias.

## O que muda na UI

Logo abaixo do cabeçalho "Clientes / Buscar", uma faixa com 4 pílulas de filtro mostrando contadores em tempo real:

```text
[ Todos · 1.245 ]  [ Sem telefone · 87 ]  [ Nome incompleto · 132 ]  [ Inadimplentes >30d · 14 ]
```

- A pílula de inadimplentes fica vermelha quando há ocorrências (chamariz visual).
- Cada card de cliente passa a exibir badges contextuais:
  - "Nome incompleto" (âmbar) quando aplicável.
  - "Sem telefone" no lugar do número, em âmbar.
  - Badge vermelho "Xd" indicando há quantos dias venceu, para inadimplentes.
- Empty state específico por filtro ("Nenhum cliente neste filtro").
- Busca por nome/telefone continua funcionando combinada com o filtro ativo.
- Modal de detalhe do cliente segue idêntico — o gestor clica, corrige nome/telefone e salva (já existe).

## Regras de classificação

- **Sem telefone**: `mobile_phone` vazio **ou** reprovado em `isValidPhone()` (já existe em `phoneUtils.ts` — valida 11 dígitos, DDD ≥ 11, terceiro dígito = 9, sem sequências fraudulentas).
- **Nome incompleto**: após `trim`, `split` por espaços resulta em menos de 2 palavras **ou** a primeira palavra tem menos de 2 letras (ex.: "João", "J Silva").
- **Inadimplente >30 dias**: cliente possui `subscription_plan_id` definido **e**
  - não há nenhum pagamento de assinatura registrado para o telefone dele, **ou**
  - o pagamento mais recente é mais antigo que 30 dias.
  - Considera apenas `sale_transactions` com `item_type='subscription'` e `subscription_action ∈ {new, renew, upgrade, downgrade}` (ignora cancelamentos/ajustes).

## Detalhes técnicos

Arquivo afetado: `src/components/dashboard/manager/ClientsManagement.tsx` (sem mudança de schema).

- Novo state: `filter: 'all' | 'no_phone' | 'incomplete_name' | 'overdue'` e `lastSubByPhone: Map<phone, ISODate>`.
- `fetchData()` ganha um segundo bloco paginado (PAGE_SIZE 1000) que lê `sale_transactions` da organização filtrando `item_type='subscription'` e `mobile_phone IS NOT NULL`, ordenando por `created_at desc`. Como já vem ordenado, mantém apenas a primeira ocorrência por telefone (último pagamento). Filtra ações pagas via `SUB_PAID_ACTIONS`.
- `useMemo` recalcula os contadores das 4 pílulas.
- `filtered` aplica filtro + busca já existente (compatível com a paginação atual de 30 por página).
- `differenceInCalendarDays` do `date-fns` para calcular o atraso. Limite isolado em constante `OVERDUE_DAYS = 30` para facilitar ajuste futuro.
- Badges usam tokens semânticos existentes (`destructive`, `secondary`, `outline`); ícones novos: `AlertTriangle`, `PhoneOff`, `UserX` (já em `lucide-react`).

## Segurança / multi-tenant

- A query de `sale_transactions` é sempre escopada por `organization_id = useOrganization().organizationId` e protegida pelas RLS atuais (manager-only). Nenhum cliente nem transação de outra organização é exposto.
- Nenhuma alteração em RLS, schema ou Edge Function.

## Fora de escopo

- Não criamos cron/notificação automática de inadimplência — apenas exposição visual sob demanda.
- Não mudamos o critério de "ativo" do plano em `clients.subscription_plan_id` (continua sendo a fonte de verdade do vínculo).
- Cobrança/Stripe permanece intocado.
