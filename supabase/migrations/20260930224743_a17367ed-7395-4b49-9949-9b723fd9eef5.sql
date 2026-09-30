REVOKE EXECUTE ON FUNCTION public.get_championship_details(date, date, uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_championship_details(date, date, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_championship_details(date, date, uuid, numeric) TO authenticated;