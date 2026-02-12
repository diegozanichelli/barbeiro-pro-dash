
# Correção: Sistema deslogando sozinho

## Problema Identificado

O sistema desloga o usuário automaticamente após ~1 hora de inatividade por causa de uma **condição de corrida** (race condition) entre a renovação automática do token JWT e a verificação de assinatura.

### Fluxo do bug:

```text
Token JWT expira (~1h)
  -> Supabase tenta renovar automaticamente
  -> onAuthStateChange dispara
  -> checkSubscription() é chamado
  -> getSession() retorna token antigo (cache)
  -> Edge function recebe token expirado
  -> Retorna "Invalid or expired token"
  -> Hook faz signOut() imediato
  -> Usuário é redirecionado para /auth
```

## Correções Planejadas

### 1. Filtrar eventos no useSubscriptionCheck

Atualmente o hook roda `checkSubscription()` em **qualquer** evento de auth (incluindo `SIGNED_OUT`, `TOKEN_REFRESHED`). Vamos filtrar para só rodar em eventos relevantes e ignorar o `SIGNED_OUT` (que causa loop).

### 2. Não deslogar no primeiro erro de auth

Em vez de fazer `signOut()` imediatamente ao receber "Invalid or expired token", vamos:
- Aguardar 2 segundos e tentar novamente com sessão atualizada
- Só deslogar se o **segundo** tentativa também falhar
- Isso dá tempo para o `autoRefreshToken` completar a renovação

### 3. Corrigir Dashboard.tsx para não reagir a session null temporário

O `onAuthStateChange` no Dashboard redireciona para `/auth` quando `session` é `null`, mas durante um token refresh, a session pode ficar momentaneamente nula. Vamos ignorar o `INITIAL_SESSION` e só redirecionar em `SIGNED_OUT` explícito.

## Arquivos Modificados

- `src/hooks/useSubscriptionCheck.tsx` - Adicionar retry antes de signOut + filtrar eventos
- `src/pages/Dashboard.tsx` - Filtrar evento SIGNED_OUT antes de redirecionar

## Detalhes Técnicos

### useSubscriptionCheck.tsx

```text
// Antes (problemático):
supabase.auth.onAuthStateChange(() => {
  checkSubscription();  // Roda em QUALQUER evento
});

// Depois (corrigido):
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') return;  // Não re-verificar no logout
  if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
    checkSubscription();
  }
});
```

Lógica de retry no erro de auth:

```text
if (isAuthError) {
  // Esperar o autoRefreshToken completar
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Tentar de novo com sessão atualizada
  const { data: { session: freshSession } } = await supabase.auth.getSession();
  if (!freshSession) {
    // Agora sim, deslogar
    await supabase.auth.signOut();
    navigate("/auth");
    return;
  }
  
  // Se tem sessão fresca, re-tentar a verificação
  const retryResult = await supabase.functions.invoke("check-subscription-status");
  if (retryResult.data?.message?.includes("Invalid")) {
    await supabase.auth.signOut();
    navigate("/auth");
  } else {
    setStatus(retryResult.data);
  }
}
```

### Dashboard.tsx

```text
// Antes (problemático):
supabase.auth.onAuthStateChange((event, session) => {
  setSession(session);
  setUser(session?.user ?? null);
  if (!session) navigate("/auth");  // Redireciona mesmo no refresh!
});

// Depois (corrigido):
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    setSession(null);
    setUser(null);
    navigate("/auth");
    return;
  }
  if (session) {
    setSession(session);
    setUser(session.user);
  }
});
```

## Resultado Esperado

- O token JWT continua expirando a cada ~1 hora (comportamento normal)
- O Supabase renova automaticamente sem interferência
- O usuário permanece logado enquanto o refresh token for válido (dias/semanas)
- Só desloga se o refresh token realmente expirar ou for revogado
