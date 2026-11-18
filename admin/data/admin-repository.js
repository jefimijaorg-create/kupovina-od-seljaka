/*
 * NARUČI DOMAĆE — ADMIN DATA REPOSITORY
 * Version: 1.0.1
 * Updated: 2026-11-18
 * Description: Reads procurement workspace data from the existing authenticated Supabase client, including product categories for the aggregate procurement map; performs no writes and changes no schema or RLS.
 * Scope: ADMIN Workspace only.
 */

const uniq = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
const unwrap = (result, label) => {
  if (result.error) throw new Error(label + ': ' + result.error.message);
  return result.data || [];
};

export async function loadProcurementData({ client, tourId }) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('Репозиторијум захтева постојећи аутентификовани Supabase клијент.');
  }
  if (tourId === null || tourId === undefined || String(tourId).trim() === '') {
    throw new TypeError('ID туре није наведен.');
  }

  const tourResult = await client.from('ture')
    .select('id,naziv,status,datum')
    .eq('id', tourId)
    .maybeSingle();
  if (tourResult.error) throw new Error('Тура: ' + tourResult.error.message);
  if (!tourResult.data) throw new Error('Тура није пронађена или немате дозволу за читање.');
  const tour = tourResult.data;

  const itemResult = await client.from('stavke_porudzbine')
    .select('id,product_id,variant_id,package_count,package_size,package_unit')
    .eq('tura_id', tourId);
  const items = unwrap(itemResult, 'Ставке поруџбина');
  const invalidSourceRows = items.filter((row) => !row.product_id || !row.variant_id).length;
  const productIds = uniq(items.filter((row) => row.product_id && row.variant_id).map((row) => row.product_id));
  const variantIds = uniq(items.filter((row) => row.product_id && row.variant_id).map((row) => row.variant_id));

  const [productsResult, variantsResult, allocationsResult] = await Promise.all([
    productIds.length
      ? client.from('products').select('id,name,category').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length
      ? client.from('product_variants').select('id,product_id,name,size_label,unit,package_value,package_unit,is_active').in('id', variantIds)
      : Promise.resolve({ data: [], error: null }),
    client.from('tura_nabavka_dodele')
      .select('id,tura_id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,nabavna_cena,naruceno,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja,viber_status,viber_poslato_at,potvrdjeno_at,updated_at')
      .eq('tura_id', tourId)
      .order('id', { ascending: true })
  ]);

  const products = unwrap(productsResult, 'Производи');
  const variants = unwrap(variantsResult, 'Варијанте');
  const allocations = unwrap(allocationsResult, 'Набавне расподеле');

  const demandPairs = new Set(items
    .filter((row) => row.product_id && row.variant_id)
    .map((row) => String(row.product_id) + '::' + String(row.variant_id)));
  const offerResult = productIds.length
    ? await client.from('product_offers')
      .select('id,gazdinstvo_id,product_id,variant_id,purchase_price,is_active')
      .in('product_id', productIds)
      .eq('is_active', true)
    : { data: [], error: null };
  const offers = unwrap(offerResult, 'Активне понуде');
  const relevantOffers = offers.filter((offer) =>
    demandPairs.has(String(offer.product_id) + '::' + String(offer.variant_id)));

  const farmIds = uniq([
    ...relevantOffers.map((offer) => offer.gazdinstvo_id),
    ...allocations.map((row) => row.gazdinstvo_id)
  ]);
  const farmResult = farmIds.length
    ? await client.from('gazdinstva')
      .select('id,name,phone')
      .in('id', farmIds)
      .order('name', { ascending: true })
    : { data: [], error: null };
  const farms = unwrap(farmResult, 'Газдинства');

  return {
    tour,
    items,
    invalidSourceRows,
    products,
    variants,
    allocations,
    offers,
    relevantOffers,
    farms
  };
}
