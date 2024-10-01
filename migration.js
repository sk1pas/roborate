require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error executing query', err.stack);
  } else {
    console.log('Database response:', res.rows);
  }
});

pool.query(`
  CREATE TABLE rates (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rate NUMERIC(15, 4) NOT NULL,
    pair VARCHAR(255) NOT NULL,
    resource VARCHAR(255)
);
  `, (err, res) => {
  if (err) {
    console.error('Error executing query', err.stack);
  } else {
    console.log('Database response:', res.rows);
  }
});


pool.end();

// process.on('exit', async () => {
//   await pool.end();
//   console.log('Pool has ended');
// });
