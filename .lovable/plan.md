## Plano de Hardening de Segurança

Rodei a varredura completa de segurança no backend e encontrei **41 achados** (3 críticos, 38 avisos). Abaixo o plano priorizado para corrigir.

---

### 🔴 CRÍTICOS (corrigir primeiro)

**1. Telefones e nomes de clientes vazando entre barbeiros**
Hoje qualquer barbeiro autenticado consegue ler `mobile_phone` e `client_name` de **todos** os clientes da organização via `sale_transactions` e `client_purchase_history` (políticas SELECT abertas por organização). Isso é uma exposição séria de dados pessoais (LGPD).
- **Correção:** restringir SELECT para barbeiros apenas às linhas onde `barber_id = (barbeiro do auth.uid())`. Managers e super_admin continuam vendo tudo.

**2. Bypass de organização via múltiplas roles (`get_user_organization`)**
A função usa `LIMIT 1` sem `ORDER BY`. Se um usuário tiver linhas em `user_roles` para mais de uma organização (acidental ou malicioso), retorna org arbitrária — pode ler/gravar dados da org errada.
- **Correção:** adicionar índice/constraint UNIQUE em `user_roles(user_id)` (ou `(user_id, role)` já existe — mas falta restringir 1 org por user) e/ou adicionar `ORDER BY created_at` determinístico.

**3. Realtime sem RLS em `realtime.messages`**
Tabelas `barbers` e `daily_productions` (dados financeiros/comissão) estão publicadas no Realtime. Qualquer usuário autenticado pode assinar qualquer canal e receber atualizações ignorando o RLS das tabelas.
- **Correção:** adicionar policies em `realtime.messages` filtrando por `auth.uid()` e organização do tópico.

---

### 🟡 AVISOS PRIORITÁRIOS

**4. Proteção de senhas vazadas (HIBP) desativada**
- **Correção:** ligar `password_hibp_enabled` no auth (chamada simples).

**5. `stripe_customer_id` visível para barbeiros**
A policy "Managers can view their organization" em `organizations` na verdade libera SELECT para qualquer membro da org (inclusive barbeiros), expondo o ID Stripe.
- **Correção:** restringir a policy a `has_role('manager') OR has_role('super_admin')`. Para barbeiros, expor apenas campos públicos via view (`name`, `championship_name`).

**6. Chaves WebPush (`auth`, `p256dh`) legíveis por managers**
Material criptográfico de outros usuários acessível a managers da org — sem necessidade operacional.
- **Correção:** restringir SELECT de managers a colunas não sensíveis (via view) ou remover a policy de manager (push é manipulado server-side em edge function com service role).

**7. `subscription_plan_services` sem SELECT para barbeiros**
Pode causar bugs silenciosos no app do barbeiro.
- **Correção:** adicionar policy SELECT por organização (somente leitura).

---

### 🟢 AVISOS DE LINTER (em massa, baixo risco)

**8. 30 funções `SECURITY DEFINER` executáveis por anon/authenticated**
Funções como `calc_expected_pacing`, `get_organization_rankings`, `auto_replicate_goals` etc. estão acessíveis publicamente. A maioria já valida `auth.uid()` internamente, mas convém revogar EXECUTE para `anon` e manter apenas para `authenticated`.
- **Correção:** `REVOKE EXECUTE ... FROM anon` em todas as funções do schema public.

**9. `search_path` mutável em alguma função**
Apenas 1 ocorrência. Adicionar `SET search_path = public` no `CREATE OR REPLACE`.

**10. Extensão instalada no schema `public`**
Aviso baixo — exige mover extensão de schema (operação invasiva). Recomendo **deixar como ignorado** (custo alto, risco baixo).

---

### Etapas de execução (ordem)

```
1. Migration SQL única corrigindo:
   - Policies SELECT em sale_transactions, client_purchase_history (crítico #1)
   - get_user_organization com ORDER BY + UNIQUE em user_roles (crítico #2)
   - Policies em realtime.messages (crítico #3)
   - Policy de organizations restrita a manager/super_admin (#5)
   - View pública de organizations para barbeiros se necessário
   - Policy SELECT em subscription_plan_services para barbeiros (#7)
   - Revisão de manager policy em push_subscriptions (#6)
   - REVOKE EXECUTE ... FROM anon nas funções SECURITY DEFINER (#8)
   - Fix do search_path da função pendente (#9)

2. configure_auth: ativar password_hibp_enabled (#4)

3. Atualizar frontend (se algum componente do barbeiro consumir
   colunas que deixarão de ser visíveis: client_name/mobile_phone
   em sale_transactions de outros barbeiros, organizations.stripe_customer_id).
   Provavelmente nenhuma mudança é necessária pois o app do barbeiro
   é read-only e só usa seus próprios dados.

4. Rodar security scan novamente para confirmar.

5. Atualizar @security-memory documentando o que foi corrigido
   e o que foi conscientemente ignorado (extensão em public).
```

### Riscos / pontos de atenção

- A restrição de SELECT em `sale_transactions` para barbeiros pode quebrar telas que mostram histórico cruzado — preciso confirmar que o app do barbeiro só consulta `barber_id = self` (memória do projeto indica que sim: "Barber Read-only App").
- Adicionar UNIQUE em `user_roles(user_id)` quebra o multi-org se o produto suportar isso. Confirmar com você antes.

**Posso prosseguir com essa ordem? Tem alguma restrição (ex.: usuário pode ter mais de uma role/org)?**