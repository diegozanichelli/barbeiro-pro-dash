-- 1) Remove o índice único por nome normalizado (regra é permitir homônimos com telefones diferentes).
DROP INDEX IF EXISTS public.clients_org_normalized_name_unique;

-- 2) Recria normalized_name removendo acentos via translate() (immutable, sem dependência de extensão).
ALTER TABLE public.clients DROP COLUMN IF EXISTS normalized_name;

ALTER TABLE public.clients
ADD COLUMN normalized_name TEXT
GENERATED ALWAYS AS (
  lower(
    translate(
      btrim(name),
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'
    )
  )
) STORED;

-- 3) Índice de busca (não-único) por nome normalizado para acelerar autocomplete.
CREATE INDEX IF NOT EXISTS clients_org_normalized_name_idx
  ON public.clients (organization_id, normalized_name text_pattern_ops);