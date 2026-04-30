const crypto = require("crypto");
const bcrypt = require("bcrypt");
const AppError = require("../Error/AppError");
const { dispatch } = require("../services/dispatcher");
const { sendEmail } = require("../services/mailer");
const {
  getUserByEmail,
  checkGoodEmail,
  checkGoodPassword,
  deletedPasswordFromDatas,
  update,
} = require("../database/tables/USERS");
const {
  getIpAddressAndUA,
  countDailyResetPassword,
  countLoginAttemptsEvery15min,
  validateTokenOrThrow,
  generateA2FCode,
} = require("../database/tables/LOGIN_LOGS");

const A2F_COOLDOWN_SECONDS = 60;
const DAILY_RESET_PASSWORD = 3;
const MAX_FAILED_LOGIN_ATTEMPT = 3;
const ACCESS_LEVEL_BEFORE_VERIFY_EMAIL = 5;


async function processAccountSecurityFlow(req, datas) {
  const { email, password, uuid, ...rest } = req.body;
  const { isCreatingUser, email_subject, email_content } = datas;
  const { ip_address, user_agent } = getIpAddressAndUA(req);

  let success = false;
  let token = crypto.randomBytes(32).toString("hex");
  let newUser = null;
  let code = null;
  let expires_at = null;
  let existingUser = null;

  try {
    const config = await dispatch("configuration", "get", {});
    if (!config) throw new AppError("1060", "Website config not found!");

    const existingUserResult = await getUserByEmail(email);
    existingUser = existingUserResult.result[0] ?? null;

    if (isCreatingUser && existingUser)
      throw new AppError("1010", "User already exists!");

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

      const password_hash = await bcrypt.hash(password, 10);

      const newUserResult = await dispatch("users", "create", {
        body: {
          email,
          password: password_hash,
          access_level: ACCESS_LEVEL_BEFORE_VERIFY_EMAIL,
          ...rest,
        },
      });
      newUser = newUserResult.result[0];
      if (!newUser) throw new AppError("1110", "User not created");

      const lastCodeResult = await dispatch("authenticate_codes", "get", {
        query: {
          filters: [["user_id", "eq", newUser.id]],
          orderBy: "created_dt",
          orderDir: "DESC",
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

      code = generateA2FCode(config.result[0].two_factor_authenticator_length);

      await dispatch("authenticate_codes", "create", {
        body: { user_id: newUser.id, code, expires_at },
      });
    }

    await sendEmail({
      email: isCreatingUser ? newUser.email : email,
      subject: email_subject,
      content: email_content(isCreatingUser ? code : token),
    });

    const userCreated = await deletedPasswordFromDatas([newUser]);
    success = true;
    return {
      result: userCreated,
      message: isCreatingUser
        ? "User created"
        : "A password reset email has been sent",
    };
  } finally {
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

async function loginUser(req) {
  const { email, password } = req.body;
  const { ip_address, user_agent } = getIpAddressAndUA(req);

  let success = true;
  let existingUser = null;

  try {
    const existingUserResult = await getUserByEmail(email);
    existingUser = existingUserResult.result[0] ?? null;
    if (!existingUser)
      throw new AppError("1060", "There is no user with this email!");

    const numberOfLoginAttempt = await countLoginAttemptsEvery15min(email);
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

    let message = "User successfully logged in";
    if (!existingUser.email_verified)
      message += " but his mail is not verified";

    return { result: existingUser.id, message };
  } finally {
    await dispatch("login_logs", "create", {
      body: {
        ip_address,
        user_agent,
        success,
        token: null,
        user_email: existingUser?.email ?? null,
        password_type: "login",
      },
    });
  }
}


async function verifyResetPassword(req) {
  const { password } = req.body;
  const { token } = req.query;
  const { ip_address, user_agent } = getIpAddressAndUA(req);

  let success = false;
  let log = null;

  try {
    log = await validateTokenOrThrow(token);
    const password_hash = await bcrypt.hash(password, 10);

    const user = await update({
      query: { filters: [["email", "eq", log[0].user_email]] },
      body: { email: log[0].user_email, password: password_hash },
    });

    success = true;
    return {
      result: user.result,
      message: "Password has been successfully reset",
    };
  } finally {
    await dispatch("login_logs", "create", {
      body: {
        ip_address,
        user_agent,
        success,
        user_email: log?.[0]?.user_email ?? null,
        password_type: "reset_password",
      },
    });
  }
}

module.exports = {
  processAccountSecurityFlow,
  loginUser,
  verifyResetPassword,
};
