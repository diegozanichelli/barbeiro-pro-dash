-- Função que preenche organization_id automaticamente baseado no barbeiro
CREATE OR REPLACE FUNCTION public.set_monthly_goal_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se organization_id não foi fornecido, busca do barbeiro
  IF NEW.organization_id IS NULL THEN
    SELECT b.organization_id INTO NEW.organization_id
    FROM public.barbers b
    WHERE b.id = NEW.barber_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger que executa antes de inserir uma meta
CREATE TRIGGER set_monthly_goal_organization_trigger
BEFORE INSERT ON public.monthly_goals
FOR EACH ROW
EXECUTE FUNCTION public.set_monthly_goal_organization();