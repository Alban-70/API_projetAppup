const authService = require("../services/service");
const USERS = require("../database/tables/USERS");
const emailService = require("../services/email");


class UserController {
  /**
   * Generic handler for all service methods
   * Wraps the service call in a try/catch and sends the response
   * @param {Function} serviceMethod - The service method to call
   * @param {req} req - The express request object
   * @param {res} res - The express response object
   * @returns {Promise<void>}
   */
  static async handle(serviceMethod, req, res) {
    try {
      const { result, message } = await serviceMethod(req);
      res.status(200).json({
        status: "success",
        message,
        result,
      });
    } catch (err) {
      res.status(500).json({
        status: "error",
        statusCode: err.status,
        message: err.message || "Unknow error",
      });
    }
  }

  static getMe(req, res) {
    return UserController.handle(USERS.getMe.bind(USERS), req, res);
  }

  static getList(req, res) {
    return UserController.handle(
      authService.getList.bind(authService),
      req,
      res,
    );
  }

  static getSpecific(req, res) {
    return UserController.handle(
      authService.getSpecific.bind(authService),
      req,
      res,
    );
  }

  /**
   * Handles the registration of a new user
   * @param {req} req - The express request object
   * @param {res} res - The express response object
   * @returns {Promise<void>}
   */
  static register(req, res) {
    return UserController.handle(USERS.registerUser.bind(USERS), req, res);
  }

  /**
   * Handles the login of a user
   * @param {req} req - The express request object
   * @param {res} res - The express response object
   * @returns {Promise<void>}
   */
  static login(req, res) {
    return UserController.handle(USERS.loginUser.bind(USERS), req, res);
  }

  static forbiddenPassword(req, res) {
    return UserController.handle(
      emailService.sendPasswordResetEmail.bind(emailService),
      req,
      res,
    );
  }

  static verifyResetPassword(req, res) {
    return UserController.handle(
      USERS.verifyResetPassword.bind(USERS),
      req,
      res,
    );
  }

  static verifyEmail(req, res) {
    return UserController.handle(
      authService.verifyEmail.bind(authService),
      req,
      res,
    );
  }

  static postData(req, res) {
    return UserController.handle(
      authService.postData.bind(authService),
      req,
      res,
    );
  }

  static putData(req, res) {
    return UserController.handle(
      authService.putData.bind(authService),
      req,
      res,
    );
  }

  static softDelete(req, res) {
    return UserController.handle(
      authService.softDelete.bind(authService),
      req,
      res,
    );
  }
}


module.exports = UserController;