## Problema

Hoje, ao "Regularizar" uma assinatura na aba **Clientes**, o `SubscriptionWizardModal` força a venda a ser atribuída a **Recepção** ou **Barbeiro**. Quando o gestor está corrigindo justamente uma falha (recepção esqueceu de lançar, barbeiro não anotou, pagamento veio só pelo extrato), não existe a opção de marcar que **quem teve que entrar para resolver foi o próprio gestor**. Isso distorce os relatórios — pontos, conversão e atribuição vão parar em alguém que de fato não vendeu.

O gestor precisa de uma 3ª opção, **"Gestor (recuperação)"**, e os relatórios precisam mostrar quantas regularizações o gestor teve que assumir, separado por unidade, para evidenciar onde a operação está falhando.

## Solução em uma frase

Adicionar a opção **"Gestor"** no passo de atribuição, gravar essa marcação na transação, e adicionar um relatório dedicado **"Recuperações do Gestor"** que mostra quantas assinaturas (e qual valor) foram salvas pelo gestor por unidade/período, com o detalhe de cada uma.

---

## Mudanças

### 1. Banco de dados (migração)

Adicionar coluna em `sale_transactions` para marcar a origem da atribuição:

```sql
ALTER TABLE public.sale_transactions
  ADD COLUMN attribution_source text;
-- valores esperados: 'barber' | 'reception' | 'manager_rescue' | NULL (legado)
```

Índice parcial para acelerar o relatório de recuperações:

```sql
CREATE INDEX idx_sale_transactions_manager_rescue
  ON public.sale_transactions (organization_id, created_at)
  WHERE attribution_source = 'manager_rescue';
```

Sem nova tabela. Não há mudança em RLS — herda as policies existentes de `sale_transactions`. Não precisa de trigger novo.

### 2. Wizard de assinatura (`SubscriptionWizardModal.tsx`)

- Estender o tipo: `attributionType: "reception" | "barber" | "manager_rescue" | null`.
- Adicionar um **3º botão** no Step 2 ("Quem realizou essa venda?"):
  - Label: **"Gestor (recuperação)"**
  - Sub-texto: *"Recepção/barbeiro falharam em lançar"*
  - Ícone: `ShieldAlert` (lucide).
- Quando `manager_rescue` for selecionado:
  - Continua exigindo **unidade** (qual recepção/loja falhou), mesma UI do fluxo "reception".
  - **Não atribui pontos** a barbeiro nem à recepção.
  - Toast final: *"Assinatura registrada como recuperação do gestor — nenhum ponto distribuído."*
- Ao gravar em `sale_transactions`:
  - `barber_id = NULL`
  - `unit_id = selectedUnitId` (obrigatório)
  - `daily_production_id = NULL`
  - `attribution_source = 'manager_rescue'`
  - Demais campos (`source='manager'`, plano, ação, etc.) iguais ao fluxo atual.
- Nos fluxos atuais (reception / barber), também passar `attribution_source` correspondente para manter os dados consistentes daqui pra frente.

### 3. Relatório

Local: dentro de **Relatórios → Assinaturas** (`SubscriptionPerformanceReport.tsx`), adicionar um **novo card/seção no topo** chamada **"Recuperações do Gestor"**, visível só se houver pelo menos 1 registro no período.

Conteúdo:
- KPIs grandes: nº de recuperações, MRR salvo (soma de `price_sold`), % sobre o total de adesões do período.
- Tabela por **unidade**: unidade, nº de recuperações, MRR salvo, última recuperação.
- Linha de aviso vermelha/âmbar quando uma unidade ultrapassar X recuperações no período (ex: ≥5) — indicador de falha operacional.
- Botão "Ver detalhes" → modal listando cada transação (cliente, telefone, plano, data, ação new/renew).

Filtros: usa o mesmo filtro de período e unidade já existentes na aba de relatórios.

Implementação: query direta `sale_transactions` com `attribution_source = 'manager_rescue'` + join em `units` pelo `unit_id`. Sem RPC nova nesta primeira versão (volume baixo).

### 4. Apresentação mensal (opcional, escopo pequeno)

Adicionar 1 slide novo `ManagerRescueSlide` na apresentação mensal mostrando o total de recuperações no período e ranking de unidades com mais falhas. Pode ser incluído junto, já que a infra do deck e o RPC `get_presentation_data_range` ficam num arquivo só — adiciono ali a métrica `manager_rescue_count` e `manager_rescue_mrr` por unidade.

> Se preferir deixar pra um próximo passo, basta dizer e eu corto este item.

---

## Fora de escopo

- Não vou alterar a lógica de pontos/comissão do campeonato (já que `manager_rescue` simplesmente não atribui pontos, é só não chamar a rotina).
- Não vou criar nova tabela — uma coluna em `sale_transactions` é suficiente e mantém o histórico unificado.
- Não vou retroagir dados antigos: registros anteriores ficam com `attribution_source = NULL` e continuam aparecendo nos relatórios atuais como sempre.
- Não mexo no fluxo do PDV ao vivo nem nas vendas de serviço/produto — só assinaturas via wizard.

---

## Dúvida rápida antes de aplicar

Quer o slide novo na apresentação mensal já nessa leva, ou só o relatório por enquanto?
