const bcrypt = require("bcrypt");
const crypto = require("crypto");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const requestIp = require("request-ip");
const AppError = require("../Error/AppError");
const parseRequest = require("../helpers/parseRequest.helper");
const { dispatch } = require("./dispatcher");
const { LOG_QUERIES } = require("../database/tables/LOGIN_LOGS");
const { processAccountSecurityFlow } = require("../database/tables/USERS");

// #region Constants
const ACCESS_LEVEL_AFTER_VERIFY_EMAIL = 10;
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

  if (!id) throw new AppError("1050", "Missing id");

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


async function postData(req) {
  const { table, body } = parseRequest(req);

  if (body.email !== undefined) {
    const emailCheck = checkGoodEmail(body.email);
    if (!emailCheck.isGoodEmail)
      throw new AppError(emailCheck.status, emailCheck.message);
  }

  const response = await dispatch(table, "create", {
    body,
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned,
    message: "Data created successfully",
  };
}


async function putData(req) {
  const { table, id, filters, body } = parseRequest(req);

  if (body.email !== undefined) {
    const emailCheck = checkGoodEmail(body.email);
    if (!emailCheck.isGoodEmail)
      throw new AppError(emailCheck.status, emailCheck.message);
  }

  const response = await dispatch(table, "update", {
    params: {
      id
    },
    query: {
      filters,
    },
    body,
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned, 
    message: "Data updated successfully",
  };
}


async function softDelete(req) {
  const { table, id } = parseRequest(req);

  if (!id) throw new AppError("1050", "Missing id");

  const response = await dispatch(table, "update", {
    params: {
      id,
    },
    body: {
      deleted: 1
    }
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned,
    message: "Data updated successfully",
  };
}

// #endregion

module.exports = {
  getList,
  getSpecific,
  verifyEmail,
  sendPasswordResetEmail,
  postData,
  putData,
  softDelete,
  sendEmail,
};
