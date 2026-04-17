const express = require("express");
const router = express.Router();

const AuthController = require("../controllers/user.controller");



router.get("/get/me", AuthController.getMe);

router.get("/get/all", AuthController.getAllUsers);

router.post("/auth/register", AuthController.register);

router.post("/email/verify", AuthController.verifyEmail);

router.post("/auth/login", AuthController.login);

router.post("/password/forgot", AuthController.forbiddenPassword);

router.post("/password/reset", AuthController.verifyResetPassword);


module.exports = router;



// Connexion
// passer le mail:mdp en base64 et le passer dans le header