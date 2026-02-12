

# Separacao Total: Barbeiro ve apenas o que ele lancou

## Contexto

Os dados confirmam que **dezenas de barbeiros** tem `tx_*` (lancamentos do gestor) somando no `commission_earned`. Exemplo: AGEU dia 11 tem R$ 179,31 de comissao vindo APENAS de transacoes do gestor, quando deveria mostrar R$ 0,00 (ele nao lancou nada).

## Alteracoes

### 1. Frontend - BarberDashboard.tsx

Remover `tx_*` de todos os calculos:

- **Faturamento mensal de servicos**: remover `tx_basic_total` e `tx_extra_total` da soma
- **Faturamento mensal de produtos**: remover `tx_products_total` da soma
- **Dias trabalhados**: remover `tx_*` do filtro de "dia com producao"
- **Card "MEU FATURAMENTO HOJE"**: remover `tx_*` do total diario
- **Comissao**: continua usando `commission_earned` do banco (que sera corrigido pelo trigger)

### 2. Frontend - ProductionHistory.tsx

- **`getServicesTotal`**: remover `tx_basic_total` e `tx_extra_total`
- **Coluna Produtos**: remover `tx_products_total`

### 3. Banco de Dados - Trigger `calculate_commission`

Alterar para calcular comissao APENAS com campos do barbeiro:

```text
-- ANTES (soma manual + gestor)
v_services_total := services_basic_total + services_extra_total
                  + tx_basic_total + tx_extra_total
v_products_total := products_total + tx_products_total

-- DEPOIS (apenas barbeiro)
v_services_total := services_basic_total + services_extra_total
v_products_total := products_total
```

### 4. Migracao SQL - Recalcular fevereiro

Executar UPDATE em todas as `daily_productions` de fevereiro para disparar o trigger corrigido e recalcular `commission_earned` sem `tx_*`.

```text
UPDATE daily_productions
SET updated_at = now()
WHERE date >= '2026-02-01' AND date <= '2026-02-12';
```

Isso forca o trigger a rodar e recalcular com a nova formula.

## O que NAO muda

- Painel "AO VIVO" do gestor continua lendo apenas `tx_*`
- Rankings do gestor (`get_organization_rankings`) continuam somando ambas fontes
- As `sale_transactions` com `source='manager'` continuam sendo salvas normalmente
- O trigger `recalculate_daily_production_from_transactions` continua populando `tx_*`

## Impacto nos dados

Barbeiros que so tem lancamentos do gestor (ex: AGEU dia 11 e 12, Biel, Braian) passarao a mostrar R$ 0,00 de faturamento e comissao ate que eles proprios facam seus lancamentos. Isso e o comportamento correto: o barbeiro controla sua producao.

## Secao Tecnica

| Arquivo / Recurso | Alteracao |
|---|---|
| `src/components/dashboard/BarberDashboard.tsx` | Remove `tx_*` de 4 calculos (servicos, produtos, dias, hoje) |
| `src/components/dashboard/barber/ProductionHistory.tsx` | Remove `tx_*` de `getServicesTotal` e coluna Produtos |
| Trigger `calculate_commission` (SQL migration) | Remove `tx_*` da formula de comissao |
| Migracao de dados (SQL) | Recalcula `commission_earned` de fevereiro |

