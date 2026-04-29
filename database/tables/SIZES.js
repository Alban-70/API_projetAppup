const TableRequest = require("../../models/TableRequest");

const TABLE = "sizes";
const COLUMNS = ["id","name"];
const REQUIRED_COLUMNS = [];
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
