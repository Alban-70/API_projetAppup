const pool = require("../database/db");
const { v4: uuidv4 } = require("uuid");

class TableBuilder {
  constructor(table) {
    this.table = table;
    this.requestType = "SELECT";
    this.selectedFields = "*";
    this.countField = "*";
    this.returningFields = "*";
    this.rawConditions = [];
    this.andConditions = [];
    this.orConditions = [];
    this.orderByColumn = [];
    this.limitRange = 10;
    this.offsetRange = 0;
    this.parameters = [];
    this.insertData = {};
    this.updateData = {};
  }

  select(fields) {
    this.requestType = "SELECT";
    if (Array.isArray(fields)) {
      this.selectedFields = fields.map((f) => `"${f}"`).join(", ");
    } else {
      this.selectedFields = fields;
    }
    return this;
  }

  count(field = "*") {
    this.requestType = "COUNT";
    this.countField = field;
    return this;
  }

  insert(data) {
    this.requestType = "INSERT";
    this.insertData = data;
    return this;
  }

  update(data) {
    this.requestType = "UPDATE";
    this.updateData = data;
    return this;
  }

  where(column, operator = "=", value) {
    this.andConditions.push({ column, operator, value });
    return this;
  }

  whereRaw(clause) {
    this.rawConditions = this.rawConditions || [];
    this.rawConditions.push(clause);
    return this;
  }

  orWhere(column, operator = "=", value) {
    this.orConditions.push({ column, operator, value });
    return this;
  }

  buildWhereClause(startIndex = 1) {
    let clauses = [];
    let params = [];
    let index = startIndex;

    this.andConditions.forEach((cond) => {
      clauses.push(`${cond.column} ${cond.operator} $${index++}`);
      params.push(cond.value);
    });

    if (this.rawConditions?.length) {
      this.rawConditions.forEach(raw => clauses.push(raw));
    }

    if (this.orConditions.length) {
      let orParts = [];

      this.orConditions.forEach((cond) => {
        orParts.push(`${cond.column} ${cond.operator} $${index++}`);
        params.push(cond.value);
      });

      clauses.push(`(${orParts.join(" OR ")})`);
    }

    return {
      clause: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
      params,
      nextIndex: index,
    };
  }

  orderBy(columnName, orderAttr = "ASC") {
    this.orderByColumn.push(`${columnName} ${orderAttr}`);
    return this;
  }

  limit(limitR) {
    this.limitRange = parseInt(limitR, 10) || 10;
    return this;
  }

  offset(offsetR) {
    this.offsetRange = parseInt(offsetR, 10) || 0;
    return this;
  }

  returning(fields = "*") {
    this.returningFields = fields;
    return this;
  }
// ========================================================= Vérifier si le mail est validé, si non alors ne pas laisser continuer
  build() {
    let query = "";
    switch (this.requestType) {
      case "SELECT":
        query = `SELECT ${this.selectedFields} FROM ${this.table}`;

        const whereData = this.buildWhereClause(1);

        query += whereData.clause;

        if (this.orderByColumn.length)
          query += ` ORDER BY ${this.orderByColumn.join(", ")}`;

        query += ` LIMIT ${this.limitRange} OFFSET ${this.offsetRange}`;

        this.parameters = whereData.params;
        break;

      case "COUNT":
        query = `SELECT COUNT(${this.countField || "*"}) FROM ${this.table}`;

        const whereDataCount = this.buildWhereClause(1);

        query += whereDataCount.clause;

        this.parameters = whereDataCount.params;

        break;

      case "INSERT":
        const columns = Object.keys(this.insertData);
        const values = Object.values(this.insertData);

        const placeholders = values.map((_, i) => `$${i + 1}`);

        query = `INSERT INTO ${this.table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`;

        query += ` RETURNING ${this.returningFields || "*"}`;

        this.parameters = values;
        break;

      case "UPDATE":
        const setColumns = Object.keys(this.updateData);
        const setValues = Object.values(this.updateData);

        if (!setColumns.length) {
          throw new Error("UPDATE without datas");
        }

        const setClause = setColumns.map((col, i) => `${col} = $${i + 1}`);

        query = `UPDATE ${this.table} SET ${setClause.join(", ")}`;

        const whereDataUpdate = this.buildWhereClause(setValues.length + 1);

        if (!whereDataUpdate.clause) {
          throw new Error("UPDATE without WHERE forbidden");
        }

        query += whereDataUpdate.clause;
        query += ` RETURNING ${this.returningFields || "*"}`;

        this.parameters = [...setValues, ...whereDataUpdate.params];
        break;
    }
    const result = { query, parameters: this.parameters };

    // Reset
    this.andConditions = [];
    this.orConditions = [];
    this.parameters = [];
    this.insertData = {};
    this.updateData = {};

    return result;
  }

