const $ = (selector) => document.querySelector(selector);
const form = $('#envio-form');
const instrumentSelect = $('#instrument');
const valueInput = $('#value');
let instruments = [];
let editingId = null;
let deleteId = null;
let toastTimer;
let previewTimer;
let previewRequest = 0;

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
  return data;
}
function notify(message, error = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}
function currentInstrument() { return instruments.find((instrument) => instrument.number === Number(instrumentSelect.value)); }
function updateRange() {
  const instrument = currentInstrument();
  if (!instrument) {
    $('#range-hint').textContent = 'Selecciona un instrumento';
    $('#unit-label').textContent = '';
    $('#value-unit').textContent = '—';
    $('#range-min').textContent = $('#range-max').textContent = '—';
    $('#range-fill').style.width = '0%';
    valueInput.removeAttribute('min');
    valueInput.removeAttribute('max');
    updatePreview();
    return;
  }
  $('#range-hint').textContent = `${instrument.min} a ${instrument.max} ${instrument.unit}`;
  $('#unit-label').textContent = `(${instrument.unit})`;
  $('#value-unit').textContent = instrument.unit;
  $('#range-min').textContent = instrument.min;
  $('#range-max').textContent = instrument.max;
  valueInput.min = instrument.min;
  valueInput.max = instrument.max;
  updateFill();
  updatePreview();
}
function updateFill() {
  const instrument = currentInstrument();
  const value = Number(valueInput.value);
  const fill = instrument && Number.isFinite(value) && instrument.max > instrument.min
    ? Math.max(0, Math.min(100, ((value - instrument.min) / (instrument.max - instrument.min)) * 100)) : 0;
  $('#range-fill').style.width = `${fill}%`;
}
async function loadInstruments() {
  instruments = await api('/api/instruments');
  instrumentSelect.innerHTML = '<option value="">Selecciona un instrumento</option>' + instruments.map((instrument) => `<option value="${instrument.number}">${escapeHtml(instrument.name)} · ${instrument.min}–${instrument.max} ${escapeHtml(instrument.unit)}</option>`).join('');
  $('#instruments-body').innerHTML = instruments.length ? instruments.map((instrument) => `<tr>
    <td>${instrument.number}</td><td class="instrument-cell">${escapeHtml(instrument.name)}<span class="subcell">${escapeHtml(instrument.unit || 'sin unidad')}</span></td>
    <td>${formatValue(instrument.min)} – ${formatValue(instrument.max)} ${escapeHtml(instrument.unit)}</td><td class="mono">${escapeHtml(instrument.labelOctal)}<span class="subcell">OCTAL</span></td>
    <td class="mono">${instrument.lsb}</td><td><span class="status ${instrument.verified ? 'enviado' : 'no_enviado'}">${instrument.verified ? 'VERIFICADO' : 'PENDIENTE ICD'}</span></td>
  </tr>`).join('') : '<tr><td class="empty" colspan="6">No hay instrumentos registrados.</td></tr>';
  updateRange();
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function formatValue(value) { return value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('es-ES', { maximumFractionDigits: 6 }); }
function formatBits(bits) { return bits ? bits.match(/.{1,4}/g).join(' ') : '—'; }
function statusText(status) { return ({ enviado: 'ENVIADO', error: 'ERROR', no_enviado: 'PENDIENTE' })[status] || escapeHtml(status); }
async function loadEnvios() {
  const rows = await api('/api/envios');
  $('#nav-count').textContent = rows.length;
  $('#record-count').textContent = `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`;
  $('#connection-label').textContent = 'Datos locales listos';
  $('#envios-body').innerHTML = rows.length ? rows.map((row) => `<tr>
    <td class="instrument-cell">${escapeHtml(row.instrument_name)}<span class="subcell">Instrumento #${escapeHtml(row.instrument_number)}</span></td>
    <td>${formatValue(row.min)}<span class="subcell">${escapeHtml((instruments.find((item) => item.number === Number(row.instrument_number)) || {}).unit || '')}</span></td>
    <td>${formatValue(row.value)}<span class="subcell">${escapeHtml((instruments.find((item) => item.number === Number(row.instrument_number)) || {}).unit || '')}</span></td>
    <td>${formatValue(row.max)}<span class="subcell">${escapeHtml((instruments.find((item) => item.number === Number(row.instrument_number)) || {}).unit || '')}</span></td>
    <td class="mono binary-word" title="Palabra completa: ${escapeHtml(row.bits || 'no disponible')}">${escapeHtml(formatBits(row.bits))}</td>
    <td><span class="status ${escapeHtml(row.serial_status)}">${statusText(row.serial_status)}</span></td>
    <td><div class="actions"><button class="icon-btn" data-action="transmit" data-id="${row.id}" title="Enviar por serial" aria-label="Enviar">➤</button><button class="icon-btn" data-action="edit" data-id="${row.id}" title="Editar" aria-label="Editar">✎</button><button class="icon-btn delete" data-action="delete" data-id="${row.id}" title="Eliminar" aria-label="Eliminar">×</button></div></td>
  </tr>`).join('') : '<tr><td class="empty" colspan="7">Aún no hay envíos. Crea el primero con el formulario.</td></tr>';
}
function updatePreview() {
  clearTimeout(previewTimer);
  const requestId = ++previewRequest;
  const instrument = currentInstrument();
  const value = Number(valueInput.value);
  if (!instrument || valueInput.value === '' || !Number.isFinite(value)) {
    $('#word-preview').textContent = '···· ···· ···· ···· ···· ···· ···· ····';
    $('#preview-caption').textContent = 'La vista previa se actualizará al elegir instrumento y valor.';
    return;
  }
  if (value < instrument.min || value > instrument.max) {
    $('#word-preview').textContent = '—';
    $('#preview-caption').textContent = `El valor debe estar entre ${instrument.min} y ${instrument.max} ${instrument.unit}.`;
    return;
  }
  $('#preview-caption').textContent = 'Calculando palabra BNR de 32 bits…';
  previewTimer = setTimeout(async () => {
    try {
      const result = await api('/api/arinc429/preview', { method: 'POST', body: JSON.stringify({ instrumentNumber: instrument.number, value }) });
      if (requestId === previewRequest && currentInstrument()?.number === instrument.number && Number(valueInput.value) === value) {
        $('#word-preview').textContent = formatBits(result.bits);
        $('#preview-caption').textContent = `Palabra ${result.hex} · BNR · paridad impar; no transmitida.`;
      }
    } catch (error) {
      if (requestId === previewRequest) {
        $('#word-preview').textContent = '—';
        $('#preview-caption').textContent = error.message;
      }
    }
  }, 180);
}
function resetForm() {
  editingId = null;
  form.reset();
  $('#form-title').textContent = 'Crear envío';
  $('#save-btn').innerHTML = '<span>＋</span> Crear envío';
  $('#cancel-edit').classList.add('hidden');
  $('#word-preview').textContent = '···· ···· ···· ···· ···· ···· ···· ····';
  updateRange();
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const instrument = currentInstrument();
  const value = Number(valueInput.value);
  if (!instrument) return notify('Selecciona un instrumento.', true);
  if (!Number.isFinite(value) || value < instrument.min || value > instrument.max) return notify(`El valor debe estar entre ${instrument.min} y ${instrument.max} ${instrument.unit}.`, true);
  const button = $('#save-btn');
  button.disabled = true;
  try {
    const result = await api(editingId ? `/api/envios/${editingId}` : '/api/envios', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify({ instrumentNumber: instrument.number, value })
    });
    const generatedBits = formatBits(result.bits);
    notify(`${editingId ? 'Envío actualizado.' : 'Envío creado.'} ${result.deliveryMessage || ''}`);
    resetForm();
    $('#word-preview').textContent = generatedBits;
    await loadEnvios();
  } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; }
});
instrumentSelect.addEventListener('change', updateRange);
valueInput.addEventListener('input', () => { updateFill(); updatePreview(); });
$('#cancel-edit').addEventListener('click', resetForm);
$('#refresh-btn').addEventListener('click', () => loadEnvios().catch((error) => notify(error.message, true)));
$('#envios-body').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'edit') {
      const row = await api(`/api/envios/${id}`);
      editingId = Number(id);
      instrumentSelect.value = row.instrument_number;
      valueInput.value = row.value;
      updateRange();
      $('#form-title').textContent = `Editar envío #${id}`;
      $('#save-btn').innerHTML = 'Guardar cambios';
      $('#cancel-edit').classList.remove('hidden');
      updatePreview();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (action === 'delete') {
      deleteId = id;
      $('#delete-dialog').showModal();
    } else if (action === 'transmit') {
      button.disabled = true;
      const result = await api(`/api/envios/${id}/transmitir`, { method: 'POST' });
      notify(result.deliveryMessage || 'Transmisión procesada.', result.serial_status === 'error');
      await loadEnvios();
    }
  } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; }
});
$('#delete-dialog').addEventListener('close', async () => {
  if ($('#delete-dialog').returnValue !== 'confirm' || !deleteId) return;
  try { await api(`/api/envios/${deleteId}`, { method: 'DELETE' }); notify('Envío eliminado.'); await loadEnvios(); }
  catch (error) { notify(error.message, true); }
  finally { deleteId = null; }
});
$('#instrument-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#add-instrument-btn');
  const fields = new FormData(event.currentTarget);
  const instrument = Object.fromEntries(fields.entries());
  for (const key of ['number', 'min', 'max', 'lsb', 'sdi', 'ssm']) instrument[key] = Number(instrument[key]);
  button.disabled = true;
  try {
    await api('/api/instruments', { method: 'POST', body: JSON.stringify(instrument) });
    event.currentTarget.reset();
    $('#new-instrument-sdi').value = '0';
    $('#new-instrument-ssm').value = '0';
    await loadInstruments();
    notify('Instrumento agregado. Verifica sus parámetros con el ICD antes de usarlo.');
  } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; }
});
(async () => {
  try {
    await loadInstruments();
    await loadEnvios();
  } catch (error) {
    $('#connection-label').textContent = 'Almacenamiento local no disponible';
    notify(error.message, true);
  }
})();
