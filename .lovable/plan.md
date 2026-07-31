## Diagnóstico (confirmado)

Não é bug de cálculo. Na tela do print, a **Unidade** selecionada é *Adrianópolis*, mas o barbeiro *AGEU FELIPE* é de **Parque 10**.

Consulta ao banco no período 01/07/2026 a 31/07/2026 para esse barbeiro:
- 553 vendas, R$ 17.528,16 de faturamento
- **todas** com unidade = Parque 10, nenhuma em Adrianópolis

A função do relatório aplica o filtro `unidade` junto com o barbeiro, então a combinação "Adrianópolis + AGEU FELIPE" devolve zero corretamente — a tela apenas não avisa disso, e ainda mostra "PARQUE 10" no cabeçalho (unidade cadastral do barbeiro), o que confunde.

## O que fazer

1. **Lista de barbeiros respeita a unidade selecionada**
   Ao escolher uma unidade, o seletor de barbeiro passa a listar só os barbeiros daquela unidade. Se o barbeiro já selecionado não pertencer à nova unidade, a seleção é limpa (evita a combinação impossível).

2. **Aviso quando o resultado vier vazio**
   Se o relatório retornar zerado, exibir um bloco explicativo no lugar dos cards vazios: "Nenhuma venda encontrada para este barbeiro nesta unidade e período" + botão **"Ver todas as unidades"**, que refaz a busca com unidade = Todas.

3. **Cabeçalho mais claro**
   No cabeçalho do resultado, mostrar a unidade do filtro aplicado (ex.: "Adrianópolis (filtro)") em vez de apenas a unidade de cadastro do barbeiro, para não parecer que os dados são de Parque 10.

4. **Nota nos filtros**
   Texto pequeno sob o seletor: "O filtro de unidade considera a unidade onde a venda foi feita."

## Detalhes técnicos

- `src/components/dashboard/manager/BarberReportPage.tsx`: passar `unitId` para o `BarberCombobox` (filtro por unidade), resetar `barberId` na troca de unidade, tratar estado "resultado vazio" com o atalho de refazer em todas as unidades e ajustar o texto do cabeçalho.
- `src/components/dashboard/manager/BarberCombobox.tsx`: aceitar prop opcional `unitId` e filtrar a query de barbeiros por ela.
- Nenhuma mudança na RPC `get_barber_report_range` e nenhuma migração — a lógica de dados está correta.
