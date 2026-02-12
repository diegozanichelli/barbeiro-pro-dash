

# Corrigir Wizard de Venda: Telefone Opcional e Cliente da Casa como Padrao

## Problema Identificado

O `QuickSaleModal.tsx` tem duas restricoes que estao travando o fluxo do gestor:

1. **Telefone obrigatorio** (linha 353): O botao "Continuar" so desbloqueia com 11 digitos validos. O gestor nao consegue prosseguir sem preencher.
2. **Auto-selecao de "Cliente Novo"** (linhas 245-246): Quando o telefone nao e encontrado no historico, o sistema muda automaticamente para "Cliente Novo", dando a impressao de que esta travado.

## Solucao

### 1. Tornar o telefone opcional

Alterar a condicao `canProceedStep1` (linha 353) para permitir prosseguir SEM telefone:

```text
ANTES:
  const canProceedStep1 = isPhoneComplete && !clientHistory.checking && !phoneError;

DEPOIS:
  const isPhoneEmpty = phoneDigits.length === 0;
  const canProceedStep1 = (isPhoneEmpty || isPhoneComplete) && !clientHistory.checking && !phoneError;
```

Isso significa:
- Sem telefone: pode prosseguir (o campo fica vazio)
- Com telefone parcial (ex: 5 digitos): bloqueado (previne dados incompletos)
- Com telefone completo e valido: pode prosseguir (e o historico e verificado)

Remover o asterisco vermelho (*) do label "Celular do Cliente" (linha 605).

### 2. Manter "Cliente da Casa" como padrao

Alterar o comportamento quando o telefone nao e encontrado (linha 245-246):

```text
ANTES:
  } else if (res.status === "not_found") {
    if (!manualOverride) setIsNewClient(true);
  }

DEPOIS:
  } else if (res.status === "not_found") {
    // Nao muda automaticamente para "Novo"
    // O gestor decide manualmente
  }
```

O padrao permanece "Cliente da Casa" (`isNewClient = false`). O gestor muda para "Novo" apenas quando quiser. A auto-deteccao so ocorre quando o historico ENCONTRA o cliente (phone_found ou name_found), confirmando que e "Da Casa".

### 3. Atualizar o Badge de "Primeiro registro"

O badge "Primeiro registro deste cliente" (linhas 534-540) continuara aparecendo como uma SUGESTAO visual, mas sem forcar a mudanca do toggle.

## Arquivos Alterados

| Arquivo | Alteracao |
|---|---|
| `QuickSaleModal.tsx` (linha 353) | Permitir prosseguir sem telefone |
| `QuickSaleModal.tsx` (linha 605) | Remover asterisco obrigatorio do label |
| `QuickSaleModal.tsx` (linhas 245-246) | Remover auto-selecao de "Cliente Novo" |

## O que NAO muda

- A verificacao de historico continua funcionando quando o telefone e preenchido
- O auto-preenchimento do nome quando o cliente e encontrado continua
- O toggle "Cliente da Casa / Novo" continua acessivel e funcional
- A validacao anti-fraude do telefone continua (bloqueia numeros invalidos se digitados)

