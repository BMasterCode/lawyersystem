// db/pool.js
// Conexion unica y reutilizable a PostgreSQL (sirve tanto para
// un PostgreSQL propio como para Supabase, porque ambos hablan
// el mismo protocolo: solo cambia la DATABASE_URL en tu .env)

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase (y muchos hosts) exigen SSL. En desarrollo local con
  // Postgres propio normalmente no hace falta, así que lo hacemos
  // condicional con una variable de entorno.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL', err);
});

module.exports = pool;