  async execute() {
    const { query, parameters } = this.build();
    const result = await pool.query(query, parameters);
    return result.rows;
  }

  async executeOne() {
    const rows = await this.execute();
    return rows[0];
  }

  async executeCount() {
    const { query, parameters } = this.build();
    const result = await pool.query(query, parameters);
    return parseInt(result.rows[0].count, 10);
  }
}


//#region WebsiteConfiguration
// =============================== SELECT ===============================

/**
 * @returns {Promise<Object|undefined>} - The website configuration
 */
const getWebsiteConfiguration = () =>
  new TableBuilder("configuration").select("*").limit(1).executeOne();
//#endregion

//#region Users
// =============================== SELECT ===============================

/**
 * Gets all users from the database
 * @returns {Promise<Array>} - The list of users
 */
const getUsers = (fields) => {
  new TableBuilder("users")
    .select(fields)
    .execute();
} 
// Ajouter les fields dans les paramètres

/**
 * Finds a user by email in the database
 * @param {String} email - The email to search for
 * @returns {Promise<Object|undefined>} - The user found or undefined
 */
const findUserByEmail = (email) => {
  new TableBuilder("users")
    .select("id")
    .where("email", "=", email)
    .executeOne();
}

/**
 * Finds a user by id in the database
 * @param {Number} id - The id to search for
 * @returns {Promise<Object|undefined>} - The user found or undefined
 */
const findUserById = (id) => {
  new TableBuilder("users")
    .select("id")
    .where("id", "=", id)
    .executeOne();
}

// =============================== INSERT ===============================
/**
 * Creates a new user in the database
 * @param {{ email: String, password: String }} user - The user data
 * @returns {Promise<Object|undefined>} - The created user id
 */
const createUser = ({ email, password }) => {
  new TableBuilder("users")
    .insert({ uuid: uuidv4(), email, password, created_dt: "NOW()", changed_dt: "NOW()" })
    .returning("id")
    .executeOne();
}

// =============================== UPDATE ===============================

/**
 * Resets the password of a user
 * @param {{ email: String, password: String }} user - The user data
 * @returns {Promise<Object|undefined>} - The updated user
 */
const resetPassword = ({ email, password }) => {
  new TableBuilder("users")
    .update({ password })
    .where("email", "=", email)
    .returning("id")
    .executeOne();
}

/**
 * Sets the email_verified field of a user to true
 * @param {Int} user_id - The id of the user to verify
 * @returns {Promise<Object>} - The updated user
 */
const verifyUserEmail = (user_id) => {
  new TableBuilder("users")
    .update({ email_verified: true })
    .where("id", "=", user_id)
    .returning("email_verified")
    .executeOne();
}
//#endregion

//#region LoginLogs
// =============================== SELECT ===============================

/**
 * Finds a login log by token in the database
 * @param {String} token - The token to search for
 * @returns {Promise<Object|undefined>} - The log found or undefined
 */
const findLoginLogByToken = (token) => {
  new TableBuilder("login_logs")
    .select({ id, user_email, created_dt })
    .where("token", "=", token)
    .execute();
}

// ============================ SELECT COUNT ============================

