/*
 * NARUČI ДОМАЋЕ — PROCUREMENT WORKFLOW ACTIONS
 * Version: 1.0.0
 * Updated: 2026-11-19
 * Description: Centralizes authenticated procurement writes and immutable audit-history reads.
 * Scope: Existing ADMIN Workspace, existing Supabase schema/RLS/triggers only.
 */
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export async function loadProcurementHistory({ client, tourId, limit = 300 }) {
  if (!client || !tourId) throw new TypeError('Недостаје Supabase клијент или ID туре.');
  const result = await client.from('tura_nabavka_istorija')
    .select('id,allocation_id,tura_id,product_id,variant_id,gazdinstvo_id,operation,actor_id,actor_role,old_data,new_data,created_at')
    .eq('tura_id', tourId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.min(1000, Math.max(1, Number(limit) || 300)));
  if (result.error) throw new Error('Историја набавке: ' + result.error.message);
  return Array.isArray(result.data) ? result.data : [];
}

export async function markProcurementSent({ client, rowIds, sentAt = new Date().toISOString() }) {
  const ids = [...new Set((rowIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('Нема ставки за евидентирање слања.');
  const result = await client.from('tura_nabavka_dodele')
    .update({ naruceno: true, viber_status: 'sent', viber_poslato_at: sentAt, updated_at: sentAt })
    .in('id', ids)
    .eq('viber_status', 'not_sent')
    .select('id,viber_status,naruceno_pakovanja');
  if (result.error) throw new Error(result.error.message);
  if (!Array.isArray(result.data) || result.data.length !== ids.length || result.data.some(row => row.viber_status !== 'sent')) {
    throw new Error('База није потврдила слање за све изабране ставке.');
  }
  return result.data;
}

export async function saveProcurementTracking({ client, row, confirmed, collected }) {
  if (!row?.id) throw new TypeError('Ставка набавке није пронађена.');
  if (!Number.isInteger(Number(confirmed)) || Number(confirmed) < 0 ||
      !Number.isInteger(Number(collected)) || Number(collected) < 0) {
    throw new Error('Количине морају бити цели ненегативни бројеви паковања.');
  }
  if (Number(confirmed) > number(row.naruceno_pakovanja)) throw new Error('Потврђена количина не може бити већа од послате.');
  if (Number(collected) > Number(confirmed)) throw new Error('Преузета количина не може бити већа од потврђене.');
  const now = new Date().toISOString();
  const patch = {
    potvrdjeno_pakovanja: Number(confirmed),
    preuzeto_pakovanja: Number(collected),
    updated_at: now
  };
  if (Number(confirmed) !== number(row.potvrdjeno_pakovanja)) patch.potvrdjeno_at = Number(confirmed) ? now : null;
  const result = await client.from('tura_nabavka_dodele')
    .update(patch)
    .eq('id', row.id)
    .select('id,potvrdjeno_pakovanja,preuzeto_pakovanja,potvrdjeno_at,updated_at')
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data ||
      number(result.data.potvrdjeno_pakovanja) !== Number(confirmed) ||
      number(result.data.preuzeto_pakovanja) !== Number(collected)) {
    throw new Error('База није потврдила упис количина.');
  }
  return result.data;
}
