

# Refatoracao Completa: Identificacao por Celular + Wizard Unificado

## Resumo

Adicionar campo `mobile_phone` em `sale_transactions`, implementar busca "Phone First" com fallback inteligente por nome para migrar clientes antigos, validacao anti-fraude, e wizard de 2 etapas otimizado para mobile em ambos os modais (QuickSaleModal e SubscriptionWizardModal).

---

## Alteracoes

### 1. Migracao de Banco de Dados

Adicionar coluna `mobile_phone` (texto, nullable) na tabela `sale_transactions` com indice para buscas rapidas.

### 2. Logica de Busca "Phone First" com Migracao de Base

Fluxo completo ao preencher o celular:

```text
Celular preenchido (11 digitos validos)
  |
  v
Passo A: Busca por mobile_phone no banco
  |
  +-- Encontrou? --> Carrega client_name, marca Recorrente
  |                   Badge: "Identificado pelo Celular (N visitas)"
  |
  +-- NAO encontrou? --> Passo B
        |
        v
Passo B: Busca por client_name (se preenchido, 3+ chars)
  |
  +-- Encontrou historico? --> Marca Recorrente (is_new_client = false)
  |                            Badge: "Historico encontrado pelo nome. Vinculando celular..."
  |                            Proximo insert ja salva o mobile_phone,
  |                            vinculando o celular ao cliente antigo
  |
  +-- NAO encontrou? --> Marca Novo (is_new_client = true)
                          Badge: "Primeiro registro deste cliente"
```

A busca por nome usa `client_name.ilike` SEM filtro de `source` e SEM busca em `description`.

### 3. Higienizacao de Dados

- **Ao salvar (insert):** Remove TODOS caracteres nao numericos. Salva apenas `11988887777`.
- **Na exibicao (front):** Aplica mascara `(11) 98888-7777` via funcao `formatPhone()`.
- **Na busca:** Compara sempre apenas digitos.

### 4. Validacao Anti-Fraude

Mascara de input: `(XX) XXXXX-XXXX`. Numeros bloqueados:
- Todos digitos iguais (00000000000, 11111111111)
- Sequencia crescente (12345678900)
- DDD invalido (< 11)
- Terceiro digito diferente de 9

Botao "Continuar" desabilitado se telefone invalido ou verificacao em andamento.

### 5. QuickSaleModal -- Step 1

Nova ordem:
1. Data da Venda
2. Celular do Cliente (obrigatorio, com mascara e validacao)
3. Nome do Cliente (auto-preenchido se celular encontrado, editavel)
4. Badge de status (Identificado / Vinculando / Primeiro registro)
5. Toggle Recepcao/Loja
6. Tipo de Cliente (pre-preenchido pela busca, com override manual)

### 6. SubscriptionWizardModal -- Step 1 Reorganizado

Nova ordem:
1. Celular do Cliente (obrigatorio)
2. Nome do Cliente (obrigatorio, auto-preenchido se possivel)
3. Badge de status
4. Selecao de Plano
5. Tipo de Cliente (Novo/Da Casa) pre-preenchido
6. Sub-opcoes (Renovacao/Upgrade/Downgrade se Da Casa)

Step 2: Atribuicao (sem mudancas)
Step 3: Resumo de confirmacao (sem campos editaveis)

### 7. Visual Step 2 (QuickSaleModal)

- Cabecalho limpo: apenas botao Voltar + titulo + badge carrinho
- Grid mobile: `grid-cols-2` forcado com `gap-2`
- Cards 30% menores: `p-2.5`, `text-xs`, `text-base`
- Footer: resumo "N itens - R$ X,XX" + botoes Voltar/Confirmar

### 8. Carrinho Individualizado

Logica `tempId` mantida: cada clique = nova linha, sem botoes +/-, remocao por X.

---

## Secao Tecnica

### Arquivos modificados

1. **Migracao SQL** -- `ALTER TABLE sale_transactions ADD COLUMN mobile_phone TEXT; CREATE INDEX ...`
2. `src/components/dashboard/manager/QuickSaleModal.tsx` -- campo celular, busca, badges, bloqueio navegacao, salvar digitos
3. `src/components/dashboard/manager/SubscriptionWizardModal.tsx` -- campo celular, reorganizar Step 1, busca, badges, Step 3 resumo, salvar digitos

### Funcoes utilitarias (inline nos modais)

```text
formatPhone(value): formata para (XX) XXXXX-XXXX
isValidPhone(phone): valida 11 digitos, DDD, anti-fraude
sanitizePhone(phone): retorna apenas digitos (para salvar)
```

### Funcao de busca compartilhada

```text
checkClientHistory(phone, name):
  1. Busca por mobile_phone (digitos) em sale_transactions
  2. Se encontrou: preenche nome, marca recorrente
  3. Se NAO encontrou mas nome tem 3+ chars:
     busca por client_name.ilike em sale_transactions
     Se encontrou: marca recorrente + badge "Vinculando celular..."
  4. Se nada encontrou: marca novo
```

### Novos estados (ambos modais)

```text
mobilePhone, clientHistoryCount, checkingHistory,
manualOverride, phoneIdentified
```

### Sem tabela clients separada

O celular e armazenado em `sale_transactions.mobile_phone`. A vinculacao acontece organicamente: ao vender para "Carlos" com celular X, todas as vendas futuras com celular X serao associadas ao mesmo historico.

