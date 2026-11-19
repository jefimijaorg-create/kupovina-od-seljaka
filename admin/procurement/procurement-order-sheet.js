/* ADMIN PROCUREMENT ORDER SHEET · V1.0.2 · 2026-11-19
 * Одговорност: детаљ поруџбине, статус набавке, додела пункта и количине паковања.
 * Користи постојећи аутентификовани Supabase клијент ADMIN Workspace-а и прослеђено стање.
 */
export function createProcurementOrderSheet({ client, getState, refresh }) {
  if (!client || typeof client.from !== 'function' || typeof getState !== 'function') {
    throw new TypeError('Недостаје потврђени Supabase клијент или приступ стању ADMIN Workspace-а.');
  }

  const STATUS = [
    { value: 'provera', label: 'Провера' },
    { value: 'potvrdjeno', label: 'Потврђено' },
    { value: 'preuzeto', label: 'Преузето' }
  ];
  const state = { order: null, lines: [], loading: false, saving: false, error: '', notice: '' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const format = value => value === null ? '—' : value.toLocaleString('sr-RS', { maximumFractionDigits: 3 });
  const money = value => value === null ? '—' : value.toLocaleString('sr-RS', { maximumFractionDigits: 2 }) + ' дин.';
  const root = document.createElement('div');
  root.id = 'nd-procurement-order-sheet-root';
  root.innerHTML = `
    <div class="nd-order-backdrop" data-action="close" hidden></div>
    <section class="nd-order-sheet" role="dialog" aria-modal="true" aria-labelledby="nd-order-title" hidden>
      <header class="nd-order-head">
        <div><span class="nd-order-kicker">ADMIN · УПРАВЉАЊЕ ПОРУЏБИНОМ</span><h2 id="nd-order-title">Поруџбина</h2><p data-role="subtitle"></p></div>
        <button type="button" class="nd-order-close" data-action="close" aria-label="Затвори панел">×</button>
      </header>
      <div class="nd-order-content">
        <div class="nd-order-message" data-role="message" aria-live="polite" hidden></div>
        <div data-role="body"><div class="nd-order-loading">Учитавање поруџбине…</div></div>
      </div>
      <footer class="nd-order-foot"><button type="button" data-action="close" class="nd-order-secondary">Затвори</button></footer>
    </section>`;
  document.body.append(root);



  const $ = selector => root.querySelector(selector);
  const getOrder = id => (getState().orders || []).find(row => String(row.id) === String(id));
  const getBuyer = order => (getState().customers || []).find(row => String(row.id) === String(order?.kupac_id)) || {};
  const getPoint = id => (getState().points || []).find(row => String(row.id) === String(id));
  const productName = line => {
    if (!line.product_id) return 'Неповезана ставка · производ није повезан';
    const product = (getState().productCatalog || []).find(row => String(row.id) === String(line.product_id));
    return product?.name || 'Производ није пронађен у каталогу';
  };
  const packageText = line => {
    const count = number(line.package_count);
    const size = number(line.package_size);
    const unit = String(line.package_unit || '').trim();
    if (count === null || size === null || !unit) return 'Подаци о амбалажи нису потпуни';
    return format(count) + ' пак. × ' + format(size) + ' ' + unit + ' = ' + format(count * size) + ' ' + unit;
  };
  const message = (text, kind = 'success') => {
    const box = $('[data-role="message"]');
    box.hidden = !text;
    box.className = 'nd-order-message ' + (kind === 'error' ? 'nd-order-error' : 'nd-order-success');
    box.textContent = text || '';
  };

  function render() {
    const order = state.order;
    if (!order) return;
    const buyer = getBuyer(order);
    const point = getPoint(order.punkt_id);
    const status = STATUS.some(item => item.value === order.procurement_status) ? order.procurement_status : '';
    const statusOptions = '<option value="">— Није постављен —</option>' + STATUS.map(item =>
      '<option value="' + item.value + '"' + (status === item.value ? ' selected' : '') + '>' + item.label + '</option>'
    ).join('');
    const pointOptions = '<option value="">— Без пункта —</option>' + (getState().points || []).map(item =>
      '<option value="' + esc(item.id) + '"' + (String(order.punkt_id || '') === String(item.id) ? ' selected' : '') + '>' +
      esc(item.name || ('Пункт ' + item.id)) + (item.address ? ' · ' + esc(item.address) : '') + '</option>'
    ).join('');
    const lineHtml = state.lines.length ? state.lines.map(line => {
      const count = number(line.package_count);
      const editable = line.unit_price !== null && line.unit_price !== undefined && line.unit_price !== '';
      return `
        <div class="nd-order-line">
          <div>
            <div class="nd-order-line-title">${esc(productName(line))}</div>
            <div class="nd-order-line-meta">${esc(packageText(line))}</div>
            ${!line.product_id || !(getState().productCatalog || []).some(p => String(p.id) === String(line.product_id))
              ? '<div class="nd-order-warning nd-order-mt-8">Ставка нема потврђену везу са каталогом. Назив није преузет из старог текстуалног поља.</div>' : ''}
          </div>
          <div class="nd-order-line-controls">
            <label class="nd-order-field">Број паковања
              <input type="number" min="0.001" step="0.001" inputmode="decimal" data-package-count="${esc(line.id)}"
                value="${count === null ? '' : esc(count)}" ${editable ? '' : 'disabled'}
                aria-label="Број паковања за ставку ${esc(line.id)}">
            </label>
            <div class="nd-order-line-total">${money(number(line.cena_stavke))}</div>
          </div>
          ${editable ? '' : '<div class="nd-order-muted">Количина је само за преглед јер ставка нема сачувану цену по паковању.</div>'}
        </div>`;
    }).join('') : '<p class="nd-order-muted">Ова поруџбина нема учитаних ставки.</p>';

    $('[data-role="subtitle"]').textContent =
      (buyer.ime_prezime || ('Купац · поруџбина #' + order.id)) + ' · ' +
      (order.telefon || buyer.telefon || 'Телефон није унет');
    $('[data-role="body"]').innerHTML = `
      <div class="nd-order-grid">
        <section class="nd-order-card">
          <h3>Статус набавке и пункт</h3>
          <label class="nd-order-field">Фаза набавке
            <select data-field="procurement_status">${statusOptions}</select>
          </label>
          <label class="nd-order-field nd-order-mt-12">Пункт за целу поруџбину
            <select data-field="punkt_id">${pointOptions}</select>
          </label>
          <div class="nd-order-muted nd-order-mt-9">Основни статус поруџбине: <strong>${esc(order.status || 'није наведен')}</strong></div>
          <div class="nd-order-actions"><button type="button" class="nd-order-primary" data-action="save-order" ${state.saving ? 'disabled' : ''}>Сачувај статус и пункт</button></div>
        </section>
        <section class="nd-order-card">
          <h3>Подаци поруџбине</h3>
          <div class="nd-order-muted">Поруџбина #${esc(order.id)}</div>
          <div class="nd-order-summary nd-order-mt-12"><span>Укупан износ</span><strong>${money(number(order.ukupna_cena))}</strong></div>
          <div class="nd-order-muted nd-order-mt-8">Тренутни пункт: ${esc(point?.name || 'Није додељен')}</div>
          ${order.adresa_dostave ? '<div class="nd-order-muted nd-order-mt-6">Адреса: ' + esc(order.adresa_dostave) + '</div>' : ''}
        </section>
      </div>
      <section class="nd-order-card nd-order-mt-14">
        <div class="nd-order-summary"><h3 class="nd-order-title-reset">Ставке поруџбине · ${state.lines.length}</h3><span class="nd-order-muted">Промена количине се чува по ставци</span></div>
        ${lineHtml}
        ${state.lines.length ? '<div class="nd-order-actions"><button type="button" class="nd-order-primary" data-action="save-quantities" ' + (state.saving ? 'disabled' : '') + '>Сачувај количине</button></div>' : ''}
      </section>`;
  }

  async function open(orderId) {
    const order = getOrder(orderId);
    if (!order) {
      state.order = null;
      message('Поруџбина није пронађена у учитаном ADMIN списку.', 'error');
      return;
    }
    state.order = { ...order };
    state.lines = [];
    state.loading = true;
    state.saving = false;
    state.error = '';
    $('[data-role="subtitle"]').textContent = '';
    $('[data-role="body"]').innerHTML = '<div class="nd-order-loading">Учитавање ставки поруџбине…</div>';
    $('[data-role="message"]').hidden = true;
    $('[data-action="close"]').setAttribute('aria-label', 'Затвори панел');
    $('.nd-order-backdrop').hidden = false;
    $('.nd-order-sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    try {
      const { data: rows, error: linesError } = await client.from('stavke_porudzbine').select('id,porudzbina_id,product_id,package_count,package_size,package_unit,total_quantity,quantity_unit,unit_price,cena_stavke').eq('porudzbina_id', orderId).order('id', { ascending: true });
      if (linesError) throw linesError;
      if (!Array.isArray(rows)) throw new Error('База није вратила исправне ставке поруџбине.');
      state.lines = rows;
      state.loading = false;
      render();
    } catch (error) {
      state.loading = false;
      $('[data-role="body"]').innerHTML = '<div class="nd-order-error">' + esc(error.message || String(error)) + '</div>';
    }
  }

  async function saveOrder() {
    if (state.saving || !state.order) return;
    const status = $('[data-field="procurement_status"]')?.value || null;
    const pointValue = $('[data-field="punkt_id"]')?.value || null;
    if (status !== null && !STATUS.some(item => item.value === status)) {
      message('Изабрана фаза набавке није дозвољена.', 'error'); return;
    }
    if (pointValue && !getPoint(pointValue)) {
      message('Изабрани пункт није пронађен у учитаном списку.', 'error'); return;
    }
    state.saving = true;
    const button = $('[data-action="save-order"]');
    if (button) { button.disabled = true; button.textContent = 'ЧУВАМ…'; }
    try {
      const payload = { procurement_status: status, punkt_id: pointValue ? Number(pointValue) : null };
      const { data: savedRows, error: saveError } = await client.from('porudzbine').update(payload).eq('id', state.order.id).select('*');
      if (saveError) throw saveError;
      const saved = Array.isArray(savedRows) ? savedRows.find(row => String(row.id) === String(state.order.id)) : null;
      if (!saved || (saved.procurement_status || null) !== status ||
          String(saved.punkt_id || '') !== String(payload.punkt_id || '')) {
        throw new Error('База није потврдила статус и пункт поруџбине.');
      }
      Object.assign(state.order, saved);
      const cached = (getState().orders || []).find(row => String(row.id) === String(saved.id));
      if (cached) Object.assign(cached, saved);
      state.saving = false;
      render();
      message('Статус набавке и пункт су сачувани и потврђени у бази.');
      if (typeof refresh === 'function') await refresh();
    } catch (error) {
      state.saving = false;
      message('Измена није потврђена: ' + (error.message || String(error)), 'error');
      render();
    }
  }

  async function saveQuantities() {
    if (state.saving || !state.order) return;
    const inputs = [...root.querySelectorAll('[data-package-count]')];
    const prepared = [];
    for (const input of inputs) {
      const line = state.lines.find(row => String(row.id) === String(input.dataset.packageCount));
      if (!line) { message('Ставка је промењена. Освежи панел.', 'error'); return; }
      const raw = String(input.value || '').trim();
      const count = Number(raw);
      if (!Number.isFinite(count) || count <= 0) {
        message('Број паковања мора бити већи од нуле.', 'error'); input.focus(); return;
      }
      if (line.unit_price === null || line.unit_price === undefined || line.unit_price === '') {
        message('Ставка #' + line.id + ' нема цену по паковању; количина није промењена.', 'error'); return;
      }
      if (Math.abs(count - Number(line.package_count)) > 0.000001) prepared.push({ line, count });
    }
    if (!prepared.length) { message('Нема промена количина за чување.'); return; }
    state.saving = true;
    const button = $('[data-action="save-quantities"]');
    if (button) { button.disabled = true; button.textContent = 'ЧУВАМ КОЛИЧИНЕ…'; }
    let savedCount = 0;
    try {
      for (const item of prepared) {
        const { data: savedRows, error: saveError } = await client.from('stavke_porudzbine').update({ package_count: item.count }).eq('id', item.line.id).select('*');
        if (saveError) throw saveError;
        const saved = Array.isArray(savedRows) ? savedRows.find(row => String(row.id) === String(item.line.id)) : null;
        if (!saved || Math.abs(Number(saved.package_count) - item.count) > 0.000001) {
          throw new Error('База није потврдила број паковања за ставку #' + item.line.id + '.');
        }
        Object.assign(item.line, saved);
        savedCount++;
      }
      const { data: verified, error: verifyError } = await client.from('porudzbine').select('id,ukupna_cena').eq('id', state.order.id);
      if (verifyError) throw verifyError;
      const orderRow = Array.isArray(verified) ? verified.find(row => String(row.id) === String(state.order.id)) : null;
      if (!orderRow) throw new Error('Није могуће проверити укупан износ поруџбине.');
      state.order.ukupna_cena = orderRow.ukupna_cena;
      const cached = (getState().orders || []).find(row => String(row.id) === String(state.order.id));
      if (cached) cached.ukupna_cena = orderRow.ukupna_cena;
      state.saving = false;
      render();
      message('Сачувано и проверено: ' + savedCount + ' измена количина. Укупан износ: ' + money(number(orderRow.ukupna_cena)) + '.');
      if (typeof refresh === 'function') await refresh();
    } catch (error) {
      state.saving = false;
      render();
      message('Потврђено је ' + savedCount + ' од ' + prepared.length + ' измена. ' + (error.message || String(error)), 'error');
    }
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'close') close();
    if (action === 'save-order') saveOrder();
    if (action === 'save-quantities') saveQuantities();
  });
  function close() {
    if (state.saving) return;
    $('.nd-order-backdrop').hidden = true;
    $('.nd-order-sheet').hidden = true;
    document.body.style.overflow = '';
  }
  function onKeydown(event) {
    if (event.key === 'Escape' && !$('.nd-order-sheet').hidden) close();
  }
  document.addEventListener('keydown', onKeydown);

  return {
    open,
    close,
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      root.remove();

    }
  };
}
