require('dotenv').config();
const express = require('express');
const path = require('node:path');
let instruments = [];
const { encodeArinc429 } = require('./arinc');
const storage = require('./storage');
const { transmit } = require('./serial');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function findInstrument(number) {
  return instruments.find((instrument) => instrument.number === Number(number));
}
function publicInstrument(instrument) {
  return { ...instrument, min: Number(instrument.min), max: Number(instrument.max), lsb: Number(instrument.lsb) };
}
function validateInstrument(input) {
  const instrument = {
    number: Number(input.number),
    name: String(input.name || '').trim(),
    unit: String(input.unit || '').trim(),
    min: Number(input.min),
    max: Number(input.max),
    labelOctal: String(input.labelOctal || '').trim(),
    encoding: 'BNR',
    lsb: Number(input.lsb),
    sdi: Number(input.sdi),
    ssm: Number(input.ssm),
    verified: false
  };
  if (!Number.isInteger(instrument.number) || instrument.number < 1 || instrument.number > 65535) throw new Error('El número de instrumento debe ser un entero entre 1 y 65535.');
  if (!instrument.name || instrument.name.length > 120) throw new Error('El nombre es obligatorio y no debe superar 120 caracteres.');
  if (instrument.unit.length > 24) throw new Error('La unidad no debe superar 24 caracteres.');
  if (!Number.isFinite(instrument.min) || !Number.isFinite(instrument.max) || instrument.min >= instrument.max) throw new Error('El valor mínimo y máximo deben ser numéricos y el mínimo debe ser menor que el máximo.');
  if (!/^[0-7]{1,3}$/.test(instrument.labelOctal) || Number.parseInt(instrument.labelOctal, 8) > 0o377) throw new Error('La etiqueta debe ser octal, entre 000 y 377.');
  if (!Number.isFinite(instrument.lsb) || instrument.lsb <= 0) throw new Error('La resolución LSB debe ser un número positivo.');
  if (![instrument.sdi, instrument.ssm].every((value) => Number.isInteger(value) && value >= 0 && value <= 3)) throw new Error('SDI y SSM deben ser enteros entre 0 y 3.');
  try {
    encodeArinc429(instrument.min, instrument);
    encodeArinc429(instrument.max, instrument);
  } catch (error) { throw new Error(`La configuración no cabe en BNR: ${error.message}`); }
  return instrument;
}
function validateValue(instrument, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error('Ingresa un valor numérico válido.');
  if (numeric < instrument.min || numeric > instrument.max) {
    throw new Error(`${instrument.name}: el valor debe estar entre ${instrument.min} y ${instrument.max} ${instrument.unit}.`);
  }
  return numeric;
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
function includeBinaryWord(row) {
  if (!row.arinc429) return { ...row, bits: null };
  const value = Number.parseInt(row.arinc429, 16);
  const bits = Number.isFinite(value) ? value.toString(2).padStart(32, '0') : null;
  return { ...row, arinc429: bits, bits };
}

app.get('/api/instruments', (_req, res) => res.json(instruments.map(publicInstrument)));
app.post('/api/instruments', asyncRoute(async (req, res) => {
  let instrument;
  try { instrument = validateInstrument(req.body); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    await storage.addInstrument(instrument);
  } catch (error) {
    if (error.code === 'DUPLICATE_INSTRUMENT') return res.status(409).json({ error: error.message });
    throw error;
  }
  instruments.push(instrument);
  res.status(201).json(publicInstrument(instrument));
}));
app.post('/api/arinc429/preview', (req, res) => {
  const instrument = findInstrument(req.body.instrumentNumber);
  if (!instrument) return res.status(400).json({ error: 'Selecciona un instrumento válido.' });
  try {
    const value = validateValue(instrument, req.body.value);
    const encoded = encodeArinc429(value, instrument);
    res.json({ bits: encoded.bits, hex: encoded.hex });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.get('/api/envios', asyncRoute(async (_req, res) => {
  res.json(storage.listShipments().map(includeBinaryWord));
}));
app.get('/api/envios/:id', asyncRoute(async (req, res) => {
  const row = storage.getShipment(req.params.id);
  if (!row) return res.status(404).json({ error: 'Envío no encontrado.' });
  res.json(includeBinaryWord(row));
}));

app.post('/api/envios', asyncRoute(async (req, res) => {
  const instrument = findInstrument(req.body.instrumentNumber);
  if (!instrument) return res.status(400).json({ error: 'Selecciona un instrumento válido.' });
  const value = validateValue(instrument, req.body.value);
  let encoded;
  try { encoded = encodeArinc429(value, instrument); }
  catch (error) { return res.status(400).json({ error: `No se puede codificar: ${error.message}` }); }

  const row = await storage.createShipment(instrument, value, encoded.hex);
  res.status(201).json({ ...includeBinaryWord(row), deliveryMessage: 'Guardado sin transmitir. Usa Enviar solo con hardware y parámetros verificados.' });
}));

app.put('/api/envios/:id', asyncRoute(async (req, res) => {
  const instrument = findInstrument(req.body.instrumentNumber);
  if (!instrument) return res.status(400).json({ error: 'Selecciona un instrumento válido.' });
  const value = validateValue(instrument, req.body.value);
  let encoded;
  try { encoded = encodeArinc429(value, instrument); }
  catch (error) { return res.status(400).json({ error: `No se puede codificar: ${error.message}` }); }
  const row = await storage.updateShipment(req.params.id, instrument, value, encoded.hex);
  if (!row) return res.status(404).json({ error: 'Envío no encontrado.' });
  res.json({ ...includeBinaryWord(row), deliveryMessage: 'Actualizado. Sin transmitir; usa el botón Enviar si corresponde.' });
}));

app.delete('/api/envios/:id', asyncRoute(async (req, res) => {
  if (!await storage.deleteShipment(req.params.id)) return res.status(404).json({ error: 'Envío no encontrado.' });
  res.status(204).end();
}));

app.post('/api/envios/:id/transmitir', asyncRoute(async (req, res) => {
  const envio = storage.getShipment(req.params.id);
  if (!envio) return res.status(404).json({ error: 'Envío no encontrado.' });
  const instrument = findInstrument(envio.instrument_number);
  if (!instrument) return res.status(400).json({ error: 'Instrumento no disponible en el catálogo.' });
  let delivery;
  try {
    const encoded = encodeArinc429(Number(envio.value), instrument);
    delivery = await transmit(encoded.bytes);
  } catch (error) { delivery = { status: 'error', message: error.message }; }
  const updated = await storage.updateShipmentStatus(req.params.id, delivery.status);
  res.json({ ...includeBinaryWord(updated), deliveryMessage: delivery.message });
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Error interno del servidor.' });
});

const port = Number(process.env.PORT || 3000);
storage.initializeStorage()
  .then(() => {
    instruments = storage.listInstruments().map(publicInstrument);
    app.listen(port, () => console.log(`ARINC429 disponible en http://localhost:${port}`));
  })
  .catch((error) => {
    console.error(`No se pudo inicializar el almacenamiento local: ${error.message}`);
    process.exitCode = 1;
  });
