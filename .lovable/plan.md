
# Plano: Sistema de Auditoria Oculta (Gestor vs Barbeiro)

## ✅ IMPLEMENTADO

### Contexto

O sistema agora separa completamente os lançamentos do Gestor (Ao Vivo) dos lançamentos manuais do Barbeiro, mantendo o **caráter educativo** onde o barbeiro PRECISA lançar sua produção diariamente.

---

## Arquitetura de Dados

### Colunas na tabela `daily_productions`

| Prefixo | Descrição | Preenchido por |
|---------|-----------|----------------|
| `tx_*` | Dados do Ao Vivo (transações) | Trigger após QuickSaleModal |
| `manual_*` | Dados declarados pelo barbeiro | DailyProductionForm |
| Campos legados | Valor OFICIAL para comissão | = manual_* (declaração do barbeiro) |

### Campos Criados

**Gestor (Ao Vivo):**
- `tx_basic_total` - Serviços básicos via transações
- `tx_extra_total` - Serviços extras via transações
- `tx_products_total` - Produtos via transações
- `tx_clients_count` - Clientes via transações
- `tx_services_count` - Qtd serviços via transações
- `tx_products_count` - Qtd produtos via transações
- `tx_commission_earned` - Comissão calculada das transações

**Barbeiro (Manual):**
- `manual_basic_total` - Serviços básicos declarados
- `manual_extra_total` - Serviços extras declarados
- `manual_products_total` - Produtos declarados
- `manual_clients_count` - Clientes declarados
- `manual_services_count` - Qtd serviços declarados
- `manual_products_count` - Qtd produtos declarados

---

## Fluxo de UX

### 1. Gestor Registra Venda no Ao Vivo
```
QuickSaleModal → sale_transactions → Trigger → tx_* atualizado
```
- Os campos `tx_*` são preenchidos automaticamente
- O Ao Vivo mostra o valor em tempo real
- **NÃO afeta os campos legados** (services_basic_total, etc.)

### 2. Barbeiro Lança Produção (DailyProductionForm)
```
Formulário ZERADO → Barbeiro digita → Grava em manual_* e campos legados
```
- Formulário sempre começa ZERADO (não pré-preenche com tx_*)
- Barbeiro digita quanto produziu
- Valor vai para `manual_*` E para campos legados (valor oficial)

### 3. Feedback de Divergência
Após salvar, o sistema compara:
- **Total Manual** (declarado pelo barbeiro)
- **Total TX** (registrado pelo gestor no Ao Vivo)

Se divergência > 5%:
```
⚠️ MODAL DE ALERTA
"O Gestor registrou R$ X, mas você declarou R$ Y. Confirme com a recepção."
```

Se bateu:
```
✅ MODAL DE SUCESSO
"Fechamento Perfeito! Dados confirmados."
```

---

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| **Migração SQL** | Colunas tx_* e manual_* criadas, trigger atualizado |
| `DailyProductionForm.tsx` | Grava em manual_*, verifica divergência, mostra modal |
| `DivergenceModal.tsx` | Novo componente de feedback visual |
| `BarberDashboard.tsx` | Passa organizationId para o form |

---

## Benefícios

✅ **Caráter Educativo**: Barbeiro PRECISA lançar manualmente  
✅ **Auditoria Oculta**: Gestor monitora em tempo real sem interferir  
✅ **Segurança**: Sistema detecta e alerta divergências  
✅ **Sem Duplicação**: Dados paralelos, nunca somados  
✅ **Valor Oficial**: Sempre o declarado pelo barbeiro (compromisso dele)  
