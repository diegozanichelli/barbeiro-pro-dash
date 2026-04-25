## Problema

No modal de Venda Rápida (`QuickSaleModal`), o destaque visual de "próximo passo" está piscando o card inteiro que **agrupa "Atribuição da Venda" + "Tipo de Cliente"** (são dois blocos dentro de um mesmo container com `divide-y`). O `ref` e as classes `animate-pulse ring-amber-500` estão no `<div>` externo (linha 1545-1552), por isso os dois piscam juntos.

O esperado: piscar **apenas** o bloco "Atribuição da Venda" e fazer o scroll suave parar nele já mostrando as opções **Barbeiro / Venda Recepção** centralizadas.

## Mudanças

Arquivo: `src/components/dashboard/manager/QuickSaleModal.tsx`

1. **Remover** `ref={attributionCardRef}` e as classes de highlight do `<div>` externo (~linha 1545-1552). O container externo volta a ser apenas um wrapper visual neutro.

2. **Mover** o `ref={attributionCardRef}` e o highlight condicional (`ring-2 ring-amber-500 shadow-lg shadow-amber-500/30 animate-pulse border-amber-500 rounded-md`) para o `<div className="px-3 py-2.5 space-y-2">` da seção "Mandatory Attribution Selector" (~linha 1554), envolvendo somente o bloco da Atribuição (label + seta auxiliar + ToggleGroup Barbeiro/Recepção + seletor de unidade).

3. **Ajustar o auto-scroll** no `useEffect` (~linha 840-855) trocando `block: "center"` por `block: "start"` com um pequeno offset visual, para garantir que ao parar o scroll o usuário já enxergue logo abaixo do label os botões Barbeiro / Venda Recepção (e, no caso da recepção, o seletor da unidade quando expandir). Manter os 3 segundos de pulse e a limpeza do timer.

4. **Tipo de Cliente** permanece intocado (sem anel, sem pulse, sem ref) — apenas o segundo bloco do mesmo wrapper.

## Resultado esperado

- Quando o cliente é identificado (novo ou existente) e ainda não há atribuição, **só o bloco "Atribuição da Venda"** ganha anel laranja pulsante por 3s.
- O scroll suave centraliza o bloco de Atribuição com os botões **Barbeiro / Venda Recepção** visíveis na hora, deixando óbvio onde clicar.
- O bloco "Tipo de Cliente" abaixo segue estático, sem distrair.
- Demais comportamentos (validação obrigatória, seleção de unidade da recepção, fim do pulse ao escolher) continuam iguais.