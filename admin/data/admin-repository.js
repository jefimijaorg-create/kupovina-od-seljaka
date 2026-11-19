/*
 * NARUČI DOMAĆE — ADMIN DATA REPOSITORY
 * Version: 1.0.8
 * Updated: 2026-11-19
 * Description: Loads tour order items with customer identities and per-farm item allocations for customer-level procurement display; performs no writes.
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
  let items = unwrap(itemResult, 'Ставке поруџбина');
  const itemIds = uniq(items.map((row) => row.id));
  const orderIds = uniq(items.map((row) => row.porudzbina_id));
  onProgress('4/7 · Повезујем купце и расподелу по газдинствима…');
  const [ordersResult, farmAllocationsResult] = await Promise.all([
    orderIds.length ? client.from('porudzbine').select('id,kupac_id').in('id', orderIds) : { data: [], error: null },
    itemIds.length ? client.from('tura_stavke_raspodela')
      .select('id,stavka_porudzbine_id,gazdinstvo_id,broj_pakovanja,created_at,updated_at')
      .in('stavka_porudzbine_id', itemIds) : { data: [], error: null }
  ]);
  const orders = unwrap(ordersResult, 'Веза поруџбина и купаца');
  const farmAllocations = unwrap(farmAllocationsResult, 'Расподела ставки по газдинствима');
  const customerIds = uniq(orders.map((row) => row.kupac_id));
  const customersResult = customerIds.length
    ? await client.from('kupci').select('id,ime_prezime').in('id', customerIds)
    : { data: [], error: null };
  const customers = unwrap(customersResult, 'Називи купаца');
  const orderById = new Map(orders.map((row) => [String(row.id), row]));
  const customerById = new Map(customers.map((row) => [String(row.id), row]));
  const farmAllocationsByItem = new Map();
  for (const allocation of farmAllocations) {
    const itemId = String(allocation.stavka_porudzbine_id);
    if (!farmAllocationsByItem.has(itemId)) farmAllocationsByItem.set(itemId, []);
    farmAllocationsByItem.get(itemId).push(allocation);
  }
  items = items.map((row) => {
    const order = orderById.get(String(row.porudzbina_id));
    const customer = order?.kupac_id === null || order?.kupac_id === undefined
      ? null : customerById.get(String(order.kupac_id));
    return {
      ...row,
      customer_id: order?.kupac_id ?? null,
      customer_name: customer?.ime_prezime || null,
      farm_allocations: farmAllocationsByItem.get(String(row.id)) || []
    };
  });
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
    ...allocations.map((row) => row.gazdinstvo_id),
    ...farmAllocations.map((row) => row.gazdinstvo_id)
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
