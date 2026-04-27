const path = require("path");
const fs = require("fs");
const AppError = require("../Error/AppError");

const TABLES_DIR = path.join(__dirname, "../database/tables");

/**
 * Load the generated file for a given table
 */
function loadTable(tableName) {
  const filePath = path.join(TABLES_DIR, tableName.toUpperCase() + ".js");

  if (!fs.existsSync(filePath))
    throw new Error(`No handler found for table: ${tableName}`);

  return require(filePath);
}

/**
 * Dispatch a request to the correct table handler
 */
async function dispatch(table, action, datas) {
  const handler = loadTable(table);

  if (!handler[action]) throw new AppError("1060", "Action not found");

  console.log(datas)

  console.log("gros log", {
    query: datas?.req?.query || datas?.query,
    params: datas?.req?.params || datas?.params,
    body: datas?.body || {},
  })

  return handler[action]({
    query: datas?.req?.query || datas?.query,
    params: datas?.req?.params || datas?.params,
    body: datas?.body || {},
  });
}

module.exports = { dispatch, loadTable };
