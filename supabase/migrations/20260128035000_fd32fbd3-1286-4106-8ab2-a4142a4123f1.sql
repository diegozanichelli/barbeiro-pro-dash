-- =====================================================
-- SISTEMA DE COMISSÃO HÍBRIDA COM CATÁLOGO DE ITENS
-- =====================================================

-- 1. Tabela de Catálogo de Serviços
CREATE TABLE public.catalog_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('basic', 'extra')),
  fixed_commission NUMERIC(5,2) NULL CHECK (fixed_commission IS NULL OR (fixed_commission >= 0 AND fixed_commission <= 100)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Tabela de Catálogo de Produtos
CREATE TABLE public.catalog_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  fixed_commission NUMERIC(5,2) NULL CHECK (fixed_commission IS NULL OR (fixed_commission >= 0 AND fixed_commission <= 100)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Tabela de Transações de Venda (Histórico Granular)
CREATE TABLE public.sale_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  daily_production_id UUID NOT NULL REFERENCES public.daily_productions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('service', 'product')),
  catalog_service_id UUID NULL REFERENCES public.catalog_services(id) ON DELETE SET NULL,
  catalog_product_id UUID NULL REFERENCES public.catalog_products(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  service_category TEXT NULL CHECK (service_category IS NULL OR service_category IN ('basic', 'extra')),
  price_sold NUMERIC(10,2) NOT NULL,
  commission_rate_used NUMERIC(5,2) NOT NULL,
  commission_amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Índices para performance
CREATE INDEX idx_catalog_services_org ON public.catalog_services(organization_id);
CREATE INDEX idx_catalog_services_active ON public.catalog_services(organization_id, is_active);
CREATE INDEX idx_catalog_products_org ON public.catalog_products(organization_id);
CREATE INDEX idx_catalog_products_active ON public.catalog_products(organization_id, is_active);
CREATE INDEX idx_sale_transactions_barber ON public.sale_transactions(barber_id);
CREATE INDEX idx_sale_transactions_production ON public.sale_transactions(daily_production_id);
CREATE INDEX idx_sale_transactions_date ON public.sale_transactions(created_at);

-- 5. Triggers de updated_at
CREATE TRIGGER update_catalog_services_updated_at
  BEFORE UPDATE ON public.catalog_services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_catalog_products_updated_at
  BEFORE UPDATE ON public.catalog_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Habilitar RLS
ALTER TABLE public.catalog_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_transactions ENABLE ROW LEVEL SECURITY;

-- 7. Políticas RLS para catalog_services
CREATE POLICY "Managers can manage catalog services in their organization"
  ON public.catalog_services
  FOR ALL
  USING (
    organization_id = get_user_organization(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Barbers can view catalog services in their organization"
  ON public.catalog_services
  FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Super admins can manage all catalog services"
  ON public.catalog_services
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 8. Políticas RLS para catalog_products
CREATE POLICY "Managers can manage catalog products in their organization"
  ON public.catalog_products
  FOR ALL
  USING (
    organization_id = get_user_organization(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Barbers can view catalog products in their organization"
  ON public.catalog_products
  FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Super admins can manage all catalog products"
  ON public.catalog_products
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 9. Políticas RLS para sale_transactions
CREATE POLICY "Barbers can insert their own sale transactions"
  ON public.sale_transactions
  FOR INSERT
  WITH CHECK (
    barber_id IN (
      SELECT id FROM public.barbers 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Barbers can view their own sale transactions"
  ON public.sale_transactions
  FOR SELECT
  USING (
    barber_id IN (
      SELECT id FROM public.barbers 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage sale transactions in their organization"
  ON public.sale_transactions
  FOR ALL
  USING (
    organization_id = get_user_organization(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Super admins can manage all sale transactions"
  ON public.sale_transactions
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 10. Função para calcular comissão de item (lógica híbrida)
CREATE OR REPLACE FUNCTION public.calculate_sale_commission()
RETURNS TRIGGER AS $$
DECLARE
  v_fixed_rate NUMERIC;
  v_barber_rate NUMERIC;
  v_final_rate NUMERIC;
BEGIN
  -- Buscar taxa fixa do item (se existir)
  IF NEW.item_type = 'service' AND NEW.catalog_service_id IS NOT NULL THEN
    SELECT fixed_commission INTO v_fixed_rate
    FROM public.catalog_services WHERE id = NEW.catalog_service_id;
  ELSIF NEW.item_type = 'product' AND NEW.catalog_product_id IS NOT NULL THEN
    SELECT fixed_commission INTO v_fixed_rate
    FROM public.catalog_products WHERE id = NEW.catalog_product_id;
  END IF;

  -- Se não tem taxa fixa, usar do barbeiro
  IF v_fixed_rate IS NULL THEN
    IF NEW.item_type = 'service' THEN
      SELECT services_commission INTO v_barber_rate
      FROM public.barbers WHERE id = NEW.barber_id;
    ELSE
      SELECT products_commission INTO v_barber_rate
      FROM public.barbers WHERE id = NEW.barber_id;
    END IF;
    v_final_rate := COALESCE(v_barber_rate, 50);
  ELSE
    v_final_rate := v_fixed_rate;
  END IF;

  -- Calcular e salvar
  NEW.commission_rate_used := v_final_rate;
  NEW.commission_amount := ROUND((NEW.price_sold * v_final_rate) / 100, 2);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 11. Trigger para calcular comissão antes de inserir transação
CREATE TRIGGER before_sale_transaction_insert
  BEFORE INSERT ON public.sale_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_sale_commission();

-- 12. Função para sincronizar totais em daily_productions
CREATE OR REPLACE FUNCTION public.sync_daily_production_from_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_basic_total NUMERIC;
  v_extra_total NUMERIC;
  v_products_total NUMERIC;
  v_commission_total NUMERIC;
  v_services_count INTEGER;
  v_products_count INTEGER;
BEGIN
  -- Calcular totais das transações
  SELECT 
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(commission_amount), 0),
    COUNT(CASE WHEN item_type = 'service' THEN 1 END),
    COUNT(CASE WHEN item_type = 'product' THEN 1 END)
  INTO v_basic_total, v_extra_total, v_products_total, v_commission_total, v_services_count, v_products_count
  FROM public.sale_transactions
  WHERE daily_production_id = NEW.daily_production_id;

  -- Atualizar daily_productions
  UPDATE public.daily_productions
  SET 
    services_basic_total = v_basic_total,
    services_extra_total = v_extra_total,
    products_total = v_products_total,
    commission_earned = v_commission_total,
    services_count = v_services_count,
    products_count = v_products_count,
    updated_at = now()
  WHERE id = NEW.daily_production_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 13. Trigger para sincronizar após inserir transação
CREATE TRIGGER after_sale_transaction_insert
  AFTER INSERT ON public.sale_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_daily_production_from_transactions();

-- 14. Trigger para sincronizar após deletar transação
CREATE TRIGGER after_sale_transaction_delete
  AFTER DELETE ON public.sale_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_daily_production_from_transactions();