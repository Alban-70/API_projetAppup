const authService = require("../services/user.service");


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
                result
            });

        } catch (err) {
            res.status(500).json({
                status: "error",
                statusCode: err.status,
                message: err.message || "Unknow error"
            });
        }
    }   
    

    static getMe(req, res) {
        return UserController.handle(authService.getMe.bind(authService), req, res);
    }

    static getAllUsers(req, res) {
        return UserController.handle(authService.getAllUser.bind(authService), req, res);
    }
    
    /**
   * Handles the registration of a new user
   * @param {req} req - The express request object
   * @param {res} res - The express response object
   * @returns {Promise<void>}
   */
    static register(req, res) {
        return UserController.handle(authService.registerUser.bind(authService), req, res);
    }

    /**
   * Handles the login of a user
   * @param {req} req - The express request object
   * @param {res} res - The express response object
   * @returns {Promise<void>}
   */
    static login(req, res) {
        return UserController.handle(authService.loginUser.bind(authService), req, res);
    }

    static forbiddenPassword(req, res) {
        return UserController.handle(authService.sendPasswordResetEmail.bind(authService), req, res);
    }

    static verifyResetPassword(req, res) {
        return UserController.handle(authService.verifyResetPassword.bind(authService), req, res);
    }

    static verifyEmail(req, res) {
        return UserController.handle(authService.verifyEmail.bind(authService), req, res);
    }

}


module.exports = UserController;