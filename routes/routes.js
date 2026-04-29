const express = require("express");
const router = express.Router();

const UserController = require("../controllers/user.controller");
const { requireAccessLevel } = require("../middlewares/accessLevel.middleware");
const tableAccessMiddleware = require("../middlewares/tableAccess.middleware");

router.post("/auth/register", UserController.register);
router.post("/auth/login", UserController.login);

router.post("/email/verify", UserController.verifyEmail);

router.post("/password/forgot", UserController.forbiddenPassword);
router.post("/password/reset", UserController.verifyResetPassword);

// router.post("/:table_name", UserController.);

router.get("/me", requireAccessLevel(10), UserController.getMe);

router.get("/:table_name", requireAccessLevel(10), tableAccessMiddleware, UserController.getList);

router.get("/:table_name/:id", requireAccessLevel(10), tableAccessMiddleware, UserController.getSpecific);

router.post("/:table_name/add", requireAccessLevel(50), tableAccessMiddleware, UserController.postData);

router.put("/:table_name/:id/edit", requireAccessLevel(50), tableAccessMiddleware, UserController.putData);

router.patch("/:table_name/:id/delete", requireAccessLevel(50), tableAccessMiddleware, UserController.softDelete);

router.patch(
  "/users/:id/delete-users",
  requireAccessLevel(100),
  (req, res, next) => {
    req.params.table_name = "users";
    next();
  },
  tableAccessMiddleware,
  UserController.softDelete,
);

module.exports = router;