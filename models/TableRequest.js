const pool = require("../database/db");
const AppError = require("../Error/AppError");

class TableRequest {
  /**
   * Parses the request to extract table name, id, fields, filters and body
   */
  constructor(req) {
    const parts = req.path.split("/").filter(Boolean);

    this.table = parts[0];
    this.id = parts[1] ?? null;

    if (this.id && isNaN(this.id))
      throw new AppError("1050", "Invalid id format");

    this.count = req.query.count === "true";
    this.fields = req.query.fields?.split(",") || ["*"];
    this.filters = req.query.filters
      ? req.query.filters
          .split("|")
          .map((f) => f.split(","))
      : [];

    this.body = req.body;
  }

  //#region Config
  /**
   * Fetches the website configuration from the database
   * @returns {Promise<Object>}
   */
  async #getWebsiteConfiguration() {
    const result = await pool.query(
      `SELECT fields_to_clean FROM configuration LIMIT 1`,
    );
    return result.rows[0];
  }

  /**
   * Removes sensitive fields from a list of users based on the configuration
   * @param {Object[]} users
   * @returns {Promise<Object[]>}
   */
  async deletedPasswordFromDatas(users) {
    const config = await this.#getWebsiteConfiguration();
    const fields_to_clean = config?.fields_to_clean || [];

    const newUsers = users.map((user) => {
      const cleaned = { ...user };

      // Delete each field listed in configuration
      fields_to_clean.forEach((field) => {
        delete cleaned[field];
      });

      return cleaned;
    });

    return newUsers;
  }
  //#endregion

  //#region DB Verification
  async #tableExists() {
    const result = await pool.query(
      `SELECT EXISTS (
				SELECT 1 FROM information_schema.tables
				WHERE table_name = $1
			)`,
      [this.table],
    );
    return result.rows[0].exists;
  }

  async #columnsExist(columns) {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
			WHERE table_name = $1;`,
      [this.table],
    );

    const existing_columns = result.rows.map((r) => r.column_name);
    const invalid_columns = columns.filter(
      (col) => !existing_columns.includes(col),
    );
    return invalid_columns;
  }

  async #getRequiredColumns() {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
			WHERE table_name = $1
			AND is_nullable = 'NO'
			AND column_default IS NULL;`,
      [this.table],
    );

    return result.rows.map((r) => r.column_name);
  }

  async #validate() {
    const tableExists = await this.#tableExists();
    if (!tableExists)
      throw new AppError("1060", `Table ${this.table} not found`);

    const fieldsToCheck = this.fields.filter((f) => f !== "*");
    // Extract only the column name (first element) from each filter group [col, op, val]
    const filtersCols = this.filters.map(([col]) => col);
    // Merge fields and filter columns into a single array, removing duplicates with Set
    const allCols = [...new Set([...fieldsToCheck, ...filtersCols])];

    if (allCols.length > 0) {
      const invalidCols = await this.#columnsExist(allCols);
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
  #getFields() {
    return this.fields.join(", ") || "*";
  }

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
  buildConditions() {
    const values = [];
    const conditions = [];

    for (const filter of this.filters) {
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
  async getList(isMe) {
    try {
      await this.#validate();

      let fields = this.#getFields();
      let query = `SELECT ${fields} FROM ${this.table}`;

      const { conditions, values } = this.buildConditions();

      if (conditions.length > 0) query += ` WHERE ${conditions.join(" AND ")}`;

      const result = await pool.query(query, values);

			let cleaned = result.rows;
			if (!isMe) {
      	cleaned = await this.deletedPasswordFromDatas(result.rows);
			}
			

      return {
        result: cleaned,
      };
    } catch (err) {
      throw new AppError("1200", err.message);
    }
  }

  /**
   * Returns a single row by id, with optional fields and filters
   * @returns {Promise<void>}
   */
  async getSpecific() {
    try {
      await this.#validate();

      const useHeader = this.headers?.authorization;

      let query = `SELECT ${this.#getFields()} FROM ${this.table}`;
      const values = [];

      if (this.id) {
        query += ` WHERE id = $1`;
        values.push(this.id);
      }

      else if (useHeader) {
        const email = this._extractEmailFromHeader?.(useHeader);

        if (!email) {
          throw new AppError("1050", "Invalid header authentication");
        }

        query += ` WHERE email = $1`;
        values.push(email);
      }

      else {
        throw new AppError("1050", "No id or valid header provided");
      }

      const { conditions, values: filterValues } = this.buildConditions();

      let offset = values.length;

      for (const condition of conditions) {
        offset++;
        query += ` AND ${condition.replace(/\$\d+/, `$${offset}`)}`;
      }

      values.push(...filterValues);

      const result = await pool.query(query, values);

      if (result.rows.length === 0) throw new AppError("1060", "Not found");

      const cleaned = !useHeader ? await this.deletedPasswordFromDatas(result.rows) : result;

      return {
        result: cleaned[0],
      };
    } catch (err) {
      throw new AppError("1200", err.message);
    }
  }

  /**
   * Returns the total count of rows matching the filters
   * @returns {Promise<void>}
   */
  async getCount() {
    try {
      await this.#validate();

      let query = `SELECT COUNT(*) FROM ${this.table}`;

      const { conditions, values } = this.buildConditions();

      if (conditions.length > 0) query += ` WHERE ${conditions.join(" AND ")}`;

      const result = await pool.query(query, values);

      return {
        result,
      };
    } catch (err) {
      throw new AppError("1200", err.message);
    }
  }
  //#endregion

  //#region POST Queries
  async #checkIfDatasAlreadyExist(fields) {
    const keys = Object.keys(fields);
    const values = Object.values(fields);

    const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(" AND ");

    const query = `SELECT EXISTS (SELECT 1 FROM ${this.table} WHERE ${conditions})`;
    const result = await pool.query(query, values);

    // True of false
    return result.rows[0].exists;
  }

  async postData() {
    try {
      await this.#validate();

      // Vérifier si les valeurs sont déja présentes

      const requiredColmuns = await this.#getRequiredColumns();
      const missingFields = requiredColmuns.filter(
        (col) => !(col in this.body),
      );

      if (missingFields.length > 0)
        throw new AppError(
          "1050",
          `Missing required fields : ${missingFields.join(", ")}`,
        );

      const alreadyExists = await this.#checkIfDatasAlreadyExist(this.body);
      if (alreadyExists) throw new AppError("1010", "Datas already exist");

      const keys = Object.keys(this.body);
      const values = Object.values(this.body);
      const indexes = keys.map((_, i) => `$${i + 1}`).join(", ");

      const query = `INSERT INTO ${this.table} (${keys.join(", ")}) VALUES (${indexes}) RETURNING *;`;

      const result = await pool.query(query, values);

      return {
        result: result.rows[0],
      };
    } catch (err) {
      throw new AppError("1200", err.message);
    }
  }
  //#endregion

  //#region PUT QUERIES

  //#endregion
}

module.exports = TableRequest;
