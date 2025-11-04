-- Corrigir registros antigos de daily_productions sem organization_id
UPDATE daily_productions dp
SET organization_id = b.organization_id
FROM barbers b
WHERE dp.barber_id = b.id
  AND dp.organization_id IS NULL;