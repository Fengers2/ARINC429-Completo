const { SerialPort } = require('serialport');

async function transmit(bytes) {
  if (process.env.SERIAL_ENABLED !== 'true') {
    return { status: 'no_enviado', message: 'Transmisión desactivada; configure y habilite el adaptador.' };
  }
  const path = process.env.SERIAL_PORT;
  if (!path) throw new Error('Defina SERIAL_PORT para usar el adaptador serial.');
  const baudRate = Number(process.env.SERIAL_BAUD_RATE || 100000);
  const port = new SerialPort({ path, baudRate, autoOpen: false });

  await new Promise((resolve, reject) => port.open((error) => error ? reject(error) : resolve()));
  try {
    await new Promise((resolve, reject) => port.write(bytes, (error) => error ? reject(error) : port.drain((drainError) => drainError ? reject(drainError) : resolve())));
    return { status: 'enviado', message: `Palabra escrita en ${path}.` };
  } finally {
    await new Promise((resolve) => port.close(() => resolve()));
  }
}

module.exports = { transmit };
