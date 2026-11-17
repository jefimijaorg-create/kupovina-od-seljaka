-- Version: 20261117234441
-- Change: Prevent truncation of the append-only procurement audit history.

REVOKE TRUNCATE ON TABLE public.tura_nabavka_istorija
FROM anon, authenticated, service_role;

CREATE TRIGGER trg_prevent_tura_nabavka_istorija_truncate
BEFORE TRUNCATE
ON public.tura_nabavka_istorija
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_tura_nabavka_istorija_mutation();
