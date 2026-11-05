const fs = require('node:fs/promises');
const path = require('node:path');

const dataFile = path.resolve(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'arinc429.json'));
let state = { instruments: [], envios: [], nextId: 1 };
let writeQueue = Promise.resolve();

function queueSave() {
  const save = async () => {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const temporaryFile = `${dataFile}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(temporaryFile, dataFile);
  };
  writeQueue = writeQueue.then(save, save);
  return writeQueue;
}

async function initializeStorage() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    if (!parsed || !Array.isArray(parsed.instruments) || !Array.isArray(parsed.envios)) {
      throw new Error('El archivo de datos no tiene el formato esperado.');
    }
    state = {
      instruments: parsed.instruments,
      envios: parsed.envios,
      nextId: Number(parsed.nextId) || Math.max(0, ...parsed.envios.map((row) => Number(row.id) || 0)) + 1
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const examples = require('./instruments');
    state = { instruments: examples.map((instrument) => ({ ...instrument })), envios: [], nextId: 1 };
    await queueSave();
  }
}

function listInstruments() {
  return state.instruments.map((instrument) => ({ ...instrument }));
}

function addInstrument(instrument) {
  if (state.instruments.some((item) => item.number === instrument.number)) {
    const error = new Error('Ya existe un instrumento con ese número.');
    error.code = 'DUPLICATE_INSTRUMENT';
    throw error;
  }
  state.instruments.push({ ...instrument });
  return queueSave().then(() => ({ ...instrument }));
}

function listShipments() {
  return state.envios.slice().sort((a, b) => b.id - a.id).map((row) => ({ ...row }));
}

function getShipment(id) {
  const row = state.envios.find((item) => item.id === Number(id));
  return row ? { ...row } : null;
}

async function createShipment(instrument, value, hex) {
  const now = new Date().toISOString();
  const row = {
    id: state.nextId++,
    instrument_number: instrument.number,
    instrument_name: instrument.name,
    value,
    min: instrument.min,
    max: instrument.max,
    arinc429: hex,
    serial_status: 'no_enviado',
    created_at: now,
    updated_at: now
  };
  state.envios.push(row);
  await queueSave();
  return { ...row };
}

async function updateShipment(id, instrument, value, hex) {
  const row = state.envios.find((item) => item.id === Number(id));
  if (!row) return null;
  Object.assign(row, {
    instrument_number: instrument.number,
    instrument_name: instrument.name,
    value,
    min: instrument.min,
    max: instrument.max,
    arinc429: hex,
    serial_status: 'no_enviado',
    updated_at: new Date().toISOString()
  });
  await queueSave();
  return { ...row };
}

async function deleteShipment(id) {
  const index = state.envios.findIndex((item) => item.id === Number(id));
  if (index < 0) return false;
  state.envios.splice(index, 1);
  await queueSave();
  return true;
}

async function updateShipmentStatus(id, status) {
  const row = state.envios.find((item) => item.id === Number(id));
  if (!row) return null;
  row.serial_status = status;
  row.updated_at = new Date().toISOString();
  await queueSave();
  return { ...row };
}

module.exports = {
  addInstrument,
  createShipment,
  deleteShipment,
  getShipment,
  initializeStorage,
  listInstruments,
  listShipments,
  updateShipment,
  updateShipmentStatus
};
