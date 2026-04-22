

# Mostrar seletor de recepção logo após o contato

## Problema atual

No `QuickSaleModal`, quando o gestor escolhe **"Venda Recepção"** e a barbearia tem 2+ unidades, o seletor "Em qual recepção?" só aparece depois que o gestor preenche **nome + telefone completo** (porque ele está renderizado no bloco que aparece quando `attributionResolved` é true). O ideal é que apareça **assim que o telefone estiver completo** (ou até antes), para o gestor já decidir a unidade enquanto digita o nome.

## Mudança proposta

No Step 1 do `QuickSaleModal.tsx`, **mover o bloco do seletor "🏢 Em qual recepção?"** para logo abaixo do `ToggleGroup` de atribuição (Barbeiro/Recepção), **fora** do bloco condicional que depende de `attributionResolved` ou de telefone preenchido.

### Regras de exibição (continuam as mesmas)

- Aparece **só quando** `attribution === "reception"` **E** `units.length > 1`.
- Pré-seleção inteligente continua: `prefillUnitId` (filtro do header) > única unidade > vazio.
- Se `units.length === 1`: continua oculto (auto-seleção silenciosa).
- Se `units.length === 0`: continua oculto.

### Ordem visual final no Step 1 (Recepção)

```text
┌─────────────────────────────────────────┐
│ 1. Atribuição da venda                  │
│    [ Barbeiro ]  [ 🏢 Recepção ]        │
├─────────────────────────────────────────┤
│ 2. 🏢 Em qual recepção?  ← MOVIDO       │
│    [ Select de unidades ]               │
├─────────────────────────────────────────┤
│ 3. Telefone do cliente                  │
│    [ (XX) XXXXX-XXXX ]                  │
├─────────────────────────────────────────┤
│ 4. Nome do cliente                      │
│    [ ... ]                              │
└─────────────────────────────────────────┘
```

Para venda de Barbeiro a ordem permanece: Atribuição → (combobox de barbeiro se vier sem `barberId`) → Telefone → Nome.

## Mudança concreta

Em `src/components/dashboard/manager/QuickSaleModal.tsx`:

1. **Localizar** o bloco do seletor de unidade (atualmente renderizado depois de telefone/nome, dentro do trecho que só aparece após atribuição+contato resolvidos).
2. **Movê-lo** para imediatamente após o `ToggleGroup` de atribuição (e após o combobox de seleção de barbeiro, quando aplicável), envolvendo na mesma condição `attribution === "reception" && units.length > 1`.
3. **Sem mudanças** na validação (`canProceedStep1` continua exigindo `selectedUnitId` quando recepção+multi-unidade) nem no envio (`p_unit_id` na RPC).

## Impacto

- **UX:** o gestor vê e escolhe a unidade já no início, sem precisar preencher contato antes.
- **Sem regressão:** validações, RPC e fluxo de barbeiro permanecem idênticos.
- **Sem mudanças de banco.** Apenas reordenação de JSX em 1 arquivo.

