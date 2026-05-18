const { Pool } = require('pg');
require('dotenv').config();

// Conexão com o Postgres.
// - Produção/Supabase: definir DATABASE_URL (connection string completa). SSL é
//   habilitado automaticamente para hosts gerenciados.
// - Local: usar as variáveis DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.
const connectionString = process.env.DATABASE_URL;

const useSsl =
  process.env.DB_SSL === 'true' ||
  (connectionString && /supabase\.(co|com)/.test(connectionString));

const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      }
);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
