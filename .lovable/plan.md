## Pré-seleção automática de "Venda Recepção" para cliente novo

Quando o cliente é resolvido como `not_found` (novo, sem histórico), o `QuickSaleModal` agora:

1. Pulsa o card de Atribuição da Venda (já existia).
2. Faz scroll programático até o card (já existia).
3. **NOVO**: Pré-seleciona `attribution = "reception"` automaticamente.
4. Como consequência, o `useEffect` existente abre imediatamente o seletor de unidades (quando há mais de uma unidade ativa).

Resultado: o gestor vê o card destacado, com "Venda Recepção" já marcado e o dropdown de unidades aberto. Basta clicar na unidade — ou mudar para "Barbeiro" se for o caso. Reduz drasticamente o risco de venda ficar sem atribuição.

Arquivo: `src/components/dashboard/manager/QuickSaleModal.tsx` (~linha 843).
