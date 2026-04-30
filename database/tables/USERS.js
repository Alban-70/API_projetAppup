const TableRequest = require("../../models/TableRequest");
const bcrypt = require("bcrypt");
const AppError = require("../../Error/AppError");

const TABLE = "users";
const COLUMNS = [
  "id",
  "uuid",
  "access_level",
  "email_verified",
  "created_dt",
  "changed_dt",
  "deleted",
  "gender",
  "first_name",
  "last_name",
  "email",
  "password",
  "phone_number",
];
const REQUIRED_COLUMNS = ["email", "password"];
const { HIDDEN_COLUMNS } = require("./CONFIGURATION");
const UPDATABLE_COLUMNS = COLUMNS.filter((c) => c !== "id");

// #region Helpers
/**
 * Get user by email (internal helper)
 *
 * @async
 * @param {String} email
 * @returns {Promise<{ result: Object[] }>}
 */
async function getUserByEmail(email) {
    const request = new TableRequest();
    const result = await request.getList({
      table: TABLE,
      fields: ["*"],
      filters: [["email", "eq", email]],
      orderBy: null,
      orderDir: "ASC",
    });
    return { result: result.result };
}


/**
 * Checks if the password meets security requirements
 *
 * @param {String} password
 * @returns {{ isGoodPassword: Boolean, message: String }}
 */
function checkGoodPassword(password) {
  let status = "";
  let message = "Good password";
  let isGoodPassword = true;

  const passwordRequirements = {
    requiredCharacters: ["@", "#", "!"],
    minLength: 8,
  };

  // Password must exist before validation
  if (!password) {
    status = "1050";
    message = "Password is missing!";
    isGoodPassword = false;
  }

  // Enforce minimum length for security reasons
  if (password.length < passwordRequirements.minLength) {
    status = "1020";
    message = "Password is too short, it must contain at least 8 characters!";
    isGoodPassword = false;
  }

  const hasRequiredCharacters = passwordRequirements.requiredCharacters.some(
    (char) => password.includes(char),
  );

  // Ensure password contains at least one required special character
  if (!hasRequiredCharacters) {
    status = "1020";
    message = "Password must contain at least one of these characters: @, #, !";
    isGoodPassword = false;
  }

  return {
    isGoodPassword,
    status,
    message,
  };
}


/**
 * Validates email format
 *
 * @param {String} email
 * @returns {{ isGoodEmail: Boolean, message: String }}
 */
function checkGoodEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  let status = "";
  let message = "Good email";
  let isGoodEmail = true;

  // Email is required for all authentication flows
  if (!email) {
    status = "1050";
    isGoodEmail = false;
    message = "Email is missing!";
  }

  // Prevent invalid email formats from entering the system
  if (!emailRegex.test(email)) {
    status = "1020";
    isGoodEmail = false;
    message = "Email is invalid!";
  }

  return {
    isGoodEmail,
    status,
    message,
  };
}
//#endregion


//#region Authentification
/**
 * Extract Basic Auth header
 */
function extractBasicAuth(req) {
  const authHeader = req.headers["authorization"];

  if (!authHeader)
    throw new AppError("1080", "No authorization header provided!");

  const [scheme, credentials] = authHeader.split(" ");

  if (scheme !== "Basic" || !credentials)
    throw new AppError("1020", "Invalid authorization format");

  const decoded = Buffer.from(credentials, "base64").toString("utf-8");
  const [email, password] = decoded.split(":");

  if (!email || !password) throw new AppError("1050", "Missing credentials");

  return { email, password };
}


/**
 * Retrieves the authenticated user from the Basic Auth header
 *
 * @async
 * @param {import("express").Request} req
 * @returns {Promise<{ result: Object, message: String }>}
 * @throws {AppError}
 */
async function getMe(req) {
  try {
    const { email, password } = extractBasicAuth(req);

    const result = await getUserByEmail(email);

    const user = result.result[0];
    if (!user) throw new AppError("1060", "User not found");

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) throw new AppError("1100", "Invalid credentials");

    const cleanedUsers = await deletedPasswordFromDatas([user]);

    return {
      result: cleanedUsers[0],
      message: "User fetched successfully",
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("1200", err.message);
  }
}
//#endregion


