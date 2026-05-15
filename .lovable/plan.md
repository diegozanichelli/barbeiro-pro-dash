## Objetivo

Quando o Super Admin clicar em **Revogar** (gratuita → `past_due`) ou **Desativar** (active → `canceled`), o gestor/barbeiro daquela organização ainda consegue **fazer login**, mas é levado para uma tela bloqueante dizendo que a assinatura está expirada e que precisa entrar em contato com o administrador. Ele **não consegue fechar nem navegar** para nenhuma outra tela enquanto o status não for revertido.

## O que já funciona (nada a mexer)

- `useSubscriptionCheck` + `ProtectedRoute` já redirecionam para `/subscription-blocked` sempre que `subscription_status` não está em `active | trial | gratuita`.
- "Revogar" já seta `past_due` e "Desativar" já seta `canceled` → ambos disparam o redirect automaticamente.
- O login na `/auth` continua funcionando normalmente.

## O que muda

### 1. Reescrever `src/pages/SubscriptionBlocked.tsx`

Substituir todo o conteúdo atual (que tem botões Stripe, retry, bootstrap, contato, etc.) por uma tela mínima e bloqueante:

- Ícone de alerta + título **"Assinatura Expirada"**.
- Mensagem: *"Sua assinatura está expirada. Para reativá-la, entre em contato com o administrador."*
- Mostrar e-mail do usuário logado (para ele saber qual conta avisar).
- **Nenhum botão de ação que retorne ao app** (sem "Verificar novamente", sem Stripe, sem "Tentar de novo").
- Manter apenas um botão **"Sair"** discreto no rodapé, que faz `supabase.auth.signOut()` e leva para `/auth`. Sem isso o usuário fica preso no dispositivo, e mesmo deslogando, ao logar de novo cai aqui de novo (cumprindo a regra "não consegue fechar até liberar").
- Em background, fazer poll a cada 60s chamando `check-subscription-status`. Se voltar `has_access: true` (admin reativou), redireciona automaticamente para `/dashboard`. Sem botão manual visível.

### 2. Bloquear navegação para fora da tela

- Adicionar `useEffect` com listener de `popstate` que re-empurra `/subscription-blocked` no histórico — usuário não consegue voltar pelo botão do navegador.
- Bloquear `Escape`/`F5`? Não — F5 só recarrega e cai aqui de novo. Suficiente.
- A tela é página inteira (`min-h-screen`), sem header/sidebar, sem `<Dialog>` (não há X para fechar).

### 3. Garantir que o gate cobre rotas além de `/dashboard`

Verificar em `src/App.tsx` que toda rota autenticada está envolta em `<ProtectedRoute>`. Caso alguma rota interna (relatórios, etc.) esteja fora do guard, envolver. (Provável que já esteja, pois o redirect já funciona hoje — só confirmar.)

## O que NÃO muda

- Nada no banco / RPC / edge functions.
- Lógica do `handleToggleAccess` e `handleRevokeAccess` no `SuperAdminDashboard` permanece igual.
- Nomenclatura "Revogar" vs "Desativar" continua como está (já discutido na mensagem anterior).
- `useSubscriptionCheck` permanece igual.

## Detalhes técnicos

- Polling: `setInterval` de 60s dentro do `useEffect` da página, com `clearInterval` no cleanup.
- Logout: `await supabase.auth.signOut(); navigate("/auth")`.
- O Super Admin nunca cai nessa tela porque `check-subscription-status` retorna `has_access: true` para `super_admin` independente do status da org.

## Arquivos afetados

- `src/pages/SubscriptionBlocked.tsx` — reescrita completa.
- `src/App.tsx` — só conferir cobertura do `ProtectedRoute` (talvez nada a alterar).
