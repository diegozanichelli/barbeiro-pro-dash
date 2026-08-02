Ajustar o relatório individual do barbeiro para que cada marcador tenha nome mais claro e explicação do cálculo.

## O que será feito

1. **Renomear labels no relatório operacional (UI)**
   - `Faturamento` → `Faturamento Total`
   - `Operacional` → `Avulsos`
   - Ajustar descrições auxiliares (ex: "Comissão (sem assinaturas)" já está correto; deixar consistente).

2. **Renomear labels no PDF exportado**
   - Atualizar `barberReportPdf.ts` para usar "Faturamento total" e "Avulsos" nas tabelas de resumo, mantendo a explicação entre parênteses quando necessário.

3. **Explicar como chegamos em cada marcador**
   - Adicionar ícone de info (`Info` do lucide-react) em cada card de métrica do resumo no `BarberReportPage.tsx`.
   - Usar o componente `Tooltip`/`TooltipProvider` existente para mostrar, ao passar o mouse, a fórmula/cálculo de cada indicador:
     - **Faturamento Total**: soma bruta de todas as vendas no período (serviços base, extras, produtos e assinaturas) na unidade filtrada.
     - **Avulsos**: faturamento total menos o valor de assinaturas; é o que entra na meta operacional.
     - **Comissão (sem assinaturas)**: comissão calculada sobre os serviços e produtos avulsos, excluindo assinaturas.
     - **Assinaturas vendidas**: quantidade de planos adquiridos; não gera comissão e não compõe a meta.
     - **Atendimentos**: número de comendas únicas no período.
     - **Ticket médio**: Faturamento Total ÷ Atendimentos.

4. **Consistência de linguagem**
   - Manter todos os textos em português (pt-BR) conforme regra do projeto.
   - Garantir que o termo "Avulsos" seja usado no card e no PDF, e que o tooltip esclareça o que está incluído/excluído.

## Arquivos afetados
- `src/components/dashboard/manager/BarberReportPage.tsx`
- `src/lib/barberReportPdf.ts`
- (possível import do `Tooltip` já existe em `src/components/ui/tooltip.tsx`)

## Não será alterado
- Lógica de cálculo da RPC `get_barber_report_range` (apenas apresentação).
- Cálculo da comissão ou separação de categorias.