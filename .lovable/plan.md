

# Fix: Comissao Dobrada ao Editar Producao do Barbeiro

## Causa Raiz

O barbeiro **nao tem permissao para deletar** suas proprias transacoes na tabela `sale_transactions`. As politicas de seguranca (RLS) permitem apenas:
- **SELECT** (visualizar)
- **INSERT** (inserir)

Quando o barbeiro edita um lancamento pelo modal de edicao, o sistema tenta:
1. **Deletar** as transacoes antigas (BLOQUEADO pelo RLS - falha silenciosa)
2. **Inserir** as novas transacoes (permitido)

Como a exclusao falha sem erro visivel, as transacoes antigas permanecem no banco. As novas sao inseridas em cima. O trigger do banco soma TUDO, duplicando os valores de faturamento e comissao.

## Solucao

Adicionar uma politica RLS de **DELETE** para barbeiros na tabela `sale_transactions`, permitindo que deletem apenas suas proprias transacoes com `source='barber'`.

## Alteracao

**Migration SQL:**

```sql
CREATE POLICY "Barbers can delete their own barber transactions"
  ON public.sale_transactions
  FOR DELETE
  USING (
    source = 'barber'
    AND barber_id IN (
      SELECT id FROM barbers WHERE user_id = auth.uid()
    )
  );
```

Tambem sera adicionada uma politica de **UPDATE** para prevenir problemas similares no futuro:

```sql
CREATE POLICY "Barbers can update their own barber transactions"
  ON public.sale_transactions
  FOR UPDATE
  USING (
    source = 'barber'
    AND barber_id IN (
      SELECT id FROM barbers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    source = 'barber'
    AND barber_id IN (
      SELECT id FROM barbers WHERE user_id = auth.uid()
    )
  );
```

**Seguranca:** A restricao `source = 'barber'` garante que o barbeiro so pode alterar/excluir seus proprios lancamentos, nunca os do gestor (`source = 'manager'`).

## Correcao Retroativa

Apos aplicar a migration, sera necessario limpar os dados duplicados existentes e recalcular as comissoes do mes de fevereiro para corrigir os valores que ja foram afetados.

## Resultado

- Barbeiros poderao editar seus lancamentos sem duplicacao
- Transacoes do gestor (`source='manager'`) continuam protegidas
- Comissoes calculadas corretamente apos edicao

