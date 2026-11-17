-- Version: 20261117234500
-- Change: Remove direct application and service-role writes to procurement audit history.

REVOKE ALL PRIVILEGES ON TABLE public.tura_nabavka_istorija
FROM service_role;
