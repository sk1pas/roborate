module.exports = function () {
  const sqlite3 = require('sqlite3').verbose();

  const db = new sqlite3.Database('database.sqlite', (err) => {
    if (err)
      throw new Error(`Error opening database: ${err.message}`);
  });

  const tableName = 'rates';

  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, row) => {
    if (err)
      throw new Error(`Error querying the database: ${err.message}`);

    if (row)
      return true;

    db.run(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        rate NUMERIC(15, 4) NOT NULL,
        pair VARCHAR(255) NOT NULL,
        resource VARCHAR(255)
      );
      `, (err) => {
        if (err)
          throw new Error(`Error creating table: ${err.message}`);

        console.log(`Table "${tableName}" was created.`);
      }
    );
  });

  db.close((err) => {
    if (err)
      throw new Error(`Error closing database: ${err.message}`);
  });

  return true;
};
