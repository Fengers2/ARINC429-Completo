require('dotenv').config();
const express = require('express');
const path = require('node:path');
const instruments = require('./instruments');
const { encodeArinc429 } = require('./arinc');
const { pool, initializeDatabase, qTable, columns } = require('./database');
const { transmit } = require('./serial');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function findInstrument(number) {
  return instruments.find((instrument) => instrument.number === Number(number));
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

app.get('/api/instruments', (_req, res) => res.json(instruments.map(({ number, name, unit, min, max }) => ({ number, name, unit, min, max }))));
app.get('/api/envios', asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(`SELECT ${columns} FROM ${qTable} ORDER BY id DESC`);
  res.json(rows.map(includeBinaryWord));
}));
app.get('/api/envios/:id', asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(`SELECT ${columns} FROM ${qTable} WHERE id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Envío no encontrado.' });
  res.json(includeBinaryWord(rows[0]));
}));

app.post('/api/envios', asyncRoute(async (req, res) => {
  const instrument = findInstrument(req.body.instrumentNumber);
  if (!instrument) return res.status(400).json({ error: 'Selecciona un instrumento válido.' });
  const value = validateValue(instrument, req.body.value);
  let encoded;
  try { encoded = encodeArinc429(value, instrument); }
  catch (error) { return res.status(400).json({ error: `No se puede codificar: ${error.message}` }); }

  const [result] = await pool.execute(
    `INSERT INTO ${qTable} (\`numero del instrumento\`, \`nombre del instrumento\`, \`valor\`, arinc429, serial_status) VALUES (?, ?, ?, ?, 'no_enviado')`,
    [instrument.number, instrument.name, value, encoded.hex]
  );
  let delivery = { status: 'no_enviado', message: 'Transmisión serial desactivada.' };
  try { delivery = await transmit(encoded.bytes); }
  catch (error) { delivery = { status: 'error', message: error.message }; }
  await pool.execute(`UPDATE ${qTable} SET serial_status = ? WHERE id = ?`, [delivery.status, result.insertId]);
  const [rows] = await pool.execute(`SELECT ${columns} FROM ${qTable} WHERE id = ?`, [result.insertId]);
  res.status(201).json({ ...includeBinaryWord(rows[0]), deliveryMessage: delivery.message });
}));

app.put('/api/envios/:id', asyncRoute(async (req, res) => {
  const instrument = findInstrument(req.body.instrumentNumber);
  if (!instrument) return res.status(400).json({ error: 'Selecciona un instrumento válido.' });
  const value = validateValue(instrument, req.body.value);
  let encoded;
  try { encoded = encodeArinc429(value, instrument); }
  catch (error) { return res.status(400).json({ error: `No se puede codificar: ${error.message}` }); }
  const [result] = await pool.execute(
    `UPDATE ${qTable} SET \`numero del instrumento\` = ?, \`nombre del instrumento\` = ?, \`valor\` = ?, arinc429 = ?, serial_status = 'no_enviado' WHERE id = ?`,
    [instrument.number, instrument.name, value, encoded.hex, req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Envío no encontrado.' });
  const [rows] = await pool.execute(`SELECT ${columns} FROM ${qTable} WHERE id = ?`, [req.params.id]);
  res.json({ ...includeBinaryWord(rows[0]), deliveryMessage: 'Actualizado. Sin transmitir; usa el botón Enviar si corresponde.' });
}));

app.delete('/api/envios/:id', asyncRoute(async (req, res) => {
  const [result] = await pool.execute(`DELETE FROM ${qTable} WHERE id = ?`, [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Envío no encontrado.' });
  res.status(204).end();
}));

app.post('/api/envios/:id/transmitir', asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(`SELECT ${columns} FROM ${qTable} WHERE id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Envío no encontrado.' });
  const envio = rows[0];
  const instrument = findInstrument(envio.instrument_number);
  if (!instrument) return res.status(400).json({ error: 'Instrumento no disponible en el catálogo.' });
  let delivery;
  try {
    const encoded = encodeArinc429(Number(envio.value), instrument);
    delivery = await transmit(encoded.bytes);
  } catch (error) { delivery = { status: 'error', message: error.message }; }
  await pool.execute(`UPDATE ${qTable} SET serial_status = ? WHERE id = ?`, [delivery.status, req.params.id]);
  const [updated] = await pool.execute(`SELECT ${columns} FROM ${qTable} WHERE id = ?`, [req.params.id]);
  res.json({ ...includeBinaryWord(updated[0]), deliveryMessage: delivery.message });
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Error interno del servidor.' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`ARINC429 disponible en http://localhost:${port}`));
initializeDatabase()
  .then(() => console.log('Conexión MySQL lista.'))
  .catch((error) => console.error(`MySQL no disponible: ${error.message}. Revise DB_USER, DB_PASSWORD y DB_NAME en .env.`));
