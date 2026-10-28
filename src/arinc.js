function reverseBits(value, width) {
  let result = 0;
  for (let i = 0; i < width; i += 1) result = (result << 1) | ((value >> i) & 1);
  return result;
}

/** Codifica una palabra ARINC429 de 32 bits con paridad impar.
 * La resolución, etiqueta, SDI y SSM deben corresponder al ICD del instrumento.
 */
function encodeArinc429(value, instrument) {
  const label = Number.parseInt(instrument.labelOctal, 8);
  if (!Number.isInteger(label) || label < 0 || label > 0o377) {
    throw new Error('La etiqueta ARINC debe ser un valor octal de 000 a 377.');
  }
  if (instrument.encoding !== 'BNR') {
    throw new Error(`Codificación ${instrument.encoding} no implementada; solo se admite BNR.`);
  }
  if (!Number.isFinite(instrument.lsb) || instrument.lsb <= 0) {
    throw new Error('La resolución BNR (LSB) del instrumento debe ser positiva.');
  }

  const scaled = Math.round(value / instrument.lsb);
  const magnitude = Math.abs(scaled);
  if (magnitude > 0x3ffff) throw new Error('El valor excede el campo BNR de 18 bits.');

  // Bits 1-8 etiqueta (en orden transmitido inverso), 9-10 SDI,
  // 11-28 magnitud BNR, 29 signo, 30-31 SSM y 32 paridad impar.
  let word = reverseBits(label, 8);
  word |= (instrument.sdi & 0x3) << 8;
  word |= magnitude << 10;
  if (scaled < 0) word |= 1 << 28;
  word |= (instrument.ssm & 0x3) << 29;
  const parity = (word.toString(2).match(/1/g) || []).length % 2 === 0 ? 1 : 0;
  word = (word | (parity << 31)) >>> 0;

  return {
    word,
    hex: `0x${word.toString(16).toUpperCase().padStart(8, '0')}`,
    bits: word.toString(2).padStart(32, '0'),
    // ARINC transmite el bit 1 primero; adaptadores seriales pueden requerir otro framing.
    bytes: Buffer.from([word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff])
  };
}

module.exports = { encodeArinc429 };
