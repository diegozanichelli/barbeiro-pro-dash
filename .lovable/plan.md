# Testes de normalização de nome (busca insensível a acentos)

## Objetivo
Garantir, com testes automatizados, que "João", "Joao", "JOÃO", "joão " etc. sempre produzam a mesma chave de busca — e travar o contrato entre o frontend (autocomplete) e o banco (`clients.normalized_name`).

## Estratégia
A normalização hoje vive duplicada: o banco usa `lower(translate(btrim(name), ...))` na coluna `normalized_name`; o frontend usa `NFD + strip + lower` inline em `useClientAutocomplete.ts`. Para testar, vamos **extrair** a normalização do frontend para um util e cobri-la com testes unitários, mais um teste de paridade contra o resultado esperado do `translate` do banco.

## Mudanças

### 1. Novo util: `src/lib/clientName.ts`
Exporta `normalizeClientName(name: string): string` — implementação por `translate`-style (replace caractere-a-caractere usando o mesmo mapa do banco) seguida de `lower` + `btrim`. Usa o **mesmo mapa de pares** definido na migration (`ÁÀÂÃÄÅ...Çç...` → `AAAAAA...Cc...`) para garantir paridade 1:1 com a coluna gerada.

### 2. Usar o util nos consumidores existentes
- `src/hooks/useClientAutocomplete.ts`: substituir o NFD inline por `normalizeClientName(rawName)`.
- `src/lib/clientRegistry.ts`: nada muda no fluxo (match é por telefone), mas opcionalmente expor `normalizeClientName` se o futuro precisar — fora de escopo.

### 3. Setup de testes (Vitest + Testing Library)
- Adicionar devDeps: `vitest`, `@testing-library/jest-dom`, `@testing-library/react`, `jsdom`.
- Criar `vitest.config.ts` no root.
- Criar `src/test/setup.ts` com `@testing-library/jest-dom` e mock de `matchMedia`.
- Adicionar `"vitest/globals"` em `tsconfig.app.json` → `compilerOptions.types`.
- Script `"test": "vitest run"` no `package.json`.

### 4. Testes
**`src/lib/clientName.test.ts`** — cobre o util:
- "João", "Joao", "JOÃO", "  joão  ", "JoÃo" → todos resultam em `"joao"`.
- Outros acentos PT: "Ágatha"/"Agatha", "André"/"Andre", "Conceição"/"Conceicao", "Müller"/"Muller", "Núñez"/"Nunez", "Ýasmin"/"Yasmin".
- Caracteres especiais preservados (não viram acento): "Maria-José" → "maria-jose", "O'Brien" → "o'brien", "Ana & Bia" → "ana & bia".
- Espaços extras: "  João  " e "João\t" → "joao".
- Idempotência: `normalize(normalize(x)) === normalize(x)`.

**`src/hooks/useClientAutocomplete.test.ts`** — confirma que o hook envia para o Supabase exatamente o valor normalizado:
- Mock do `supabase.from(...).select(...).eq(...).ilike(...).limit(...)` para capturar o argumento de `ilike("normalized_name", ...)`.
- Renderizar o hook (via `renderHook` de `@testing-library/react`) com `nameQuery="João"`, `"Joao"`, `"JOÃO"`, `"  joão  "` e verificar que todos chamam `ilike` com `"joao%"`.
- Esperar o debounce de 250ms com `vi.useFakeTimers()`.

## Fora de escopo
- Teste de integração real contra o banco (precisaria de credenciais em CI). A paridade fica garantida pelo mapa idêntico de caracteres entre util e migration; se algum dia divergir, basta atualizar o util e adicionar o caractere novo nas duas pontas.
- Mudanças na coluna `normalized_name` — já está correta após a migração anterior.

## Como rodar
`bunx vitest run` (ou via tool de testes do harness).
