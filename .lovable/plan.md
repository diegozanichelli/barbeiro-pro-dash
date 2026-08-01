## Diagnóstico (confirmado no banco)

A organização **Basic CN12** existe, mas **não tem nenhum usuário gerente vinculado** (zero linhas em `user_roles` para ela). A Edge Function `admin-update-manager` busca o gerente da organização e, não encontrando, responde 404 — daí o toast genérico "Edge Function returned a non-2xx status code".

Há **2 organizações órfãs** hoje (sem gerente): `Basic CN12` e `MadBarber` — ambas com `subscription_status = canceled`. Provável causa histórica: exclusão do usuário do gerente (ou rollback parcial de criação/exclusão de conta) sem remover a organização.

## O que fazer

### 1. `admin-update-manager` passa a recuperar organizações órfãs
Quando não houver gerente para a organização:
- se `email` + `password` foram informados, **criar** o usuário de autenticação (email já confirmado), criar o `profiles.full_name` com o nome do gerente e inserir `user_roles` com `role = manager` e `organization_id` da organização — ou seja, o modal "Editar" passa a também *provisionar* o gerente faltante;
- se o email já existir em outra organização, retornar mensagem clara ("Este email já está vinculado a outra organização");
- se faltar email/senha, retornar 400 com mensagem explícita: "Esta barbearia não possui gerente. Informe email e senha para criar o acesso."

### 2. Mensagens de erro reais na interface
No `SuperAdminDashboard.tsx`, ler o corpo da resposta da função (`FunctionsHttpError`) e exibir a mensagem em português no toast, em vez de "Edge Function returned a non-2xx status code". Isso vale para editar, ativar/desativar e excluir.

### 3. Sinalizar organizações sem gerente na lista
Badge/aviso "Sem gerente" na linha da barbearia (a listagem já vem de `list-managers`, que retorna somente vínculos existentes), para o super admin saber que precisa provisionar o acesso ou excluir a conta.

### 4. Consistência de dados
Nenhuma exclusão automática: as 2 organizações órfãs ficam acessíveis via o fluxo novo (criar gerente) ou via o botão **Excluir** já existente.

## Detalhes técnicos
- Arquivos: `supabase/functions/admin-update-manager/index.ts` (fallback de criação), `src/components/dashboard/SuperAdminDashboard.tsx` (erros + badge), `supabase/functions/list-managers/index.ts` (retornar também organizações sem gerente, com `manager_user_id: null`).
- Validação de senha mantida (mín. 8 caracteres, maiúsculas/minúsculas ou números) e reaproveitada no caminho de criação.
- Sem migração de banco necessária.
