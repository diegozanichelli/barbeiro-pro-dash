
ALTER TABLE sale_transactions ADD COLUMN client_name text;

CREATE OR REPLACE FUNCTION cleanup_old_client_names()
RETURNS void AS $$
BEGIN
  UPDATE sale_transactions
  SET client_name = NULL
  WHERE client_name IS NOT NULL
    AND created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
