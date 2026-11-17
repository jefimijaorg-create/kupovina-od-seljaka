CREATE OR REPLACE FUNCTION public.guard_tura_nabavka_dodele_processing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tura record;
  v_required numeric := 0;
  v_assigned numeric := 0;
  v_variant_product_id uuid;
  v_offer_exists boolean := false;
  v_allocation_changed boolean := false;
  v_tracking_changed boolean := false;
  v_check_tour_ids bigint[];
  v_confirmed_total numeric := 0;
  v_collected_total numeric := 0;
  v_old_confirmed_total numeric := 0;
  v_old_collected_total numeric := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_tour_ids := ARRAY[OLD.tura_id];
  ELSIF TG_OP = 'UPDATE' THEN
    v_check_tour_ids := ARRAY[OLD.tura_id, NEW.tura_id];
    v_allocation_changed :=
      OLD.tura_id IS DISTINCT FROM NEW.tura_id OR
      OLD.product_id IS DISTINCT FROM NEW.product_id OR
      OLD.variant_id IS DISTINCT FROM NEW.variant_id OR
      OLD.gazdinstvo_id IS DISTINCT FROM NEW.gazdinstvo_id OR
      OLD.broj_pakovanja IS DISTINCT FROM NEW.broj_pakovanja;
    v_tracking_changed :=
      OLD.naruceno_pakovanja IS DISTINCT FROM NEW.naruceno_pakovanja OR
      OLD.potvrdjeno_pakovanja IS DISTINCT FROM NEW.potvrdjeno_pakovanja OR
      OLD.preuzeto_pakovanja IS DISTINCT FROM NEW.preuzeto_pakovanja;
  ELSE
    v_check_tour_ids := ARRAY[NEW.tura_id];
    v_allocation_changed := true;
    v_tracking_changed := true;
  END IF;

  -- Serialize every write for a tour and require the tour to remain in processing.
  FOR v_tura IN
    SELECT id, status
    FROM public.ture
    WHERE id = ANY(v_check_tour_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_tura.status IS DISTINCT FROM 'processing' THEN
      RAISE EXCEPTION 'Nabavna raspodela može da se menja samo dok je tura u statusu processing.'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.ture WHERE id = ANY(v_check_tour_ids))
     <> (SELECT count(DISTINCT x) FROM unnest(v_check_tour_ids) AS x) THEN
    RAISE EXCEPTION 'Tura za nabavnu raspodelu nije pronađena.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Allocation changes retain the original variant, active-offer and demand checks.
  IF TG_OP <> 'DELETE' AND v_allocation_changed THEN
    SELECT product_id INTO v_variant_product_id
    FROM public.product_variants
    WHERE id = NEW.variant_id;

    IF v_variant_product_id IS DISTINCT FROM NEW.product_id THEN
      RAISE EXCEPTION 'Izabrana varijanta ne pripada izabranom proizvodu.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT true INTO v_offer_exists
    FROM public.product_offers
    WHERE gazdinstvo_id = NEW.gazdinstvo_id
      AND product_id = NEW.product_id
      AND variant_id = NEW.variant_id
      AND is_active = true
    FOR KEY SHARE;

    IF v_offer_exists IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Gazdinstvo nema aktivnu ponudu za izabranu varijantu proizvoda.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(SUM(package_count), 0) INTO v_required
    FROM public.stavke_porudzbine
    WHERE tura_id = NEW.tura_id
      AND product_id = NEW.product_id
      AND variant_id = NEW.variant_id;

    IF TG_OP = 'UPDATE' THEN
      SELECT COALESCE(SUM(broj_pakovanja), 0) INTO v_assigned
      FROM public.tura_nabavka_dodele
      WHERE tura_id = NEW.tura_id
        AND product_id = NEW.product_id
        AND variant_id = NEW.variant_id
        AND id <> OLD.id;
    ELSE
      SELECT COALESCE(SUM(broj_pakovanja), 0) INTO v_assigned
      FROM public.tura_nabavka_dodele
      WHERE tura_id = NEW.tura_id
        AND product_id = NEW.product_id
        AND variant_id = NEW.variant_id;
    END IF;

    IF v_assigned + NEW.broj_pakovanja > v_required THEN
      RAISE EXCEPTION 'Ukupna raspodela za proizvod i varijantu ne može biti veća od potrebnog broja pakovanja.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Enforce the row-level workflow for new/changed tracking values.
  -- Historical pickup rows may predate the order/confirmation columns; they remain
  -- readable and may be reduced/corrected without being silently rewritten.
  IF TG_OP <> 'DELETE' AND v_tracking_changed THEN
    IF COALESCE(NEW.naruceno_pakovanja, 0) > COALESCE(NEW.broj_pakovanja, 0) THEN
      RAISE EXCEPTION 'Broj naručenih pakovanja ne može biti veći od dodeljene količine.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF COALESCE(NEW.potvrdjeno_pakovanja, 0) > COALESCE(NEW.naruceno_pakovanja, 0) THEN
      RAISE EXCEPTION 'Potvrđena količina ne može biti veća od poslatog trebovanja.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.preuzeto_pakovanja > OLD.preuzeto_pakovanja
         AND NEW.preuzeto_pakovanja > COALESCE(NEW.potvrdjeno_pakovanja, 0) THEN
        RAISE EXCEPTION 'Novo preuzimanje ne može biti veće od potvrđene količine gazdinstva.'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT COALESCE(SUM(potvrdjeno_pakovanja), 0),
             COALESCE(SUM(preuzeto_pakovanja), 0)
        INTO v_confirmed_total, v_collected_total
      FROM public.tura_nabavka_dodele
      WHERE tura_id = NEW.tura_id
        AND product_id = NEW.product_id
        AND variant_id = NEW.variant_id
        AND id <> OLD.id;

      v_old_confirmed_total := v_confirmed_total + COALESCE(OLD.potvrdjeno_pakovanja, 0);
      v_old_collected_total := v_collected_total + COALESCE(OLD.preuzeto_pakovanja, 0);
    ELSE
      IF NEW.preuzeto_pakovanja > COALESCE(NEW.potvrdjeno_pakovanja, 0) THEN
        RAISE EXCEPTION 'Preuzeta količina ne može biti veća od potvrđene količine gazdinstva.'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT COALESCE(SUM(potvrdjeno_pakovanja), 0),
             COALESCE(SUM(preuzeto_pakovanja), 0)
        INTO v_confirmed_total, v_collected_total
      FROM public.tura_nabavka_dodele
      WHERE tura_id = NEW.tura_id
        AND product_id = NEW.product_id
        AND variant_id = NEW.variant_id;

      v_old_confirmed_total := v_confirmed_total;
      v_old_collected_total := v_collected_total;
    END IF;

    v_confirmed_total := v_confirmed_total + COALESCE(NEW.potvrdjeno_pakovanja, 0);
    v_collected_total := v_collected_total + COALESCE(NEW.preuzeto_pakovanja, 0);

    SELECT COALESCE(SUM(package_count), 0) INTO v_required
    FROM public.stavke_porudzbine
    WHERE tura_id = NEW.tura_id
      AND product_id = NEW.product_id
      AND variant_id = NEW.variant_id;

    -- Existing legacy totals over demand are not rewritten by this migration.
    -- They may be reduced, but no write may increase an over-limit total.
    IF v_confirmed_total > v_required
       AND v_confirmed_total > v_old_confirmed_total THEN
      RAISE EXCEPTION 'Ukupno potvrđena količina svih gazdinstava ne može biti veća od trebovanja (% pakovanja).', v_required
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_collected_total > v_required
       AND v_collected_total > v_old_collected_total THEN
      RAISE EXCEPTION 'Ukupno preuzeta količina svih gazdinstava ne može biti veća od trebovanja (% pakovanja).', v_required
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$
