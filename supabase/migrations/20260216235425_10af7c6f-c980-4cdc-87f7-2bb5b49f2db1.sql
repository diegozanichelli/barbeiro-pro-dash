
CREATE POLICY "Barbers can delete their own barber transactions"
  ON public.sale_transactions
  FOR DELETE
  USING (
    source = 'barber'
    AND barber_id IN (
      SELECT id FROM barbers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Barbers can update their own barber transactions"
  ON public.sale_transactions
  FOR UPDATE
  USING (
    source = 'barber'
    AND barber_id IN (
      SELECT id FROM barbers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    source = 'barber'
    AND barber_id IN (
      SELECT id FROM barbers WHERE user_id = auth.uid()
    )
  );
