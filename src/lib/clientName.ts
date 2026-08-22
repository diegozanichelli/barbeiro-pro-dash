/**
 * Normaliza o nome de cliente para busca insensível a acentos/caixa.
 *
 * IMPORTANTE: a implementação deve permanecer 1:1 com a coluna gerada
 * `clients.normalized_name` no banco (migration `clients_registry`):
 *
 *   lower(translate(btrim(name), 'ÁÀÂÃÄÅ...Çç...', 'AAAAAA...Cc...'))
 *
 * Se um caractere for adicionado/removido aqui, atualize também a migration
 * e reaplique a coluna gerada — caso contrário o `ilike` no autocomplete
 * deixará de bater com o que o Postgres armazenou.
 */
const ACCENT_FROM = "ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ";
const ACCENT_TO   = "AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy";

const ACCENT_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (let i = 0; i < ACCENT_FROM.length; i++) {
    map[ACCENT_FROM[i]] = ACCENT_TO[i];
  }
  return map;
})();

export function normalizeClientName(name: string): string {
  if (!name) return "";
  const trimmed = name.trim();
  let out = "";
  for (const ch of trimmed) {
    out += ACCENT_MAP[ch] ?? ch;
  }
  return out.toLowerCase();
}
