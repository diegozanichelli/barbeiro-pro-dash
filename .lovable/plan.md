
# Adicionar Nome do Cliente na Comanda (Ao Vivo)

## Resumo
Adicionar um campo "Nome do Cliente" no QuickSaleModal para que o gestor identifique cada venda do dia. O dado e temporario (apagado apos 30 dias).

---

## Etapa 1 -- Banco de Dados

### Nova coluna em `sale_transactions`
- `client_name` (text, nullable) -- nome do cliente da comanda
- Nao precisa de indice especial, e apenas informativo

### Limpeza automatica (30 dias)
- Criar uma funcao SQL `cleanup_old_client_names()` que seta `client_name = NULL` em registros com mais de 30 dias
- Criar um cron job via `pg_cron` (ou trigger simples) para rodar essa limpeza periodicamente
- Alternativa mais simples: criar a funcao e o gestor pode chama-la manualmente, ou usar o `pg_cron` se disponivel

---

## Etapa 2 -- Interface (QuickSaleModal)

### Adicionar campo "Nome do Cliente"
- Novo input de texto no cabecalho do modal (junto com "Clientes Atendidos" e "Cliente Novo")
- Label: "Nome do Cliente (opcional)"
- Placeholder: "Ex: Joao"
- O campo aparece tanto no modo catalogo quanto no modo manual
- O valor e gravado em todas as transacoes do carrinho daquela comanda

### Exibicao no TransactionManagerModal
- Mostrar o nome do cliente na listagem de transacoes do dia (coluna ou badge ao lado do item)
- Permite ao gestor identificar rapidamente qual venda pertence a qual cliente

---

## Detalhes Tecnicos

### Migracao SQL
```text
ALTER TABLE sale_transactions
  ADD COLUMN client_name text;

-- Funcao para limpar nomes antigos (>30 dias)
CREATE OR REPLACE FUNCTION cleanup_old_client_names()
RETURNS void AS $$
BEGIN
  UPDATE sale_transactions
  SET client_name = NULL
  WHERE client_name IS NOT NULL
    AND created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Arquivos a modificar
- `src/components/dashboard/manager/QuickSaleModal.tsx` -- adicionar state `clientName`, input no header, gravar na transacao
- `src/components/dashboard/manager/TransactionManagerModal.tsx` -- exibir `client_name` na listagem

### Mudancas no QuickSaleModal
- Novo state: `const [clientName, setClientName] = useState("")`
- Reset no `resetForm()`
- Input no cabecalho (area expansivel junto aos controles existentes)
- No `handleCartCheckout`: adicionar `client_name: clientName || null` em cada transacao
- No `handleManualSale`: mesma logica (se aplicavel)
