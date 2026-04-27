const TableRequest = require("../../models/TableRequest");

const TABLE  = "article";
const COLUMNS = ["id","nom"];

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
async function get(req) {
    const request = new TableRequest();
    const page = parseInt(req.query.page  || 1);
    const limit = parseInt(req.query.limit || 20);
    const fields = req.query.fields?.split(",")  || ["*"];
    const filters = req.query.filters
        ? req.query.filters.split("|").map(f => f.split(","))
        : [];
    const orderBy = req.query.orderBy  ?? null;
    const orderDir = req.query.orderDir ?? "ASC";

    return request.getList({ table: TABLE, fields, filters, orderBy, orderDir });
}

/**
 * GET one row by id
 */
async function getById(req) {
    const request = new TableRequest();
    const id = req.params.id;
    const fields = req.query.fields?.split(",") || ["*"];

    return request.getSpecific({ table: TABLE, id, fields });
}

/**
 * COUNT rows matching filters
 */
async function count(req) {
    const request = new TableRequest();
    const filters = req.query.filters
        ? req.query.filters.split("|").map(f => f.split(","))
        : [];

    return request.getCount({ table: TABLE, filters });
}

/**
 * CREATE a new row
 */
async function create(req) {
    validateBody(req.body);
    const request = new TableRequest();

    return request.postData({ table: TABLE, body: req.body });
}

/**
 * UPDATE a row by id
 */
async function update(req) {
    validateBody(req.body);
    const request = new TableRequest();
    const id = req.params.id;

    return request.putData({ table: TABLE, id, body: req.body });
}

/**
 * DELETE a row by id
 */
async function remove(req) {
    const request = new TableRequest();
    const id = req.params.id;

    return request.deleteData({ table: TABLE, id });
}

module.exports = { get, getById, count, create, update, remove };
