const pool = require("../database/db");
const { v4: uuidv4 } = require('uuid');



class UserModel {

    /**
     * Executes a SQL query and returns all rows
     * @param {String} sql - The SQL query to execute
     * @param {Array} params - The query parameters
     * @returns {Promise<Array>} - The rows returned by the query
     */
    static async query(sql, params = []) {
        const result = await pool.query(sql, params);
        return result.rows;
    }

    /**
     * Executes a SQL query and returns a single row
     * @param {String} sql - The SQL query to execute
     * @param {Array} params - The query parameters
     * @returns {Promise<Object|undefined>} - The first row returned or undefined
     */
    static async queryOne(sql, params = []) {
        const result = await pool.query(sql, params);
        return result.rows[0];
    }

    /**
     * Executes a SQL COUNT query and returns the result as an integer
     * @param {String} sql - The SQL COUNT query to execute
     * @param {Array} params - The query parameters
     * @returns {Promise<Number>} - The count result as an integer
     */
    static async queryCount(sql, params = []) {
        const result = await pool.query(sql, params);
        return parseInt(result.rows[0].count);
    }

}


//#region WebsiteConfiguration
// =============================== SELECT ===============================

/**
 * @returns {Promise<Object|undefined>} - The website configuration
 */
const getWebsiteConfiguration = () => {
    return UserModel.queryOne(
        "SELECT * FROM configuration LIMIT 1"
    );
}
//#endregion


//#region Users
// =============================== SELECT ===============================

/**
 * Gets all users from the database
 * @returns {Promise<Array>} - The list of users
 */
const getUsers = () => {
    return UserModel.query(
        "SELECT * FROM users;"
    );
}


/**
 * Finds a user by email in the database
 * @param {String} email - The email to search for
 * @returns {Promise<Object|undefined>} - The user found or undefined
 */
const findUserByEmail = (email) => {
    return UserModel.queryOne(
        "SELECT * FROM users WHERE email = $1;", 
        [email]
    );
}


/**
 * Finds a user by id in the database
 * @param {Number} id - The id to search for
 * @returns {Promise<Object|undefined>} - The user found or undefined
 */
const findUserById = (id) => {
    return UserModel.queryOne(
        "SELECT * FROM users WHERE id = $1;", 
        [id]
    );
}


// =============================== INSERT ===============================

/**
 * Creates a new user in the database
 * @param {{ email: String, password: String }} user - The user data
 * @returns {Promise<Object|undefined>} - The created user id
 */
const createUser = ({ email, password }) => {
    return UserModel.queryOne(
        `INSERT INTO users (uuid, email, password, created_dt, changed_dt) VALUES
        ($1, $2, $3, NOW(), NOW())
        RETURNING *;`,
        [uuidv4(), email, password]
    );
}

// =============================== UPDATE ===============================

/**
 * Resets the password of a user
 * @param {{ email: String, password: String }} user - The user data
 * @returns {Promise<Object|undefined>} - The updated user
 */
const resetPassword = ({ email, password }) => {
    return UserModel.queryOne(
        `UPDATE users SET password = $1 WHERE email = $2 
        RETURNING *;`,
        [password, email]
    );
}


/**
 * Sets the email_verified field of a user to true
 * @param {Int} user_id - The id of the user to verify
 * @returns {Promise<Object>} - The updated user
 */
const verifyUserEmail = (user_id) => {
    return UserModel.queryOne(
        `UPDATE users SET email_verified = true WHERE id = $1 
        RETURNING *;`,
        [user_id]
    );
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
    return UserModel.queryOne(
        "SELECT * FROM login_logs WHERE token = $1;", 
        [token]
    );
}

// ============================ SELECT COUNT ============================

/**
 * Counts the number of failed login attempts in the last 15 minutes
 * @param {String} user_email - The email of the user
 * @returns {Promise<Number>} - The number of failed login attempts
 */
const countLoginAttemptsEvery15min = (user_email) => {
    return UserModel.queryCount(
        `SELECT COUNT(*) FROM login_logs
        WHERE user_email = $1
        AND password_type = 'login'
        AND success = false
        AND created_dt >= NOW() - INTERVAL '15 minutes';`, 
        [user_email]
    );
}


/**
 * Counts the number of password resets in the last 24 hours
 * @param {String} user_email - The email of the user
 * @returns {Promise<Number>} - The number of password resets
 */
const countDailyResetPassword = (user_email) => {
    return UserModel.queryCount(
        `SELECT COUNT(*) FROM login_logs
        WHERE user_email = $1
        AND password_type = 'reset_password'
        AND success = true
        AND created_dt >= NOW() - INTERVAL '24 hours';`, 
        [user_email]
    );
}

// =============================== INSERT ===============================

/**
 * Creates a login log entry in the database
 * @param {{ ip_address: String, user_agent: String, success: Boolean, user_email: String, password_type: String }} logs - The log data
 * @returns {Promise<Object>} - The created log entry
 */
const createLoginLogs = ({ ip_address, user_agent, success, token, user_email, password_type }) => {
    return UserModel.queryOne(
        `INSERT INTO login_logs (ip_address, user_agent, success, token, user_email, password_type) VALUES
        ($1, $2, $3, $4, $5, $6)
        RETURNING *;`,
        [ip_address, user_agent, success, token ?? null, user_email, password_type]
    );
}
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
        [code]
    );
}


/**
 * Finds the latest 2FA code by user id in the database
 * @param {Number} user_id - The id of the user
 * @returns {Promise<Object|undefined>} - The code found or undefined
 */
const findA2FCodeByUserId = (user_id) => {
    return UserModel.queryOne(
        `SELECT * FROM authenticate_codes WHERE user_id = $1
        ORDER BY created_dt DESC;`, 
        [user_id]
    );
}

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
        [user_id]
    );
}

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
        [uuidv4(), user_id, code, expires_at]
    );
}
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
}