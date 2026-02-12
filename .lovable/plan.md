

# Remover Aba "Valor Manual" do BarberSaleForm

## O que muda

A aba "Manual" sera completamente removida do formulario de venda do barbeiro. O barbeiro passara a ter apenas duas abas: **Servicos** e **Produtos**, ambas baseadas nos cards do catalogo.

Isso elimina o risco de lancamentos manuais inconsistentes que nao geram `sale_transactions` e conflitam com o trigger de recalculo.

## Alteracoes

Um unico arquivo sera modificado: `BarberSaleForm.tsx`.

### Remocoes:
- Estado `manualValue` e `manualCategory` (linhas 77-78)
- Tipo `"manual"` do estado `activeTab` (linha 64)
- Funcao `handleConfirmManualSale` inteira (linhas 265-318)
- Funcao auxiliar `handleNumericInput` (linhas 44-56) -- usada apenas no modo manual
- Aba "Manual" no `TabsList` (linhas 406-409) -- o grid passa de 3 colunas para 2
- Conteudo `TabsContent value="manual"` (linhas 472-513)
- Condicao `activeTab !== "manual"` no espacador e no footer fixo (linhas 517 e 522)
- Imports nao utilizados: `Hash`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`

### Ajustes:
- `TabsList` muda de `grid-cols-3` para `grid-cols-2`
- O tipo de `activeTab` muda de `"services" | "products" | "manual"` para `"services" | "products"`
- O footer fixo do carrinho e o espacador ficam visiveis em todas as abas (sem condicao de `manual`)

## Resultado

O barbeiro tera uma experiencia limpa com apenas cards do catalogo. Se um item nao esta no catalogo, o gestor deve cadastra-lo. Todos os lancamentos passam obrigatoriamente pelo pipeline de `sale_transactions`, garantindo integridade total de comissoes e relatorios.

