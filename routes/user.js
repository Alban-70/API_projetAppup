const express = require("express");
const router = express.Router();

const UserController = require("../controllers/user.controller");
const TableRequest = require("../models/TableRequest");

router.get("/:table_name", 
	UserController.getList
  // const request = new TableRequest(req, res);
  // request.count ? request.getCount() : request.getList();
);

router.get("/:table_name/:id", 
	UserController.getSpecific
  // const request = new TableRequest(req, res);
  // request.getSpecific();
);

// router.post("/:table_name", 
// 	// UserController.
// 	// const request = new TableRequest(req, res);
// 	// request.postData();
// );

// router.get("/get/me", UserController.getMe);

// router.get("/get/all", UserController.getAllUsers);

router.post("/auth/register", UserController.register);

router.post("/email/verify", UserController.verifyEmail);

router.post("/auth/login", UserController.login);

router.post("/password/forgot", UserController.forbiddenPassword);

router.post("/password/reset", UserController.verifyResetPassword);

module.exports = router;
