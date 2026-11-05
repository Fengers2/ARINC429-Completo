const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const tempDirectory = path.join(os.tmpdir(), `arinc429-storage-${process.pid}`);
process.env.DATA_FILE = path.join(tempDirectory, 'store.json');
const storage = require('../src/storage');

test('guarda instrumentos y realiza el CRUD de envíos de forma persistente', async () => {
  await fs.rm(tempDirectory, { recursive: true, force: true });
  await storage.initializeStorage();
  assert.equal(storage.listInstruments().length, 1);

  const instrument = {
    number: 12, name: 'Altímetro de prueba', unit: 'ft', min: -1000, max: 50000,
    labelOctal: '020', encoding: 'BNR', lsb: 1, sdi: 0, ssm: 0, verified: false
  };
  await storage.addInstrument(instrument);
  assert.equal(storage.listInstruments().length, 2);

  const created = await storage.createShipment(instrument, 1200, '0x12345678');
  assert.equal(created.min, -1000);
  assert.equal(created.max, 50000);
  assert.equal(storage.getShipment(created.id).value, 1200);

  const updated = await storage.updateShipment(created.id, instrument, 1300, '0x87654321');
  assert.equal(updated.value, 1300);
  assert.equal(updated.arinc429, '0x87654321');
  await storage.updateShipmentStatus(created.id, 'enviado');
  assert.equal(storage.getShipment(created.id).serial_status, 'enviado');

  assert.equal(await storage.deleteShipment(created.id), true);
  assert.equal(storage.getShipment(created.id), null);
  const saved = JSON.parse(await fs.readFile(process.env.DATA_FILE, 'utf8'));
  assert.equal(saved.instruments.length, 2);
  assert.equal(saved.envios.length, 0);
  await fs.rm(tempDirectory, { recursive: true, force: true });
});
