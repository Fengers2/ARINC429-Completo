const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeArinc429 } = require('../src/arinc');

test('genera palabra de 32 bits con paridad impar', () => {
  const result = encodeArinc429(0, { labelOctal: '014', encoding: 'BNR', lsb: 0.1, sdi: 0, ssm: 0 });
  assert.equal(result.bits.length, 32);
  assert.equal(result.hex.length, 10);
  assert.equal((result.word.toString(2).match(/1/g) || []).length % 2, 1);
  assert.equal(result.bytes.length, 4);
});

test('codifica signo y rechaza etiquetas/formato no compatibles', () => {
  const options = { labelOctal: '014', encoding: 'BNR', lsb: 1, sdi: 0, ssm: 0 };
  assert.notEqual(encodeArinc429(-3, options).word, encodeArinc429(3, options).word);
  assert.throws(() => encodeArinc429(1, { ...options, labelOctal: '999' }), /octal/);
  assert.throws(() => encodeArinc429(1, { ...options, encoding: 'BCD' }), /no implementada/);
});

test('el rango completo de la brújula de ejemplo cabe en el campo BNR', () => {
  const compass = { labelOctal: '014', encoding: 'BNR', lsb: 360 / 0x3ffff, sdi: 0, ssm: 0 };
  assert.doesNotThrow(() => encodeArinc429(360, compass));
});
