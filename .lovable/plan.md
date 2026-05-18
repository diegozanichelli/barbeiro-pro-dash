## Diagnóstico

O botão **Editar** aparece nos slides de Capa e Encerramento, mas o clique não funciona por dois motivos distintos, dependendo de onde o usuário tenta clicar:

### 1. Pré-visualização (grade de miniaturas em `MonthlyPresentation`)
Os slides são renderizados dentro de:
```tsx
<div className="pointer-events-none">{s.el}</div>
```
Esse `pointer-events-none` desativa **todos** os cliques no slide — inclusive o botão Editar. Foi colocado para que as miniaturas não fossem interativas, mas bloqueou também o único controle que precisava continuar clicável.

### 2. Modo apresentação (tela cheia em `PresentationDeck`)
O contêiner da apresentação usa `z-[100]`:
```tsx
<div className="fixed inset-0 z-[100] ...">
```
Já o `Dialog` do shadcn (`DialogOverlay` e `DialogContent`) usa `z-50` por padrão. Resultado: ao clicar em Editar dentro da apresentação o dialog até abre (no portal, fora da árvore), mas fica **atrás** do deck — invisível e sem receber clique.

## Correções

### A. `src/components/dashboard/manager/presentation/MonthlyPresentation.tsx`
- Remover `pointer-events-none` do wrapper das miniaturas e, para manter o card todo clicável como atalho de edição visual sem regressões, deixar a área do slide com `pointer-events-auto` apenas no botão de Editar. Implementação concreta: trocar o wrapper por `<div className="[&_*]:pointer-events-none [&_button]:pointer-events-auto">` — assim só botões (Editar) recebem clique, mantendo o comportamento de "miniatura não interativa" para o restante do conteúdo.

### B. `src/components/dashboard/manager/presentation/SlideEditDialog.tsx`
- Elevar o z-index do `DialogContent` acima do deck:
  - Adicionar `z-[200]` à className do `DialogContent`.
- Garantir que o overlay também fique acima do deck. Como o `DialogOverlay` é renderizado internamente pelo `DialogContent` do shadcn e fixa `z-50`, adicionar um estilo inline / classe via wrapper não é trivial. Solução: importar `DialogOverlay` e `DialogPortal` diretamente do componente shadcn e montar manualmente o conteúdo do dialog no `SlideEditDialog`, passando `z-[200]` tanto no overlay quanto no content. Isso é local ao arquivo e não altera o componente compartilhado.

Alternativa mais leve (preferida): manter `<Dialog><DialogContent className="z-[200] ...">`, e em paralelo adicionar uma regra global pequena no `index.css` para o overlay quando o deck está ativo — porém isso vaza estilo. Vamos com a primeira opção (montagem manual com `DialogPortal` + `DialogOverlay` + `DialogPrimitive.Content`) restrita ao `SlideEditDialog`.

### C. Verificação
- Após implementar, validar via browser:
  1. Na pré-visualização da aba Relatórios → Apresentação Mensal, clicar em "Editar" nas miniaturas de Capa e Encerramento → dialog abre e salva.
  2. Em "Iniciar Apresentação", navegar até Capa/Encerramento, clicar em "Editar" → dialog aparece **na frente** do deck e é interativo (digitar, salvar, restaurar).

## Fora de escopo
- Não alterar regras de negócio, RPC, ou outros slides.
- Não trocar o componente Dialog compartilhado do projeto.