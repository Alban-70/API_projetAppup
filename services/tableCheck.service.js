const pool = require("../database/db");

let cachedTables = null;
let lastRefresh = 0;

const CACHE_TTL = 60 * 1000; // 1 minute

async function fetchTables() {
  const result = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables
    WHERE table_schema = 'ecommerce'
  `);

  return result.rows.map((r) => r.table_name.toLowerCase());
}

async function getAllowedTables() {
  const now = Date.now();

  if (cachedTables && now - lastRefresh < CACHE_TTL) {
    return cachedTables;
  }

  cachedTables = await fetchTables();
  lastRefresh = now;

  return cachedTables;
}

async function isTableAllowed(table) {
  if (!table) return false;

  const tables = await getAllowedTables();
  return tables.includes(table.toLowerCase());
}

module.exports = {
  getAllowedTables,
  isTableAllowed,
};
