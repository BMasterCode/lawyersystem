// db/init.js
// Ejecuta schema.sql contra la base de datos indicada en DATABASE_URL.
// Uso: npm run db:init

const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function init() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Esquema creado correctamente.');
  } catch (err) {
    console.error('Error al crear el esquema:', err.message);
  } finally {
    await pool.end();
  }
}

init();
