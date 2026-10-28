const mysql = require('mysql2/promise');

const table = process.env.DB_TABLE || 'envios';
if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error('DB_TABLE solo puede contener letras, números y guion bajo.');
const qTable = `\`${table}\``;
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'Arinc_Engers',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

async function initializeDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ${qTable} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    \`numero del instrumento\` INT NOT NULL,
    \`nombre del instrumento\` VARCHAR(120) NOT NULL,
    \`valor\` DECIMAL(16,6) NOT NULL,
    arinc429 CHAR(10) NULL,
    serial_status VARCHAR(30) NOT NULL DEFAULT 'no_enviado',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [columns] = await pool.query(`SHOW COLUMNS FROM ${qTable}`);
  const existing = new Set(columns.map((column) => column.Field));
  const migrations = [
    ['id', `ALTER TABLE ${qTable} ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST`],
    ['arinc429', `ALTER TABLE ${qTable} ADD COLUMN arinc429 CHAR(10) NULL`],
    ['serial_status', `ALTER TABLE ${qTable} ADD COLUMN serial_status VARCHAR(30) NOT NULL DEFAULT 'no_enviado'`],
    ['created_at', `ALTER TABLE ${qTable} ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`],
    ['updated_at', `ALTER TABLE ${qTable} ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`]
  ];
  for (const [name, sql] of migrations) if (!existing.has(name)) await pool.query(sql);

  const required = ['numero del instrumento', 'nombre del instrumento', 'valor'];
  const absent = required.filter((name) => !existing.has(name));
  if (absent.length) throw new Error(`Faltan columnas requeridas en ${table}: ${absent.join(', ')}.`);
}

const columns = '`id`, `numero del instrumento` AS instrument_number, `nombre del instrumento` AS instrument_name, `valor` AS value, arinc429, serial_status, created_at, updated_at';
module.exports = { pool, initializeDatabase, qTable, columns };
