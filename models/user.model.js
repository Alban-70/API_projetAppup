const pool = require("../database/db");
const { v4: uuidv4 } = require('uuid');



async function getWebsiteConfiguration() {
    const result = await pool.query(
        "SELECT * FROM configuration LIMIT 1;"
    );
    return result.rows[0];
}


/**
 * Creates a new user in the database
 * @param {{ email: String, password: String }} user - The user data
 * @returns {Promise<Object|undefined>} - The created user id
 */
async function createUser(user) {
    const { email, password } = user;
    const uuid = uuidv4();

    const result = await pool.query(
        `INSERT INTO users (uuid, email, password, created_dt, changed_dt) VALUES
        ($1, $2, $3, NOW(), NOW())
        RETURNING *;`,
        [uuid, email, password]
    );

    return result.rows[0];
};


async function resetPassword(user) {
    const { email, password } = user;

    const result = await pool.query(
        `UPDATE users SET password = $1 WHERE email = $2 RETURNING *;`,
        [password, email]
    );
    return result.rows[0];
}


async function countLoginAttemptsEvery15min(user_email) {
    const result = await pool.query(
        `SELECT COUNT(*) FROM login_logs
        WHERE user_email = $1
        AND password_type = 'login'
        AND success = false
        AND created_dt >= NOW() - INTERVAL '15 minutes';`,
        [user_email]
    );
    
    return parseInt(result.rows[0].count);
}


async function getUsers() {
    const result = await pool.query(
        "SELECT * FROM users;"
    );

    return result.rows;
}


/**
 * Finds a user by email in the database
 * @param {String} email - The email to search for
 * @returns {Promise<Object|undefined>} - The user found or undefined
 */
async function findUserByEmail(email) {
    const result = await pool.query(
        "SELECT * FROM users WHERE email = $1;",
        [email]
    );

    return result.rows[0];
}


/**
 * Finds a user by id in the database
 * @param {Number} id - The id to search for
 * @returns {Promise<Object|undefined>} - The user found or undefined
 */
async function findUserById(id) {
    const result = await pool.query(
        "SELECT * FROM users WHERE id = $1;",
        [id]
    );

    return result.rows[0];
}


/**
 * Sets the email_verified field of a user to true
 * @param {Int} user_id - The id of the user to verify
 * @returns {Promise<Object>} - The updated user
 */
async function verifyUserEmail(user_id) {
  const result = await pool.query(
    `UPDATE users SET email_verified = true WHERE id = $1 RETURNING *;`,
    [user_id]
  );
  return result.rows[0];
}


/**
 * Creates a login log entry in the database
 * @param {{ ip_address: String, user_agent: String, success: Boolean, user_email: String, password_type: String }} logs - The log data
 * @returns {Promise<Object>} - The created log entry
 */
async function createLoginLogs(logs) {
    const { ip_address, user_agent, success, token, user_email, password_type } = logs;

    const result = await pool.query(
        `INSERT INTO login_logs (ip_address, user_agent, success, token, user_email, password_type) VALUES
        ($1, $2, $3, $4, $5, $6)
        RETURNING *;`,
        [ip_address, user_agent, success, token ?? null, user_email, password_type]
    );

    return result.rows[0];
}


/**
 * Finds a login log by token in the database
 * @param {String} token - The token to search for
 * @returns {Promise<Object|undefined>} - The log found or undefined
 */
async function findLoginLogByToken(token) {
  const result = await pool.query(
    "SELECT * FROM login_logs WHERE token = $1;",
    [token]
  );
  return result.rows[0];
}


async function countDailyResetPassword(user_email) {
    const result = await pool.query(
        `SELECT COUNT(*) FROM login_logs
        WHERE user_email = $1
        AND password_type = 'reset_password'
        AND success = true
        AND created_dt >= NOW() - INTERVAL '24 hours';`,
        [user_email]
    );
    
    return parseInt(result.rows[0].count);
}



async function createAuthenticateCodes(data) {
    const { user_id, code, expires_at } = data;
    const uuid = uuidv4();

    const result = await pool.query(
        `INSERT INTO authenticate_codes (uuid, user_id, code, expires_at, created_dt, changed_dt) VALUES
        ($1, $2, $3, $4, NOW(), NOW())
        RETURNING *;`,
        [uuid, user_id, code, expires_at]
    );

    return result.rows[0];
}


async function findA2FCodeByCode(code) {
    const result = await pool.query(
        `SELECT * FROM authenticate_codes WHERE code = $1;`,
        [code]
    );

    return result.rows[0];
}


async function findA2FCodeByUserId(user_id) {
    const result = await pool.query(
        `SELECT * FROM authenticate_codes WHERE user_id = $1
        ORDER BY created_dt DESC;`,
        [user_id]
    );

    return result.rows[0];
}

async function countA2FCodeByUserId(user_id) {
    const result = await pool.query(
        `SELECT COUNT(*) FROM authenticate_codes WHERE user_id = $1
        GROUP BY user_id;`,
        [user_id]
    );

    return result.rows[0];
}


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
}