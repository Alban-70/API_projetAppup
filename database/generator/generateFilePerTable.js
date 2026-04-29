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

async function getTableMeta(table) {
  const result = await pool.query(
    `SELECT column_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_name = $1`,
    [table],
  );

  const columns = result.rows.map((r) => r.column_name);

  const requiredColumns = result.rows
    .filter((r) => r.is_nullable === "NO" && r.column_default === null)
    .map((r) => r.column_name);

  return {
    columns,
    requiredColumns,
  };
}

function buildFile(table, columns, requiredColumns) {
  return `const TableRequest = require("../../models/TableRequest");

const TABLE = "${table}";
const COLUMNS = ${JSON.stringify(columns)};
const REQUIRED_COLUMNS = ${JSON.stringify(requiredColumns)};
const HIDDEN_COLUMNS = ["password"];
const UPDATABLE_COLUMNS = COLUMNS.filter(c => c !== "id");

/**
 * Validate that body only contains known columns
 */
function validateBody(body, isUpdate = false) {
    const allowed = isUpdate ? UPDATABLE_COLUMNS : COLUMNS;

    const invalid = Object.keys(body).filter(k => !allowed.includes(k));
    if (invalid.length > 0)
        throw new Error("Invalid fields: " + invalid.join(", "));

    if (!isUpdate) {
        const missing = REQUIRED_COLUMNS.filter(k => !(k in body));
        if (missing.length > 0)
            throw new Error("Missing required fields: " + missing.join(", "));
    }
}

/**
 * Remove hidden fields
 */
function cleanOutput(data) {
    if (!data) return data;

    const rows = Array.isArray(data) ? data : [data];

    const cleaned = rows.map(row => {
        const copy = { ...row };
        HIDDEN_COLUMNS.forEach(col => delete copy[col]);
        return copy;
    });

    return Array.isArray(data) ? cleaned : cleaned[0];
}

/**
 * GET all rows
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

    const orderBy = query?.orderBy ?? null;
    const orderDir = query?.orderDir ?? "ASC";

    const result = await request.getList({
        table: TABLE,
        fields,
        filters,
        orderBy,
        orderDir
    });

    return {
        result: cleanOutput(result.result)
    };
}

/**
 * GET one row
 */
async function getOne({ query, params, body }) {
    const request = new TableRequest();
    const id = params?.id;

    const fields = !query?.fields
      ? ["*"]
      : Array.isArray(query.fields)
        ? query.fields
        : query.fields.split(",");

    const result = await request.getSpecific({
        table: TABLE,
        id,
        fields
    });

    return {
        result: cleanOutput(result.result)
    };
}

/**
 * COUNT rows
 */
async function count({ query, params, body }) {
    const request = new TableRequest();

    const filters = !query?.filters
      ? []
      : Array.isArray(query.filters)
        ? query.filters
        : query.filters.split("|").map(f => f.split(","));

    return request.getCount({
        table: TABLE,
        filters
    });
}

/**
 * CREATE
 */
async function create({ query, params, body }) {
    validateBody(body, false);

    const request = new TableRequest();

    const result = await request.postData({
        table: TABLE,
        body
    });

    return {
        result: cleanOutput(result.result)
    };
}

/**
 * UPDATE
 */
async function update({ query, params, body }) {
    validateBody(body, true);

    const request = new TableRequest();
    const id = params?.id;

    if (!id) throw new Error("Missing id");

    const result = await request.putData({
        table: TABLE,
        id,
        body
    });

    return {
        result: cleanOutput(result.result)
    };
}

/**
 * DELETE
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

module.exports = {
    get,
    getOne,
    count,
    create,
    update,
    remove
};
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

      if (fs.existsSync(filePath)) {
        continue;
      }

      const { columns, requiredColumns } = await getTableMeta(table);
      const newContent = buildFile(table, columns, requiredColumns);

      fs.writeFileSync(filePath, newContent, "utf-8");
      console.log(`Créé : ${fileName}`);
    }

    const tablesLower = tables.map((t) => t.toLowerCase());

    const obsoleteFiles = existingFiles.filter(
      (file) => !tablesLower.includes(file),
    );

    for (const file of obsoleteFiles) {
      fs.unlinkSync(path.join(outputDir, file + ".js"));
      console.log(`Supprimé : ${file}.js`);
    }
  } catch (err) {
    console.error("Generator error:", err);
  }
};
