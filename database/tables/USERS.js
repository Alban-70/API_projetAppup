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


// /**
//  * Core authentication workflow handling:
//  * - user registration
//  * - password reset request
//  * - email sending
//  * - security logging
//  *
//  * @async
//  * @param {import("express").Request} req
//  * @param {{ isCreatingUser: Boolean, email_subject: String, email_content: Function }} datas
//  * @returns {Promise<{ result: Object, message: String }>}
//  * @throws {Error}
//  */
// async function processAccountSecurityFlow(req, datas) {
//   const { email, password, uuid, ...rest } = req.body;
//   const { isCreatingUser, email_subject, email_content } = datas;
//   const { ip_address, user_agent } = getIpAddressAndUA(req);

//   let success = false;

//   // Secure token used for email verification or password reset
//   let token = crypto.randomBytes(32).toString("hex");

//   let newUser = null;
//   let code = null;
//   let expires_at = null;
//   let existingUser = null;

//   try {
//     const config = await dispatch("configuration", "get", req);
//     if (!config) throw new AppError("1060", "Website config not found!");

//     const existingUserResult = await getUserByEmail(email);
//     existingUser = existingUserResult.result[0] ?? null;

//     // Prevent duplicate account creation
//     if (isCreatingUser && existingUser)
//       throw new AppError("1010", "User already exists!");

//     // Ensure user exists for password reset flow
//     if (!isCreatingUser && !existingUser)
//       throw new AppError("1060", "User not found!");

//     if (!isCreatingUser) {
//       const dailyCount = await countDailyResetPassword(email);
//       if (dailyCount >= DAILY_RESET_PASSWORD)
//         throw new AppError(
//           "1070",
//           "You have reached the maximum number of password reset requests for today. Please try again tomorrow.",
//         );
//     }

//     const emailCheck = checkGoodEmail(email);
//     if (!emailCheck.isGoodEmail)
//       throw new AppError(emailCheck.status, emailCheck.message);

//     expires_at = new Date(Date.now() + Number(process.env.TIME_TOKEN_EXPIRES));

//     if (isCreatingUser) {
//       const passwordCheck = checkGoodPassword(password);
//       if (!passwordCheck.isGoodPassword)
//         throw new AppError(passwordCheck.status, passwordCheck.message);

//       // Hash password before saving it to database
//       const password_hash = await bcrypt.hash(password, 10);

//       const newUserResult = await dispatch("users", "create", {
//         body: {
//           email,
//           password: password_hash,
//           access_level: ACCESS_LEVEL_BEFORE_VERIFY_EMAIL,
//           ...rest,
//         },
//       });
//       newUser = newUserResult.result[0];

//       if (!newUser) throw new AppError("1110", "User not created");

//       const lastCodeResult = await dispatch("authenticate_codes", "get", {
//         query: {
//           filters: [["user_id", "eq", newUser.id]],
//           orderBy: "created_dt",
//           orderDir: "DESC",
//           isMe: true,
//         },
//       });
//       const lastCode = lastCodeResult.result[0] ?? null;
//       if (lastCode) {
//         const secondesElapsed =
//           (Date.now() - new Date(lastCode.created_dt)) / 1000;
//         if (secondesElapsed < A2F_COOLDOWN_SECONDS) {
//           const remaining = Math.ceil(A2F_COOLDOWN_SECONDS - secondesElapsed);
//           throw new AppError(
//             "1090",
//             `Please wait ${remaining}s before requesting a new code.`,
//           );
//         }
//       }

//       code = generateA2FCode(config.two_factor_authenticator_length);

//       await dispatch("authenticate_codes", "create", {
//         body: {
//           user_id: newUser.id,
//           code,
//           expires_at,
//         },
//       });
//     }

//     // Send email depending on flow (register or reset password)
//     await sendEmail({
//       email: isCreatingUser ? newUser.email : email,
//       subject: email_subject,
//       content: email_content(isCreatingUser ? code : token),
//     });

//     // Remove sensitive data before returning the user object
//     const userCreated = await deletedPasswordFromDatas([newUser]);

//     success = true;
//     return {
//       result: userCreated,
//       message: isCreatingUser
//         ? "User created"
//         : "A password reset email has been sent",
//     };
//   } finally {
//     // Always log authentication attempts for audit/security purposes
//     await dispatch("login_logs", "create", {
//       body: {
//         ip_address,
//         user_agent,
//         success,
//         token: isCreatingUser ? null : token,
//         user_email: email ?? null,
//         password_type: isCreatingUser ? "register" : "reset_password",
//       },
//     });
//   }
// }

// /**
//  * Authenticates a user with email and password
//  *
//  * @async
//  * @param {import("express").Request} req
//  * @returns {Promise<{ result: Number, message: String }>}
//  * @throws {AppError}
//  */
// async function loginUser(req) {
//   const { email, password } = req.body;
//   const { ip_address, user_agent } = getIpAddressAndUA(req);

//   let numberOfLoginAttempt = 0;
//   let success = true;
//   let existingUser = null;

//   try {
//     const existingUserResult = await getUserByEmail(email);
//     existingUser = existingUserResult.result[0] ?? null;

//     if (!existingUser)
//       throw new AppError("1060", "There is no user with this email!");

//     numberOfLoginAttempt = await countLoginAttemptsEvery15min(email);

//     if (numberOfLoginAttempt > MAX_FAILED_LOGIN_ATTEMPT)
//       throw new AppError(
//         "1070",
//         "You have reached the maximum number of login attempt for today. Please try again in 15 minutes.",
//       );

//     const passwordMatch = await bcrypt.compare(password, existingUser.password);
//     if (!passwordMatch) {
//       success = false;
//       throw new AppError("1100", "Invalid email or password");
//     }

//     // const base64Header = Buffer.from(email + ":" + password).toString("base64");
//     let message = "User successfully logged in";

//     if (!existingUser.email_verified)
//       message += " but his mail is not verified";

//     return {
//       result: existingUser.id,
//       message: message,
//     };
//   } finally {
//     await dispatch("login_logs", "create", {
//       body: {
//         ip_address,
//         user_agent,
//         success,
//         token: null,
//         user_email: existingUser ? existingUser.email : null,
//         password_type: "login",
//       },
//     });
//   }
// }

// /**
//  * Registers a new user
//  *
//  * @async
//  * @param {import("express").Request} req
//  */
// async function registerUser(req) {
//   return await processAccountSecurityFlow(req, {
//     isCreatingUser: true,
//     email_subject: "Welcome! Here is your verification code",
//     email_content: (code) => `
//       <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
//         <h2>Welcome!</h2>
//         <p>Use the code below to verify your account:</p>
//         <div style="
//           font-size: 32px;
//           font-weight: bold;
//           letter-spacing: 8px;
//           text-align: center;
//           background: #f4f4f4;
//           padding: 16px;
//           border-radius: 8px;
//           margin: 24px 0;
//         ">
//           ${code}
//         </div>
//         <p style="color: #999; font-size: 12px; margin: 0;">
//           This code expires in <strong>${process.env.TIME_TOKEN_EXPIRES / 60000} minutes</strong>.<br/>
//           If you did not create an account, you can safely ignore this email.
//         </p>
//       </div>
//     `,
//   });
// }


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
