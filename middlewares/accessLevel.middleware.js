const bcrypt = require("bcrypt");
const AppError = require("../Error/AppError");
const {
  extractBasicAuth,
  getUserByEmail,
} = require("../database/tables/USERS");



/*
access_level :
-> 
    n < 5 = email not verified
    5 < n < 10 = simple user with email verified
    10 < n < 50 = admin (can add / edit / delete everything except users)
    50 < n < 100 = super admin (can delete users)
*/

function requireAccessLevel(minLevel) {
  return async (req, res, next) => {
    try {
      const { email, password } = extractBasicAuth(req);
      const resultUser = await getUserByEmail(email);
      const user = resultUser.result[0] ?? null;

      if (!user) throw new AppError("1060", "User not found");

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) throw new AppError("1100", "Invalid credentials");

      if (user.access_level < minLevel)
        throw new AppError("1030", "Insufficient permissions");

      req.user = user;
      next();
    } catch (err) {
      res.status(403).json({ status: "error", message: err.message });
    }
  };
}

module.exports = {
  requireAccessLevel,
};
