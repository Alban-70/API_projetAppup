const pool = require("../database/db");
const AppError = require("../Error/AppError");

class TableRequest {

  //#region Config
  /**
   * Fetches the website configuration from the database
   * @returns {Promise<Object>}
   */
  async getWebsiteConfiguration() {
    const result = await pool.query(`SELECT * FROM configuration LIMIT 1`);
    return result.rows[0];
  }

  
  //#endregion

  //#region DB Verification
  async #tableExists(table) {
    const result = await pool.query(
      `SELECT EXISTS (
				SELECT 1 FROM information_schema.tables
				WHERE table_name = $1
			)`,
      [table],
    );
    return result.rows[0].exists;
  }

  async #columnsExist(table, columns) {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
			WHERE table_name = $1;`,
      [table],
    );

    const existing_columns = result.rows.map((r) => r.column_name);
    const invalid_columns = columns.filter(
      (col) => !existing_columns.includes(col),
    );
    return invalid_columns;
  }

  async #getRequiredColumns(table) {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
			WHERE table_name = $1
			AND is_nullable = 'NO'
			AND column_default IS NULL;`,
      [table],
    );

    return result.rows.map((r) => r.column_name);
  }

  async #validate(table, fields = [], filters = []) {
    const tableExists = await this.#tableExists(table);
    if (!tableExists)
      throw new AppError("1060", `Table ${table} not found`);

    // Extract only the column name (first element) from each filter group [col, op, val]
    const filtersCols = filters.map(([col]) => col);

    const fieldsToCheck = fields.filter((f) => f !== "*");

    // Merge fields and filter columns into a single array, removing duplicates with Set
    const allCols = [...new Set([...fieldsToCheck, ...filtersCols])];

    if (allCols.length > 0) {
      const invalidCols = await this.#columnsExist(table, allCols);
      if (invalidCols.length > 0) {
        throw new AppError(
          "1040",
          `Invalid columns : ${invalidCols.join(", ")}`,
        );
      }
    }
  }
  //#endregion

  //#region Operators
  /**
   * Converts a shorthand operator key to its SQL equivalent
   * @param {String} operatorType
   * @returns {String|null}
   */
  #toSqlOperator(operatorType) {
    const operators = {
      eq: "=",
      neq: "!=",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
      like: "LIKE",
      nlike: "NOT LIKE",
      in: "IN",
      nin: "NOT IN",
      null: "IS NULL",
      nnull: "IS NOT NULL",
    };

    return operators[operatorType] ?? null;
  }

  /**
   * Builds SQL WHERE conditions and values from the filters array
   * @returns {{ conditions: String[], values: any[] }}
   */
  buildConditions(filters = []) {
    const values = [];
    const conditions = [];

    for (const filter of filters) {
      const [col, op, val] = filter;
      const operator = this.#toSqlOperator(op);

      if (!operator) throw new AppError("1060", `Operator ${op} not found`);

      if (op === "null" || op === "nnull") {
        conditions.push(`${col} ${operator}`);
      } else {
        values.push(val);
        conditions.push(`${col} ${operator} $${values.length}`);
      }
    }

    return { conditions, values };
  }
  //#endregion

  //#region GET Queries
  /**
   * Returns all rows from the table, with optional fields and filters
   * @returns {Promise<void>}
   */
  async getList({
    table,
    fields = ["*"],
    filters = [],
    orderBy = null,
    orderDir = "ASC",
    isMe = false,
  } = {}) {
    try {
      await this.#validate(table, fields, filters);

      const fieldStr = fields.join(", ") || "*";
      let query = `SELECT ${fieldStr} FROM ${table}`;

      const { conditions, values } = this.buildConditions(filters);

      if (conditions.length > 0) query += ` WHERE ${conditions.join(" AND ")}`;

      if (orderBy) query += ` ORDER BY ${orderBy} ${orderDir}`;

      const result = await pool.query(query, values);

      let cleaned = result.rows;

      return {
        result: cleaned,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("1200", err.message);
    }
  }

  /**
   * Returns a single row by id, with optional fields and filters
   * @returns {Promise<void>}
   */
  async getSpecific({ table, id, fields = ["*"], filters = [], orderBy = null, orderDir = "ASC", isMe = false } = {}) {
    try {
      await this.#validate(table, fields, filters);

      if (id && isNaN(id))
        throw new AppError("1050", "Invalid id format");

      const fieldStr = fields.join(", ") || "*";
      let query = `SELECT ${fieldStr} FROM ${table}`;
      const values = [];


      if (id) {
        query += ` WHERE id = $1`;
        values.push(id);
      } else {
        throw new AppError("1050", "No id provided");
      }

      const { conditions, values: filterValues } = this.buildConditions(filters);

      let offset = values.length;

      for (const condition of conditions) {
        offset++;
        query += ` AND ${condition.replace(/\$\d+/, `$${offset}`)}`;
      }

      values.push(...filterValues);

      if (orderBy) query += ` ORDER BY ${orderBy} ${orderDir}`;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) throw new AppError("1060", "Not found");

      return {
        result: result.rows[0],
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("1200", err.message);
    }
  }

  /**
   * Returns the total count of rows matching the filters
   * @returns {Promise<void>}
   */
  async getCount({ table, fields = ["*"], filters = [] } = {}) {
    try {
      await this.#validate(table, [], filters);

      let query = `SELECT COUNT(${fields}) FROM ${table}`;

      const { conditions, values } = this.buildConditions(filters);

      if (conditions.length > 0) query += ` WHERE ${conditions.join(" AND ")}`;

      const result = await pool.query(query, values);

      return {
        result,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("1200", err.message);
    }
  }
  //#endregion

  //#region POST Queries
  async #checkIfDatasAlreadyExist(table, body) {
    const keys = Object.keys(body);
    const values = Object.values(body);

    const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(" AND ");

    const query = `SELECT EXISTS (SELECT 1 FROM ${table} WHERE ${conditions})`;
    const result = await pool.query(query, values);

    // True of false
    return result.rows[0].exists;
  }

  async postData({ table, body = {} } = {}) {
    try {
      await this.#validate(table, [], []);

      // Vérifier si les valeurs sont déja présentes

      const requiredColmuns = await this.#getRequiredColumns(table);
      const missingFields = requiredColmuns.filter(
        (col) => !(col in body),
      );

      if (missingFields.length > 0)
        throw new AppError(
          "1050",
          `Missing required fields : ${missingFields.join(", ")}`,
        );

      const alreadyExists = await this.#checkIfDatasAlreadyExist(table, body);
      if (alreadyExists) throw new AppError("1010", "Datas already exist");

      const keys = Object.keys(body);
      const values = Object.values(body);
      const indexes = keys.map((_, i) => `$${i + 1}`).join(", ");

      const query = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${indexes}) RETURNING *;`;

      const result = await pool.query(query, values);

      return {
        result: result.rows[0],
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("1200", err.message);
    }
  }
  //#endregion

  //#region PUT QUERIES
  async putData({ table, id, filters = [], body = {}, isMe = false } = {}) {
  try {
    await this.#validate(table, [], filters);

    if (!id && filters.length === 0)
      throw new AppError("1050", "No id or filters provided");

    const keys = Object.keys(body);
    const values = Object.values(body);

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");

    let query = `UPDATE ${table} SET ${setClause}`;

    // CAS 1 : UPDATE par ID
    if (id) {
      query += ` WHERE id = $${values.length + 1}`;
      values.push(id);
    }

    // CAS 2 : UPDATE par filters
    else if (filters.length > 0) {
      const { conditions, values: filterValues } = this.buildConditions(filters);

      query += ` WHERE ${conditions.join(" AND ")}`;
      values.push(...filterValues);
    }

    query += ` RETURNING *;`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0)
      throw new AppError("1060", "Not found");

    return {
      result: result.rows[0],
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("1200", err.message);
  }
}
  //#endregion
}

module.exports = TableRequest;
