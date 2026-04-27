const bcrypt = require("bcrypt");
const crypto = require("crypto");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const requestIp = require("request-ip");
const AppError = require("../Error/AppError");
const parseRequest = require("../helpers/parseRequest.helper");
const TableRequest = require("../models/TableRequest");
const { dispatch } = require("./dispatcher");

// #region Constants
const A2F_COOLDOWN_SECONDS = 60; // Minimum delay (in seconds) between two 2FA code requests to prevent abuse/spam.
const DAILY_RESET_PASSWORD = 3; // Maximum number of password reset requests allowed per user per day.
const MAX_FAILED_LOGIN_ATTEMPT = 3; // Maximum number of failed login attempts allowed every 15 minutes.
//#endregion

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

// #region Helpers
/**
 * Removes sensitive fields from a list of users based on the configuration
 * @param {Object[]} users
 * @returns {Promise<Object[]>}
 */
async function deletedPasswordFromDatas(users) {
  if (!users) return [];

  if (!Array.isArray(users)) users = [users];
  
  const config = await dispatch("configuration", "get", datas = {});
  const fields_to_clean = config?.result[0].fields_to_clean || [];

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
// #endregion

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
 * Core authentication workflow handling:
 * - user registration
 * - password reset request
 * - email sending
 * - security logging
 *
 * @async
 * @param {import("express").Request} req
 * @param {{ isCreatingUser: Boolean, email_subject: String, email_content: Function }} datas
 * @returns {Promise<{ result: Object, message: String }>}
 * @throws {Error}
 */
async function processAccountSecurityFlow(req, datas) {
  const { email, password, uuid, ...rest } = req.body;
  const { isCreatingUser, email_subject, email_content } = datas;
  const { ip_address, user_agent } = getIpAddressAndUA(req);

  let success = false;

  // Secure token used for email verification or password reset
  let token = crypto.randomBytes(32).toString("hex");

  let newUser = null;
  let code = null;
  let expires_at = null;
  let existingUser = null;

  try {
    const config = await dispatch("configuration", "get", req);
    if (!config) throw new AppError("1060", "Website config not found!");

    const existingUserResult = await getUserByEmail(email);
    existingUser = existingUserResult.result[0] ?? null;

    // Prevent duplicate account creation
    if (isCreatingUser && existingUser)
      throw new AppError("1010", "User already exists!");

    // Ensure user exists for password reset flow
    if (!isCreatingUser && !existingUser)
      throw new AppError("1060", "User not found!");

    if (!isCreatingUser) {
      const dailyCount = await countDailyResetPassword(email);
      if (dailyCount >= DAILY_RESET_PASSWORD)
        throw new AppError(
          "1070",
          "You have reached the maximum number of password reset requests for today. Please try again tomorrow.",
        );
    }

    const emailCheck = checkGoodEmail(email);
    if (!emailCheck.isGoodEmail)
      throw new AppError(emailCheck.status, emailCheck.message);

    expires_at = new Date(Date.now() + Number(process.env.TIME_TOKEN_EXPIRES));

    if (isCreatingUser) {
      const passwordCheck = checkGoodPassword(password);
      if (!passwordCheck.isGoodPassword)
        throw new AppError(passwordCheck.status, passwordCheck.message);

      // Hash password before saving it to database
      const password_hash = await bcrypt.hash(password, 10);

      const newUserResult = await dispatch("users", "create", {
        body: {
          email,
          password: password_hash,
          ...rest,
        },
      });
      newUser = newUserResult.result;

      if (!newUser) throw new AppError("1110", "User not created");

      const lastCodeResult = await dispatch("authenticate_codes", "get", {
        query: {
          filters: [["user_id", "eq", newUser.id]],
          orderBy: "created_dt",
          orderDir: "DESC",
          isMe: true,
        },
      });
      const lastCode = lastCodeResult.result[0] ?? null;
      if (lastCode) {
        const secondesElapsed =
          (Date.now() - new Date(lastCode.created_dt)) / 1000;
        if (secondesElapsed < A2F_COOLDOWN_SECONDS) {
          const remaining = Math.ceil(A2F_COOLDOWN_SECONDS - secondesElapsed);
          throw new AppError(
            "1090",
            `Please wait ${remaining}s before requesting a new code.`,
          );
        }
      }

      code = generateA2FCode(config.two_factor_authenticator_length);

      await dispatch("authenticate_codes", "create", {
        body: {
          user_id: newUser.id,
          code,
          expires_at,
        },
      });
    }

    // Send email depending on flow (register or reset password)
    await sendEmail({
      email: isCreatingUser ? newUser.email : email,
      subject: email_subject,
      content: email_content(isCreatingUser ? code : token),
    });

    // Remove sensitive data before returning the user object
    const userCreated = await deletedPasswordFromDatas([newUser]);

    success = true;
    return {
      result: userCreated,
      message: isCreatingUser
        ? "User created"
        : "A password reset email has been sent",
    };
  } finally {
    // Always log authentication attempts for audit/security purposes
    await dispatch("login_logs", "create", {
      body: {
        ip_address,
        user_agent,
        success,
        token: isCreatingUser ? null : token,
        user_email: email ?? null,
        password_type: isCreatingUser ? "register" : "reset_password",
      },
    });
  }
}

/**
 * Authenticates a user with email and password
 *
 * @async
 * @param {import("express").Request} req
 * @returns {Promise<{ result: Number, message: String }>}
 * @throws {AppError}
 */
async function loginUser(req) {
  const { email, password } = req.body;
  const { ip_address, user_agent } = getIpAddressAndUA(req);

  let numberOfLoginAttempt = 0;
  let success = true;
  let existingUser = null;

  try {
    const existingUserResult = await getUserByEmail(email);
    existingUser = existingUserResult.result[0] ?? null;

    if (!existingUser)
      throw new AppError("1060", "There is no user with this email!");

    numberOfLoginAttempt = await countLoginAttemptsEvery15min(email);

    if (numberOfLoginAttempt > MAX_FAILED_LOGIN_ATTEMPT)
      throw new AppError(
        "1070",
        "You have reached the maximum number of login attempt for today. Please try again in 15 minutes.",
      );

    const passwordMatch = await bcrypt.compare(password, existingUser.password);
    if (!passwordMatch) {
      success = false;
      throw new AppError("1100", "Invalid email or password");
    }

    // const base64Header = Buffer.from(email + ":" + password).toString("base64");
    let message = "User successfully logged in";

    if (!existingUser.email_verified)
      message += " but his mail is not verified";

    return {
      result: existingUser.id,
      message: message,
    };
  } finally {
    await dispatch("login_logs", "create", {
      body: {
        ip_address,
        user_agent,
        success,
        token: null,
        user_email: existingUser ? existingUser.email : null,
        password_type: "login",
      },
    });
  }
}

/**
 * Registers a new user
 *
 * @async
 * @param {import("express").Request} req
 */
async function registerUser(req) {
  return await processAccountSecurityFlow(req, {
    isCreatingUser: true,
    email_subject: "Welcome! Here is your verification code",
    email_content: (code) => `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2>Welcome!</h2>
        <p>Use the code below to verify your account:</p>
        <div style="
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 8px;
          text-align: center;
          background: #f4f4f4;
          padding: 16px;
          border-radius: 8px;
          margin: 24px 0;
        ">
          ${code}
        </div>
        <p style="color: #999; font-size: 12px; margin: 0;">
          This code expires in <strong>${process.env.TIME_TOKEN_EXPIRES / 60000} minutes</strong>.<br/>
          If you did not create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
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

    const result = await dispatch("users", "get", {
      query: {
        filters: [["email", "eq", email]],
        isMe: true,
      }
    });

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

// #region Email
/**
 * Sends a transactional email via Brevo API
 *
 * @async
 * @param {{ email: String, subject: String, content: String }} user - The email data
 * @returns {Promise<void>}
 */
async function sendEmail(user) {
  const { email, subject, content } = user;

  // Initialize Brevo API client
  const client = SibApiV3Sdk.ApiClient.instance;
  const apiKey = client.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_API_KEY;

  // Create transactional email service instance
  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

  const sendSmtpEmail = {
    sender: { email: process.env.BREVO_EMAIL, name: process.env.BREVO_NAME },
    to: [{ email: `${email}` }],
    subject: subject,
    htmlContent: content,
  };

  // Send email through external provider
  await apiInstance
    .sendTransacEmail(sendSmtpEmail)
    .then((data) => {
      console.log("Email send :", data);
    })
    .catch((error) => {
      console.error("Error :", error);
    });
}
//#endregion

//#region Password flow
/**
 * Handles password reset using token verification
 *
 * @async
 * @param {import("express").Request} req
 * @returns {Promise<{ result: Object, message: String }>}
 */
async function verifyResetPassword(req) {
  const { password } = req.body;
  const { token } = req.query;
  const { ip_address, user_agent } = getIpAddressAndUA(req);

  let success = false;
  let log = null;


  try {
    // Shared token validation logic
    log = await validateTokenOrThrow(token);

    // Hash new password securely before saving
    const password_hash = await bcrypt.hash(password, 10);

    // Update user password
    const user = await dispatch("users", "update", {
      filters: [["email", "eq", log[0].user_email]],
      body: {
        email: log[0].user_email,
        password: password_hash,
      },
    });

    success = true;
    return {
      result: user.result,
      message: "Password has been successfully reset",
    };
  } finally {
    // Audit log for security tracking
    await dispatch("login_logs", "create", {
      body: {
        ip_address,
        user_agent,
        success,
        user_email: log ? log.user_email : null,
        password_type: "reset_password",
      },
    });
  }
}

/**
 * Sends password reset email
 *
 * @async
 * @param {import("express").Request} req
 */
async function sendPasswordResetEmail(req) {
  return await processAccountSecurityFlow(req, {
    isCreatingUser: false,
    email_subject: "Reset your password",
    email_content: (token) => `
      <a href="${process.env.LINK_FRONT}/reset-password?token=${token}">
        Reset password
      </a>
    `,
  });
}

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
      },
      query: {
        isMe: true,
      }
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

// #region Data access layer (generic queries)
/**
 * Get list of records from a table (generic query handler)
 *
 * @async
 * @param {import("express").Request} req
 * @returns {Promise<{ result: Object[], message: String }>}
 */
async function getList(req) {
  const { table, fields, filters, orderBy, orderDir } = parseRequest(req);
  console.log("FIELDS RAW:", fields);

  const response = await dispatch(table, "get", {
    query: {
      fields,
      filters,
      orderBy,
      orderDir,
    },
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned,
    message: "Datas fetched successfully",
  };
}

/**
 * Get specific record(s) from a table
 *
 * @async
 * @param {import("express").Request} req
 * @returns {Promise<{ result: Object, message: String }>}
 */
async function getSpecific(req) {
  const { table, id, fields, filters, orderBy, orderDir } = parseRequest(req);

  const response = await dispatch(table, "getOne", {
    params: {
      id
    },
    query: {
      fields,
      filters,
      orderBy,
      orderDir,
    },
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned,
    message: "Datas fetched successfully",
  };
}

/**
 * Get user by email (internal helper)
 *
 * @async
 * @param {String} email
 * @returns {Promise<{ result: Object[] }>}
 */
async function getUserByEmail(email) {
  return dispatch("users", "get", {
    query: {
      filters: [["email", "eq", email]],
      isMe: true,
    }
  });
}
// #endregion

module.exports = {
  getList,
  getSpecific,
  registerUser,
  verifyEmail,
  verifyResetPassword,
  sendPasswordResetEmail,
  loginUser,
  getMe,
  extractBasicAuth,
  getUserByEmail,
};
