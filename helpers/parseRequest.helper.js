function parseRequest(req) {
  return {
    table: req.params.table_name,
    id: req.params.id ?? null,
    fields: req.query.fields?.split(",") || ["*"],
    filters: req.query.filters
      ? req.query.filters.split("|").map((f) => f.split(","))
      : [],
    orderBy: req.query.orderBy ?? null,
    orderDir: req.query.orderDir ?? "ASC",
    body: req.body,
  };
}

module.exports = parseRequest;
