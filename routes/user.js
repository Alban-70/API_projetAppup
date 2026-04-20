const express = require("express");
const router = express.Router();

const UserController = require("../controllers/user.controller");



router.get("/get/me", UserController.getMe);

router.get("/get/all", UserController.getAllUsers);

router.post("/auth/register", UserController.register);

router.post("/email/verify", UserController.verifyEmail);

router.post("/auth/login", UserController.login);

router.post("/password/forgot", UserController.forbiddenPassword);

router.post("/password/reset", UserController.verifyResetPassword);


module.exports = router;