//#region Password flow
// /**
//  * Handles password reset using token verification
//  *
//  * @async
//  * @param {import("express").Request} req
//  * @returns {Promise<{ result: Object, message: String }>}
//  */
// async function verifyResetPassword(req) {
//   const { password } = req.body;
//   const { token } = req.query;
//   const { ip_address, user_agent } = getIpAddressAndUA(req);

//   let success = false;
//   let log = null;

//   try {
//     // Shared token validation logic
//     log = await validateTokenOrThrow(token);

//     // Hash new password securely before saving
//     const password_hash = await bcrypt.hash(password, 10);

//     // Update user password
//     const user = await update({
//       query: {
//         filters: [["email", "eq", log[0].user_email]],
//       },
//       body: {
//         email: log[0].user_email,
//         password: password_hash,
//       },
//     });

//     success = true;
//     return {
//       result: user.result,
//       message: "Password has been successfully reset",
//     };
//   } finally {
//     // Audit log for security tracking
//     await dispatch("login_logs", "create", {
//       body: {
//         ip_address,
//         user_agent,
//         success,
//         user_email: log ? log.user_email : null,
//         password_type: "reset_password",
//       },
//     });
//   }
// }

/**
 * Validate that body only contains known columns
 */
function validateBody(body, isUpdate = false) {
  const allowed = isUpdate ? UPDATABLE_COLUMNS : COLUMNS;

  const invalid = Object.keys(body).filter((k) => !allowed.includes(k));
  if (invalid.length > 0)
    throw new AppError("1040", "Invalid fields: " + invalid.join(", "));

  if (!isUpdate) {
    const missing = REQUIRED_COLUMNS.filter((k) => !(k in body));
    if (missing.length > 0)
      throw new AppError("1050", "Missing required fields: " + missing.join(", "));
  }
}

/**
 * Removes sensitive fields from a list of users based on the configuration
 * @param {Object[]} users
 * @returns {Promise<Object[]>}
 */
async function deletedPasswordFromDatas(users) {
  if (!users) return [];

  if (!Array.isArray(users)) users = [users];

  const newUsers = users.map((user) => {
    const cleaned = { ...user };

    // Delete each field listed in configuration
    HIDDEN_COLUMNS.forEach((field) => {
      delete cleaned[field];
    });

    return cleaned;
  });

  return newUsers;
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
      : query.filters.split("|").map((f) => f.split(","));

  const orderBy = query?.orderBy ?? null;
  const orderDir = query?.orderDir ?? "ASC";

  const result = await request.getList({
    table: TABLE,
    fields,
    filters,
    orderBy,
    orderDir,
  });

  const cleaned = await deletedPasswordFromDatas(result.result);

  return {
    result: cleaned,
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
    fields,
  });

  const cleaned = await deletedPasswordFromDatas(result.result);

  return {
    result: cleaned[0] ?? null,
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
      : query.filters.split("|").map((f) => f.split(","));

  return request.getCount({
    table: TABLE,
    filters,
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
    body,
  });

  const cleaned = await deletedPasswordFromDatas(result.result);

  return {
    result: cleaned,
  };
}

/**
 * UPDATE
 */
async function update({ query, params, body }) {
  validateBody(body, true);

  const request = new TableRequest();
  const id = params?.id ?? null;

  const filters = !query?.filters
    ? []
    : Array.isArray(query.filters)
      ? query.filters
      : query.filters.split("|").map((f) => f.split(","));

  const result = await request.putData({
    table: TABLE,
    id,
    filters,
    body,
  });

  const cleaned = await deletedPasswordFromDatas(result.result);

  return {
    result: cleaned,
  };
}

/**
 * DELETE
 */
async function remove({ query, params, body }) {
  const request = new TableRequest();
  const id = params?.id;

  if (!id) throw new AppError("1050", "Missing id");

  return request.deleteData({
    table: TABLE,
    id,
  });
}

module.exports = {
  get,
  getOne,
  count,
  create,
  update,
  remove,
  getMe,
  extractBasicAuth,
  deletedPasswordFromDatas,
  getUserByEmail,
  checkGoodEmail,
  checkGoodPassword
};
