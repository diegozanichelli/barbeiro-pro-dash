
# Revisao Geral de Scroll Mobile no Dashboard do Barbeiro

## Problema
No mobile, varias telas e modais do barbeiro nao permitem rolagem (scroll). O conteudo fica preso e o usuario nao consegue navegar para cima/baixo, especialmente:
- Modal de scripts de venda da IA (conteudo longo sem scroll)
- Dica do Coach IA (card com texto extenso)
- Qualquer dialog com conteudo que ultrapassa a tela

## Causa Raiz
O componente global `DialogContent` (`src/components/ui/dialog.tsx`) nao tem restricao de altura maxima nem overflow scroll. Quando o conteudo do dialog e maior que a tela do celular, ele simplesmente transborda sem possibilidade de rolagem.

## Solucao

### 1. Corrigir `DialogContent` globalmente
Adicionar `max-h-[90vh] overflow-y-auto` ao componente `DialogContent` em `src/components/ui/dialog.tsx`. Isso garante que **todos** os dialogs da aplicacao se tornem scrollaveis no mobile automaticamente.

### 2. Corrigir modal de scripts de venda (AITipsTab)
O dialog de scripts em `AITipsTab.tsx` usa `<DialogContent className="sm:max-w-md">`. Com a correcao global, ele ja herdara o comportamento de scroll. Nenhuma mudanca adicional necessaria neste arquivo.

### 3. Garantir touch-scroll no index.css
Adicionar `overscroll-behavior: contain` e `-webkit-overflow-scrolling: touch` no body para garantir scroll suave em dispositivos iOS e Android.

---

## Detalhes Tecnicos

### Arquivo: `src/components/ui/dialog.tsx`
Alterar a classe do `DialogPrimitive.Content` de:
```text
"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg ..."
```
Para:
```text
"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg max-h-[90vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg ..."
```

### Arquivo: `src/index.css`
Adicionar ao bloco `body`:
```text
body {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
}
```

### Impacto
- Corrige scroll em **todos** os modais da aplicacao (AI scripts, edicao de producao, presenca, vendas, etc.)
- Nao quebra nenhum dialog existente que ja caiba na tela
- Melhora a experiencia touch em iOS (Safari) e Android