/**
 * Counts the number of failed login attempts in the last 15 minutes
 * @param {String} user_email - The email of the user
 * @returns {Promise<Number>} - The number of failed login attempts
 */
const countLoginAttemptsEvery15min = (user_email) => {
  new TableBuilder("login_logs")
    .count("id")
    .where("user_email", "=", user_email)
    .whereRaw("password_type = 'login'")
    .whereRaw("success = false")
    .whereRaw("created_dt >= NOW() - INTERVAL '15 minutes'")
    .executeCount();
};

/**
 * Counts the number of password resets in the last 24 hours
 * @param {String} user_email - The email of the user
 * @returns {Promise<Number>} - The number of password resets
 */
const countDailyResetPassword = (user_email) => {
  new TableBuilder("login_logs")
    .count("id")
    .where("user_email", "=", user_email)
    .whereRaw("password_type = 'reset_password'")
    .whereRaw("success = true")
    .whereRaw("created_dt >= NOW() - INTERVAL '24 hours'")
    .executeCount();
};

// =============================== INSERT ===============================

/**
 * Creates a login log entry in the database
 * @param {{ ip_address: String, user_agent: String, success: Boolean, user_email: String, password_type: String }} logs - The log data
 * @returns {Promise<Object>} - The created log entry
 */
const createLoginLogs = ({
  ip_address,
  user_agent,
  success,
  token,
  user_email,
  password_type,
}) => {
  return UserModel.queryOne(
    `INSERT INTO login_logs (ip_address, user_agent, success, token, user_email, password_type) VALUES
        ($1, $2, $3, $4, $5, $6)
        RETURNING *;`,
    [ip_address, user_agent, success, token ?? null, user_email, password_type],
  );
};
//#endregion

//#region AuthenticateCodes
// =============================== SELECT ===============================

/**
 * Finds a 2FA code by code in the database
 * @param {String} code - The code to search for
 * @returns {Promise<Object|undefined>} - The code found or undefined
 */
const findA2FCodeByCode = (code) => {
  return UserModel.queryOne(
    "SELECT * FROM authenticate_codes WHERE code = $1;",
    [code],
  );
};

/**
 * Finds the latest 2FA code by user id in the database
 * @param {Number} user_id - The id of the user
 * @returns {Promise<Object|undefined>} - The code found or undefined
 */
const findA2FCodeByUserId = (user_id) => {
  return UserModel.queryOne(
    `SELECT * FROM authenticate_codes WHERE user_id = $1
        ORDER BY created_dt DESC;`,
    [user_id],
  );
};

// ============================ SELECT COUNT ============================

/**
 * Counts the number of 2FA codes for a user
 * @param {Number} user_id - The id of the user
 * @returns {Promise<Number>} - The number of 2FA codes
 */
const countA2FCodeByUserId = (user_id) => {
  return UserModel.queryCount(
    `SELECT COUNT(*) FROM authenticate_codes WHERE user_id = $1
        GROUP BY user_id;`,
    [user_id],
  );
};

// =============================== INSERT ===============================

/**
 * Creates a 2FA authentication code in the database
 * @param {{ user_id: Number, code: String, expires_at: Date }} data - The code data
 * @returns {Promise<Object|undefined>} - The created code entry
 */
const createAuthenticateCodes = ({ user_id, code, expires_at }) => {
  return UserModel.queryOne(
    `INSERT INTO authenticate_codes (uuid, user_id, code, expires_at, created_dt, changed_dt) VALUES
        ($1, $2, $3, $4, NOW(), NOW())
        RETURNING *;`,
    [uuidv4(), user_id, code, expires_at],
  );
};
//#endregion

module.exports = {
  getWebsiteConfiguration,

  createUser,
  resetPassword,
  countLoginAttemptsEvery15min,
  getUsers,
  findUserByEmail,
  findUserById,
  verifyUserEmail,

  createLoginLogs,
  findLoginLogByToken,
  countDailyResetPassword,

  createAuthenticateCodes,
  findA2FCodeByCode,
  findA2FCodeByUserId,
  countA2FCodeByUserId,
};
