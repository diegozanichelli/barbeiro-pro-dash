

# Destaque visual no seletor de unidade quando vazio

## Objetivo

Quando o gestor escolhe **"Venda Recepção"** com 2+ unidades e tenta avançar sem selecionar a recepção, o seletor deve ficar **visualmente em estado de erro** (borda vermelha + mensagem inline), além do toast já existente.

## Mudanças em `QuickSaleModal.tsx`

### 1. Novo estado de erro local
```ts
const [unitError, setUnitError] = useState(false);
```

### 2. Disparar o erro quando o gestor tenta avançar
- No handler do botão **"Avançar"** do Step 1: se `needsUnitSelection && !selectedUnitId`, setar `setUnitError(true)` (além do toast).
- No `handleCartCheckout`: mesma lógica, setar `setUnitError(true)` antes do `return`.

### 3. Limpar o erro automaticamente
- No `onValueChange` do `Select` de unidade: `setUnitError(false)` quando o usuário escolher uma unidade.
- No `useEffect` que reseta o modal ao abrir/fechar: zerar `unitError`.
- Ao trocar de `attribution` (toggle Barbeiro ↔ Recepção): zerar `unitError`.

### 4. Aplicar o estilo de erro no seletor
No `<SelectTrigger>` do bloco "🏢 Em qual recepção?":
```tsx
<SelectTrigger
  className={cn(
    unitError && "border-destructive ring-2 ring-destructive/30 focus:ring-destructive"
  )}
>
```

E logo abaixo do `<Select>`, mensagem inline condicional:
```tsx
{unitError && (
  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
    <AlertCircle className="h-3 w-3" />
    Selecione em qual recepção a venda aconteceu.
  </p>
)}
```

### 5. Bônus de acessibilidade
- Adicionar `aria-invalid={unitError}` e `aria-describedby` apontando para o `<p>` da mensagem (com `id="unit-error"`).

## Comportamento final

| Ação | Resultado |
|---|---|
| Abrir modal em Recepção multi-unidade sem unidade | Seletor neutro |
| Tentar avançar sem escolher | Borda vermelha + mensagem inline + toast |
| Selecionar uma unidade | Erro some imediatamente |
| Alternar para Barbeiro | Erro some |
| Reabrir modal | Erro zerado |

## Impacto

- **1 arquivo**: `src/components/dashboard/manager/QuickSaleModal.tsx`.
- **Sem mudanças** em validação lógica, RPC, banco ou outras telas.
- **Sem regressão** — apenas camada visual reforçando o feedback que já existia via toast.

