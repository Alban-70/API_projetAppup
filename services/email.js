const SibApiV3Sdk = require("sib-api-v3-sdk");
const AppError = require("../Error/AppError");
const { dispatch } = require("./dispatcher");
const { processAccountSecurityFlow } = require("../core/authFlow");
const { getIpAddressAndUA } = require("../database/tables/LOGIN_LOGS");

const ACCESS_LEVEL_AFTER_VERIFY_EMAIL = 10;

async function getEmailTemplate(code) {
  const result = await dispatch("emails", "get", {
    query: { filters: [["code", "eq", code]] },
  });
  const template = result.result[0];
  if (!template) throw new AppError("1060", "Email template not found");
  return template;
}

function renderTemplate(content, variables) {
  let html = content;
  for (const key in variables) {
    html = html.replaceAll(`{{${key}}}`, variables[key]);
  }
  return html;
}


async function sendPasswordResetEmail(req) {
  const template = await getEmailTemplate("reset_password");
  return processAccountSecurityFlow(req, {
    isCreatingUser: false,
    email_subject: template.subject,
    email_content: (token) =>
      renderTemplate(template.content, {
        LINK: `${process.env.LINK_FRONT}/reset-password?token=${token}`,
      }),
  });
}

async function sendRegisterEmail(req) {
  const template = await getEmailTemplate("register");
  return processAccountSecurityFlow(req, {
    isCreatingUser: true,
    email_subject: template.subject,
    email_content: (code) =>
      renderTemplate(template.content, {
        CODE: code,
        EXPIRES_MINUTES: process.env.TIME_TOKEN_EXPIRES / 60000,
      }),
  });
}

async function verifyEmail(req) {
  const { code } = req.query;
  const { ip_address, user_agent } = getIpAddressAndUA(req);

  let success = false;
  let authenticateCode = null;
  let mailUser = null;

  try {
    if (!code) throw new AppError("1050", "Code is missing");

    const authenticateCodeResult = await dispatch("authenticate_codes", "get", {
      query: { filters: [["code", "eq", code]] },
    });
    authenticateCode = authenticateCodeResult.result[0] ?? null;
    if (!authenticateCode) throw new AppError("1040", "Code is invalid!");

    if (new Date() > new Date(authenticateCode.expires_at))
      throw new AppError("1030", "Code is expired!");

    const user = await dispatch("users", "update", {
      params: { id: authenticateCode.user_id },
      body: {
        email_verified: true,
        access_level: ACCESS_LEVEL_AFTER_VERIFY_EMAIL,
      },
    });

    mailUser = user.result.email;
    success = true;
    return { result: user.result, message: "Email verified successfully" };
  } finally {
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

module.exports = {
  sendRegisterEmail,
  sendPasswordResetEmail,
  verifyEmail,
};
