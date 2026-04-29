const TableRequest = require("../../models/TableRequest");
const requestIp = require("request-ip");
const crypto = require("crypto");
const { dispatch } = require("../../services/dispatcher");


const TABLE = "login_logs";
const COLUMNS = ["id","success","created_dt","changed_dt","deleted","user_email","ip_address","user_agent","token","password_type"];
const REQUIRED_COLUMNS = [];
const UPDATABLE_COLUMNS = COLUMNS.filter(c => c !== "id");

const ACCESS_LEVEL_AFTER_VERIFY_EMAIL = 10;


// #region Log Queries (Presets)

/**
 * Predefined log query templates used for analytics and security tracking
 */
const LOG_QUERIES = {
  /**
   * Count failed login attempts in last 15 minutes
   * @param {String} email
   */
  loginAttempts(email) {
    return {
      filters: [
        ["user_email", "eq", email],
        ["password_type", "eq", "login"],
        ["success", "eq", "false"],
      ],
      timeWindowMs: 15 * 60 * 1000,
    };
  },

  /**
   * Count successful password reset requests in last 24 hours
   * @param {String} email
   */
  resetPassword(email) {
    return {
      filters: [
        ["user_email", "eq", email],
        ["password_type", "eq", "reset_password"],
        ["success", "eq", "true"],
      ],
      timeWindowMs: 24 * 60 * 60 * 1000,
    };
  },
};
//#endregion

//#region Helpers
/**
 * Generates a random 2FA code padded to the specified length
 * @param {Number} lengthCode - The desired length of the code
 * @returns {String} - The generated code
 */
function generateA2FCode(lengthCode) {
  const code = crypto.randomInt(0, 10000);
  return code.toString().padStart(lengthCode, "0");
}


/**
 * Extracts IP address and User-Agent from request
 * @param {import("express").Request} req
 * @returns {{ ip_address: String, user_agent: String }}
 */
function getIpAddressAndUA(req) {
  return {
    ip_address: requestIp.getClientIp(req),
    user_agent: req.get("User-Agent"),
  };
}
//#endregion

//#region Password flow
/**
 * Validates a login token and returns the associated log entry.
 * Used for password reset flows.
 *
 * @async
 * @param {string} token
 * @returns {Promise<Object>}
 * @throws {Error}
 */
async function validateTokenOrThrow(token) {
  if (!token) {
    throw new AppError("1050", "Token is missing!");
  }

  // Fetch token record from database
  const log = await dispatch("login_logs", "get", {
    query: {
      fields: ["id", "user_email", "created_dt"],
      filters: [["token", "eq", token]],
    }
  });

  const logEntry = log.result[0];
  if (!logEntry) throw new AppError("1020", "Token is invalid!");

  // Check expiration (security constraint)
  const isExpired = new Date() > new Date(logEntry.expires_at);

  if (isExpired) throw new AppError("1030", "Token is expired!");

  return log.result;
}
//#endregion


// #region Email Verification
/**
 * Verifies user email using token (account activation flow)
 *
 * @async
 * @param {import("express").Request} req
 * @returns {Promise<{ result: Object, message: String }>}
 */
async function verifyEmail(req) {
  const { code } = req.query;
  const { ip_address, user_agent } = getIpAddressAndUA(req);

  let success = false;
  let authenticateCode = null;
  let mailUser = null;

  try {
    if (!code) {
      throw new AppError("1050", "Code is missing");
    }

    // Fetch code record from database
    const authenticateCodeResult = await dispatch("authenticate_codes", "get", {
      query: {
        filters: [["code", "eq", code]],
        isMe: false,
      }
    });
    authenticateCode = authenticateCodeResult.result[0] ?? null;
    if (!authenticateCode) {
      throw new AppError("1040", "Code is invalid!");
    }

    const isExpired = new Date() > new Date(authenticateCode.expires_at);
    if (isExpired) {
      throw new AppError("1030", "Code is expired!");
    }

    // Activate user account
    const user = await dispatch("users", "update", {
      params: {
        id: authenticateCode.user_id,
      },
      body: {
        email_verified: true,
        access_level: ACCESS_LEVEL_AFTER_VERIFY_EMAIL,
      },
      query: {
        isMe: true,
      },
    });

    mailUser = user.result.email;

    success = true;
    return {
      result: user.result,
      message: "Email verified successfully",
    };
  } finally {
    // Audit log for security tracking
    await dispatch("login_logs", "create", {
      body: {
        ip_address,
        user_agent,
        success,
        user_email: mailUser,
        password_type: "verify_email",
      },
    });
  }
}
//#endregion


// #region Log Counter
async function countLogs(query) {
  const filters = [...(query.filters || [])];

  if (query.timeWindowMs) {
    const dateLimit = new Date(Date.now() - query.timeWindowMs);
    filters.push(["created_dt", "gte", dateLimit]);
  }

  const data = await dispatch("login_logs", "count", {
    query: {
      fields: ["id"],
      filters,
    }
  });

  return data.result.rows[0].count;
}

async function countLoginAttemptsEvery15min(email) {
  return countLogs(LOG_QUERIES.loginAttempts(email));
}

async function countDailyResetPassword(email) {
  return countLogs(LOG_QUERIES.resetPassword(email));
}
//#endregion



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
        result: result.result
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
        result: result.result
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
        result: result.result
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
        result: result.result
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
  remove,
  getIpAddressAndUA,
  countDailyResetPassword,
  countLoginAttemptsEvery15min,
  validateTokenOrThrow,
  generateA2FCode,
  LOG_QUERIES,
};
