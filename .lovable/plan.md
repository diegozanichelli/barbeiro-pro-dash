

# Esclarecer diferença entre abas Assinaturas, Recepção e Inteligência

## Problema

O usuário vê 3 números diferentes nas 3 abas e não entende por que divergem:

| Aba | O que mede hoje | Exemplo (Abr/2026) |
|---|---|---|
| **Assinaturas** (Conversão) | Adesões **novas atribuídas a barbeiros** + linha agregada de Recepção. Denominador = clientes novos únicos atendidos | 295 clientes / 44 assinaturas |
| **Recepção** | **Apenas** vendas sem barbeiro (`barber_id IS NULL`), separadas por unidade | 27 no Parque 10 |
| **Inteligência** | Movimentação **completa da carteira**: novas + renovações + upgrades + downgrades, com receita | 60 novas / 6 renov / 5 upg / 0 down |

São **respostas para perguntas diferentes**, mas a UI não comunica isso. Os números são corretos — só falta contexto.

## Solução: deixar o escopo explícito em cada aba

Sem mexer em cálculo nenhum. Apenas tornar a diferença óbvia.

### 1. Renomear os títulos das abas (mais descritivos)

| Antes | Depois |
|---|---|
| Assinaturas | Conversão por Barbeiro |
| Recepção | Vendas da Recepção |
| Inteligência | Carteira de Assinaturas |

Os ícones permanecem.

### 2. Banner explicativo no topo de cada aba

Card discreto (cor neutra, ícone Info) abaixo do header de cada relatório:

- **Conversão por Barbeiro**: "Mede quantos clientes novos atendidos pelos barbeiros viraram assinantes. Inclui também uma linha agregada da Recepção. Critério: assinaturas com ação = nova ÷ pessoas únicas (por celular)."
- **Vendas da Recepção**: "Mostra **apenas** vendas registradas sem barbeiro atribuído (balcão), separadas por unidade. Não inclui vendas atribuídas a barbeiros."
- **Carteira de Assinaturas**: "Visão completa da movimentação da carteira no período: novas adesões, renovações, upgrades e downgrades, com a receita gerada por cada tipo. Inclui vendas de barbeiros **e** da recepção."

### 3. Tooltip de ajuda nos números principais

Adicionar `<HoverCard>` ou tooltip no ícone `?` ao lado de cada métrica chave, explicando exatamente o que entra e o que não entra na conta.

Exemplo (Inteligência → "Novas Assinaturas: 60"):
> Inclui toda assinatura com `subscription_action = 'new'` no mês — barbeiros + recepção, clientes novos e da casa.

Exemplo (Conversão → "Assinaturas Vendidas: 44"):
> Mesmo critério da aba Carteira, mas exibido por barbeiro + recepção. Total geral aqui = total da aba Carteira.

### 4. Linha "Como esses números se relacionam" (rodapé compartilhado)

No rodapé das 3 abas, um pequeno bloco recorrente:

> **Os 3 relatórios são complementares:**
> - **Carteira** = todas as movimentações no mês (novas + renov + up/down)
> - **Conversão** = só novas adesões, distribuídas por barbeiro
> - **Recepção** = só novas adesões sem barbeiro, distribuídas por unidade
>
> O número de "Novas Assinaturas" da Carteira deve coincidir com o total da aba Conversão (incluindo a linha Recepção).

## Arquivos afetados

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/components/dashboard/manager/BarberEvolution.tsx` | Renomear labels das abas Assinaturas/Recepção/Inteligência |
| 2 | `src/components/dashboard/manager/SubscriptionPerformanceReport.tsx` | Adicionar banner Info no topo + tooltip nas métricas + bloco de relação no rodapé |
| 3 | `src/components/dashboard/manager/ReceptionPerformanceReport.tsx` | Mesmo tratamento |
| 4 | `src/components/dashboard/manager/SubscriptionAnalytics.tsx` | Mesmo tratamento |

## Resultado esperado

O usuário abre qualquer uma das 3 abas e entende em 5 segundos:
- O que aquela tela mede
- Por que o número difere das outras abas
- Onde encontrar o número que ele realmente quer ver

Zero mudança de cálculo, zero risco de regressão. Só clareza.

## Pergunta antes de implementar

Você prefere:

- **(A)** Aplicar tudo de uma vez (renome + banners + tooltips + rodapé) — solução completa, mais texto na tela
- **(B)** Só banners explicativos no topo (sem renomear abas, sem tooltip, sem rodapé) — minimalista, resolve 80% da confusão
- **(C)** Renomear abas + banner no topo, sem tooltips/rodapé — meio-termo recomendado

Me diz qual prefere que eu implemento.

