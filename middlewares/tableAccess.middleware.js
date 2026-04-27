const AppError = require("../Error/AppError");
const { isTableAllowed } = require("../services/tableCheck.service");

async function tableAccessMiddleware(req, res, next) {
  try {
    const table = req.params.table_name;

    const allowed = await isTableAllowed(table);

    if (!allowed) {
      throw new AppError("1300", "Table not allowed");
    }

    next();
  } catch (err) {
    res.status(403).json({
      status: "error",
      message: err.message,
    });
  }
}

module.exports = tableAccessMiddleware;
