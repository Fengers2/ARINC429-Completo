// Catálogo inicial de ejemplo. La especificación de la brújula NO ha sido verificada.
// Confirme etiqueta, resolución, SDI, SSM y formato con el ICD del equipo antes de transmitir.
module.exports = [
  {
    number: 1,
    name: 'Brújula',
    unit: '°',
    min: 0,
    max: 360,
    labelOctal: '014',
    encoding: 'BNR',
    lsb: 360 / 0x3ffff,
    sdi: 0,
    ssm: 0,
    verified: false
  }
];
