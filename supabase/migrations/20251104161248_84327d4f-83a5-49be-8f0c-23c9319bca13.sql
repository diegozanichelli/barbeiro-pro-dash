-- Criar trigger para calcular comissão automaticamente em daily_productions
DROP TRIGGER IF EXISTS calculate_commission_trigger ON daily_productions;

CREATE TRIGGER calculate_commission_trigger
  BEFORE INSERT OR UPDATE ON daily_productions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_commission();

-- Recalcular todas as comissões existentes com os valores corretos
UPDATE daily_productions dp
SET commission_earned = (
  (dp.services_total * b.services_commission / 100) +
  (dp.products_total * b.products_commission / 100)
)
FROM barbers b
WHERE dp.barber_id = b.id;