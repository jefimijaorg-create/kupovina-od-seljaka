-- Version: 20261117234328
-- Change: Per-farm delivery tracking, strict delivery bounds, and append-only procurement history.

ALTER TABLE public.tura_nabavka_dodele
  ADD COLUMN isporuceno_pakovanja numeric NOT NULL DEFAULT 0;

ALTER TABLE public.tura_nabavka_dodele
  ADD CONSTRAINT tura_nabavka_dodele_isporuceno_nonnegative
  CHECK (isporuceno_pakovanja >= 0),
  ADD CONSTRAINT tura_nabavka_dodele_isporuceno_not_over_picked
  CHECK (isporuceno_pakovanja <= preuzeto_pakovanja);

CREATE OR REPLACE FUNCTION public.guard_tura_nabavka_dodele_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_required numeric := 0;
  v_other_delivered numeric := 0;
BEGIN
  -- Serialize delivery updates for the same tour.
  PERFORM 1
  FROM public.ture
  WHERE id = NEW.tura_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tura za evidenciju isporuke nije pronađena.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(package_count), 0)
    INTO v_required
  FROM public.stavke_porudzbine
  WHERE tura_id = NEW.tura_id
    AND product_id = NEW.product_id
    AND variant_id = NEW.variant_id;

  SELECT COALESCE(SUM(isporuceno_pakovanja), 0)
    INTO v_other_delivered
  FROM public.tura_nabavka_dodele
  WHERE tura_id = NEW.tura_id
    AND product_id = NEW.product_id
    AND variant_id = NEW.variant_id
    AND id <> COALESCE(NEW.id, -1);

  IF v_other_delivered + NEW.isporuceno_pakovanja > v_required THEN
    RAISE EXCEPTION 'Ukupno isporučena količina svih gazdinstava ne može biti veća od trebovanja (% pakovanja).', v_required
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_guard_tura_nabavka_dodele_delivery
BEFORE INSERT OR UPDATE OF isporuceno_pakovanja, tura_id, product_id, variant_id
ON public.tura_nabavka_dodele
FOR EACH ROW
EXECUTE FUNCTION public.guard_tura_nabavka_dodele_delivery();

CREATE TABLE public.tura_nabavka_istorija (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  allocation_id bigint NOT NULL,
  tura_id bigint NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  gazdinstvo_id integer NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NULL,
  old_data jsonb NULL,
  new_data jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tura_nabavka_istorija_allocation_created_idx
  ON public.tura_nabavka_istorija (allocation_id, created_at DESC, id DESC);

CREATE INDEX tura_nabavka_istorija_tour_variant_created_idx
  ON public.tura_nabavka_istorija (tura_id, product_id, variant_id, created_at DESC);

ALTER TABLE public.tura_nabavka_istorija ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tura_nabavka_istorija FROM anon, authenticated;
GRANT SELECT ON TABLE public.tura_nabavka_istorija TO authenticated;

CREATE POLICY "active admins read procurement history"
ON public.tura_nabavka_istorija
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users au
    WHERE au.auth_user_id = (SELECT auth.uid())
      AND au.is_active IS TRUE
      AND au.role IN ('super_admin', 'admin')
  )
);

CREATE OR REPLACE FUNCTION public.capture_tura_nabavka_dodele_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text := NULL;
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT au.role
      INTO v_actor_role
    FROM public.app_users au
    WHERE au.auth_user_id = v_actor
      AND au.is_active IS TRUE
      AND au.role IN ('super_admin', 'admin');

    IF v_actor_role IS NULL THEN
      RAISE EXCEPTION 'Nemate dozvolu za evidentiranje promena nabavke.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.tura_nabavka_istorija (
      allocation_id, tura_id, product_id, variant_id, gazdinstvo_id,
      operation, actor_id, actor_role, old_data
    ) VALUES (
      OLD.id, OLD.tura_id, OLD.product_id, OLD.variant_id, OLD.gazdinstvo_id,
      TG_OP, v_actor, v_actor_role, to_jsonb(OLD)
    );
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.tura_nabavka_istorija (
      allocation_id, tura_id, product_id, variant_id, gazdinstvo_id,
      operation, actor_id, actor_role, new_data
    ) VALUES (
      NEW.id, NEW.tura_id, NEW.product_id, NEW.variant_id, NEW.gazdinstvo_id,
      TG_OP, v_actor, v_actor_role, to_jsonb(NEW)
    );
    RETURN NEW;
  ELSE
    INSERT INTO public.tura_nabavka_istorija (
      allocation_id, tura_id, product_id, variant_id, gazdinstvo_id,
      operation, actor_id, actor_role, old_data, new_data
    ) VALUES (
      NEW.id, NEW.tura_id, NEW.product_id, NEW.variant_id, NEW.gazdinstvo_id,
      TG_OP, v_actor, v_actor_role, to_jsonb(OLD), to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_tura_nabavka_dodele_history() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_capture_tura_nabavka_dodele_history
AFTER INSERT OR UPDATE OR DELETE
ON public.tura_nabavka_dodele
FOR EACH ROW
EXECUTE FUNCTION public.capture_tura_nabavka_dodele_history();

CREATE OR REPLACE FUNCTION public.prevent_tura_nabavka_istorija_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'Istorija nabavke je nepromenljiva; izmene i brisanje nisu dozvoljeni.'
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

CREATE TRIGGER trg_prevent_tura_nabavka_istorija_mutation
BEFORE UPDATE OR DELETE
ON public.tura_nabavka_istorija
FOR EACH ROW
EXECUTE FUNCTION public.prevent_tura_nabavka_istorija_mutation();
