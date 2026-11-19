/*
 * NARUČI ДОМАЋЕ — PROCUREMENT WORKFLOW ACTIONS
 * Version: 1.1.1
 * Updated: 2026-11-19
 * Description: Returns unconfirmed supplier quantities to demand and verifies the history-backed update.
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

export async function transferUnconfirmedProcurement({ client, sourceRow, targetFarmId, packages }) {
  if (!client || !sourceRow?.id) throw new TypeError('Недостаје изворна расподела или Supabase клијент.');
  const count = Number(packages);
  const available = Math.max(0, number(sourceRow.naruceno_pakovanja) - number(sourceRow.potvrdjeno_pakovanja));
  if (!Number.isInteger(count) || count <= 0) throw new Error('Количина преноса мора бити позитиван цео број паковања.');
  if (!Number.isInteger(Number(targetFarmId)) || Number(targetFarmId) <= 0) throw new Error('Изабери циљно газдинство.');
  if (String(targetFarmId) === String(sourceRow.gazdinstvo_id)) throw new Error('Изворно и циљно газдинство морају бити различити.');
  if (count > available) throw new Error('Пренос премашује преосталу непотврђену количину.');

  const rpc = await client.rpc('transfer_tura_nabavka_unconfirmed', {
    p_source_allocation_id: Number(sourceRow.id),
    p_target_gazdinstvo_id: Number(targetFarmId),
    p_package_count: count
  });
  if (rpc.error) throw new Error(rpc.error.message);
  const result = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  if (!result || number(result.transferred_packages) !== count || !result.target_allocation_id) {
    throw new Error('База није вратила потврду атомског преноса.');
  }

  const targetRead = await client.from('tura_nabavka_dodele')
    .select('id,tura_id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja,viber_status')
    .eq('id', result.target_allocation_id)
    .maybeSingle();
  if (targetRead.error) throw new Error('Пренос је извршен, али провера циљне расподеле није успела: ' + targetRead.error.message);
  if (!targetRead.data || targetRead.data.viber_status !== 'not_sent') {
    throw new Error('Пренос је извршен, али база није потврдила нови статус циљног захтева.');
  }

  const sourceRead = await client.from('tura_nabavka_dodele')
    .select('id,broj_pakovanja,naruceno_pakovanja,potvrdjeno_pakovanja,viber_status')
    .eq('id', sourceRow.id)
    .maybeSingle();
  if (sourceRead.error) throw new Error('Пренос је извршен, али провера изворне расподеле није успела: ' + sourceRead.error.message);
  if (result.source_deleted) {
    if (sourceRead.data) throw new Error('База није потврдила уклањање празне изворне расподеле.');
  } else if (!sourceRead.data ||
      number(sourceRead.data.broj_pakovanja) !== number(sourceRow.broj_pakovanja) - count ||
      number(sourceRead.data.naruceno_pakovanja) !== number(sourceRow.naruceno_pakovanja) - count) {
    throw new Error('База није потврдила умањење изворне расподеле.');
  }

  return { ...result, target: targetRead.data, source: sourceRead.data };
}

export async function saveProcurementTracking({ client, row, confirmed, collected }) {
  if (!row?.id) throw new TypeError('Ставка набавке није пронађена.');
  if (!Number.isInteger(Number(confirmed)) || Number(confirmed) < 0 ||
      !Number.isInteger(Number(collected)) || Number(collected) < 0) {
    throw new Error('Количине морају бити цели ненегативни бројеви паковања.');
  }
  const fresh = await client.from('tura_nabavka_dodele')
    .select('id,tura_id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja,viber_status')
    .eq('id', row.id).maybeSingle();
  if (fresh.error) throw new Error(fresh.error.message);
  if (!fresh.data) throw new Error('Требовање више није доступно. Освежи приказ.');
  const live = fresh.data;
  const requested = number(live.naruceno_pakovanja);
  if (Number(confirmed) > requested) throw new Error('Потврђена количина не може бити већа од послате.');
  if (Number(collected) > Number(confirmed)) throw new Error('Преузета количина не може бити већа од потврђене.');
  if (Number(collected) < number(live.preuzeto_pakovanja)) throw new Error('Преузета количина не може бити накнадно умањена.');
  if (live.viber_status !== 'sent' && live.viber_status !== 'replied') throw new Error('Потврда је дозвољена тек након слања захтева газдинству.');

  const now = new Date().toISOString();
  const patch = {
    potvrdjeno_pakovanja: Number(confirmed),
    preuzeto_pakovanja: Number(collected),
    updated_at: now
  };
  // Option 1: the quantity the farm cannot confirm returns to Требовање.
  // The history trigger stores the complete before/after allocation snapshots.
  if (Number(confirmed) < requested) {
    patch.broj_pakovanja = Number(confirmed);
    patch.naruceno_pakovanja = Number(confirmed);
  }
  if (Number(confirmed) !== number(live.potvrdjeno_pakovanja)) patch.potvrdjeno_at = Number(confirmed) ? now : null;
  const result = await client.from('tura_nabavka_dodele')
    .update(patch)
    .eq('id', row.id)
    .eq('naruceno_pakovanja', live.naruceno_pakovanja)
    .eq('potvrdjeno_pakovanja', live.potvrdjeno_pakovanja)
    .select('id,broj_pakovanja,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja,potvrdjeno_at,updated_at')
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data ||
      number(result.data.potvrdjeno_pakovanja) !== Number(confirmed) ||
      number(result.data.preuzeto_pakovanja) !== Number(collected) ||
      number(result.data.naruceno_pakovanja) !== Math.min(requested, Number(confirmed)) ||
      number(result.data.broj_pakovanja) !== Math.min(number(live.broj_pakovanja), Number(confirmed))) {
    throw new Error('База није потврдила упис потврде и враћање непотврђеног остатка у Требовање. Освежи приказ и провери историју.');
  }
  return result.data;
}
