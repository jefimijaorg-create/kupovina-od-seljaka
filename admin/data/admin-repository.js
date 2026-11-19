/*
 * NARUČI DOMAĆE — ADMIN DATA REPOSITORY
 * Version: 1.0.6
 * Updated: 2026-11-19
 * Description: Loads tour-ordered product and variant records only, preserving incomplete variant rows for visible procurement diagnostics; performs no writes.
 * Scope: ADMIN Workspace only.
 */

const uniq = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
const unwrap = (result, label) => {
  if (result.error) throw new Error(label + ': ' + result.error.message);
  return result.data || [];
};

export async function loadProcurementData({ client, tourId, onProgress = () => {} }) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('Репозиторијум захтева постојећи аутентификовани Supabase клијент.');
  }
  if (tourId === null || tourId === undefined || String(tourId).trim() === '') {
    throw new TypeError('ID туре није наведен.');
  }

  onProgress('1/6 · Читам податке туре…');
  const tourResult = await client.from('ture')
    .select('id,naziv,status,datum')
    .eq('id', tourId)
    .maybeSingle();
  if (tourResult.error) throw new Error('Тура: ' + tourResult.error.message);
  if (!tourResult.data) throw new Error('Тура није пронађена или немате дозволу за читање.');
  const tour = tourResult.data;

  onProgress('2/7 · Читам распоред пунктова и времена туре…');
  const tourPointResult = await client.from('tura_punktovi')
    .select('punkt_id,vreme,redosled,aktivan')
    .eq('tura_id', tourId)
    .eq('aktivan', true)
    .order('redosled', { ascending: true });
  const tourPointLinks = unwrap(tourPointResult, 'Распоред пунктова туре');
  const pointIds = uniq(tourPointLinks.map(row => row.punkt_id));
  const pointsResult = pointIds.length
    ? await client.from('punktovi').select('id,name').in('id', pointIds)
    : { data: [], error: null };
  const points = unwrap(pointsResult, 'Називи пунктова');
  const pointById = new Map(points.map(point => [String(point.id), point]));
  const tourPoints = tourPointLinks.map(row => ({
    punkt_id: row.punkt_id,
    name: pointById.get(String(row.punkt_id))?.name || ('Пункт #' + row.punkt_id),
    vreme: row.vreme || ''
  }));

  onProgress('3/7 · Читам ставке поруџбина…');
  const itemResult = await client.from('stavke_porudzbine')
    .select('id,porudzbina_id,product_id,variant_id,package_count,package_size,package_unit')
    .eq('tura_id', tourId);
  const items = unwrap(itemResult, 'Ставке поруџбина');
  const invalidSourceRows = items.filter((row) => !row.product_id).length;
  const productIds = uniq(items.filter((row) => row.product_id).map((row) => row.product_id));
  const variantIds = uniq(items.filter((row) => row.variant_id).map((row) => row.variant_id));

  onProgress('4/7 · Читам производе и амбалажу из поруџбина ове туре…');
  const [productsResult, variantsResult, allocationsResult] = await Promise.all([
    productIds.length ? client.from('products')
      .select('id,name,category,is_active,has_variants')
      .in('id', productIds)
      .order('name', { ascending: true }) : { data: [], error: null },
    variantIds.length ? client.from('product_variants')
      .select('id,product_id,name,size_label,unit,package_value,package_unit,is_active,sort_order')
      .in('id', variantIds)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }) : { data: [], error: null },
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
  onProgress('5/7 · Проверавам активне понуде газдинстава…');
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
  onProgress('6/7 · Учитавају се подаци газдинстава…');
  const farmResult = farmIds.length
    ? await client.from('gazdinstva')
      .select('id,name,phone')
      .in('id', farmIds)
      .order('name', { ascending: true })
    : { data: [], error: null };
  const farms = unwrap(farmResult, 'Газдинства');

  onProgress('7/7 · Завршавам обраду података…');
  return {
    tour,
    tourPoints,
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
