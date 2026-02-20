
# Evolucao do Modulo de Lancamento de Ganhos de Assinatura

## Resumo

Adicionar coluna `total_revenue` na tabela `barber_subscription_earnings` para registrar o faturamento bruto da cadeira, atualizar o formulario com dois campos monetarios (usando CurrencyInput), atualizar a tabela de listagem, e integrar o novo valor nos relatorios de evolucao.

## 1. Migracao de Banco de Dados

Adicionar coluna `total_revenue` (numeric, default 0) na tabela `barber_subscription_earnings`.

```sql
ALTER TABLE barber_subscription_earnings
ADD COLUMN total_revenue numeric NOT NULL DEFAULT 0;
```

## 2. Alterar `SubscriptionEarningsForm.tsx`

### Formulario
- Adicionar estado `totalRevenue` (number, default 0)
- Substituir o campo unico "Valor R$" por dois campos usando `CurrencyInput`:
  - **Faturamento Bruto (Cadeira)** com dica: "Este valor sera usado para calcular o faturamento total da unidade nos relatorios."
  - **Ganho do Barbeiro (Comissao)** (o campo `amount` existente)
- Ambos obrigatorios na validacao do `handleSave`

### Logica de salvamento
- Incluir `total_revenue` no insert e update (alem do `amount` existente)
- No `handleEdit`, preencher ambos os campos

### Interface `SubscriptionEarning`
- Adicionar campo `total_revenue: number`

### Tabela de listagem
- Atualizar colunas: Barbeiro | Faturamento Bruto (R$) | Ganho Barbeiro (R$) | Acoes
- Exibir `total_revenue` e `amount` separadamente

## 3. Integrar nos Relatorios de Evolucao

### `ShopEvolution.tsx`
- Buscar dados de `barber_subscription_earnings` agrupados por mes para o ano selecionado
- Somar `total_revenue` ao faturamento mensal (receita), adicionando como nova categoria "Assinaturas" nas barras empilhadas
- Adicionar ao tooltip e a tabela comparativa mensal

## Secao Tecnica

### Campos no banco
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `amount` (existente) | numeric | Ganho do barbeiro (comissao) |
| `total_revenue` (novo) | numeric | Faturamento bruto da cadeira |

### Fluxo de dados

```text
Formulario -> barber_subscription_earnings (amount + total_revenue)
                     |
                     v
ShopEvolution.tsx -> SUM(total_revenue) por mes -> barra "Assinaturas" no grafico
```

### Arquivos modificados

| Arquivo | Acao |
|---------|------|
| Migracao SQL | Adicionar coluna `total_revenue` |
| `src/components/dashboard/manager/SubscriptionEarningsForm.tsx` | Dois campos CurrencyInput + tabela com 2 colunas de valor |
| `src/components/dashboard/manager/ShopEvolution.tsx` | Buscar e somar `total_revenue` ao faturamento |
