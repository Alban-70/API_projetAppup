const express = require("express");
const router = express.Router();

const UserController = require("../controllers/user.controller");
const { requireAccessLevel } = require("../middlewares/accessLevel.middleware");
const tableAccessMiddleware = require("../middlewares/tableAccess.middleware");

router.post("/auth/register", UserController.register);
router.post("/email/verify", UserController.verifyEmail);
router.post("/auth/login", UserController.login);
router.post("/password/forgot", UserController.forbiddenPassword);
router.post("/password/reset", UserController.verifyResetPassword);

// router.post("/:table_name", UserController.);

router.get("/me", requireAccessLevel(10), UserController.getMe);

router.get(
  "/:table_name",
  requireAccessLevel(10),
  tableAccessMiddleware,
  UserController.getList,
);

router.get(
  "/:table_name/:id",
  requireAccessLevel(10),
  tableAccessMiddleware,
  UserController.getSpecific,
);

module.exports = router;
