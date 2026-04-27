const fs = require("node:fs");
const path = require("node:path");
const pool = require("../db");

async function getAllTables() {
  const result = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables
        WHERE table_schema = 'ecommerce'
    `);
  return result.rows.map((r) => r.table_name);
}

async function getTableColumns(table) {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table],
  );
  return result.rows.map((r) => r.column_name);
}

function buildFile(table, columns) {
  const colsArray = JSON.stringify(columns);
  return `const TableRequest = require("../../models/TableRequest");

const TABLE  = "${table}";
const COLUMNS = ${colsArray};

/**
 * Validate that body only contains known columns
 */
function validateBody(body) {
    const invalid = Object.keys(body).filter(k => !COLUMNS.includes(k));
    if (invalid.length > 0)
        throw new Error("Invalid fields: " + invalid.join(", "));
}

/**
 * GET all rows with optional pagination
 */
async function get({ query, params, body }) {
    const request = new TableRequest();
    const fields = !query?.fields
      ? ["*"]
      : Array.isArray(query.fields)
        ? query.fields
        : query.fields.split(",");
    const filters = !query?.filters
      ? []
      : Array.isArray(query.filters)
        ? query.filters
        : query.filters.split("|").map(f => f.split(","));
    const orderBy = query?.orderBy  ?? null;
    const orderDir = query?.orderDir ?? "ASC";

    return request.getList({ table: TABLE, fields, filters, orderBy, orderDir });
}

/**
 * GET one row by id
 */
async function getOne({ query, params, body }) {
    const request = new TableRequest();
    const id = params?.id;
    const fields = !query?.fields
      ? ["*"]
      : Array.isArray(query.fields)
        ? query.fields
        : query.fields.split(",");

    return request.getSpecific({ table: TABLE, id, fields });
}

/**
 * COUNT rows matching filters
 */
async function count({ query, params, body }) {
    const request = new TableRequest();
    const filters = !query?.filters
      ? []
      : Array.isArray(query.filters)
        ? query.filters
        : query.filters.split("|").map(f => f.split(","));

    return request.getCount({ table: TABLE, filters });
}

/**
 * CREATE a new row
 */
async function create({ query, params, body }) {
    validateBody(body);

    const request = new TableRequest();

    return request.postData({
        table: TABLE,
        body
    });
}

/**
 * UPDATE a row by id
 */
async function update({ query, params, body }) {
    validateBody(body);

    const request = new TableRequest();
    const id = params?.id;

    if (!id) throw new Error("Missing id");

    return request.putData({
        table: TABLE,
        id,
        body
    });
}

/**
 * DELETE a row by id
 */
async function remove({ query, params, body }) {
    const request = new TableRequest();
    const id = params?.id;

    if (!id) throw new Error("Missing id");

    return request.deleteData({
        table: TABLE,
        id
    });
}

module.exports = { get, getOne, count, create, update, remove };
`;
}

module.exports = async function generateFilePerTable() {
  try {
    const outputDir = path.join(__dirname, "../tables");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const tables = await getAllTables();

    if (tables.length === 0) {
      console.log("Aucune table trouvée — vérifie le schema");
      return;
    }

    const existingFiles = fs
      .readdirSync(outputDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => f.replace(".js", "").toLowerCase());

    for (const table of tables) {
      const fileName = table.toUpperCase() + ".js";
      const filePath = path.join(outputDir, fileName);

      const columns = await getTableColumns(table);
      const newContent = buildFile(table, columns);

      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, newContent, "utf-8");
        console.log(`Créé : ${fileName}`);
        continue;
      }
    }

    const tablesLower = tables.map((t) => t.toLowerCase());

    const obsoleteFiles = existingFiles.filter(
      (file) => !tablesLower.includes(file),
    );

    for (const file of obsoleteFiles) {
      fs.unlinkSync(path.join(outputDir, file + ".js"));
    }
  } catch (err) {
    console.error("Generator error:", err);
  }
};
