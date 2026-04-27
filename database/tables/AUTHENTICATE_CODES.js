const TableRequest = require("../../models/TableRequest");

const TABLE  = "authenticate_codes";
const COLUMNS = ["id","uuid","code","expires_at","created_dt","changed_dt","deleted","user_id"];

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
