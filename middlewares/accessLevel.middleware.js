const bcrypt = require("bcrypt");
const AppError = require("../Error/AppError");
const {
  extractBasicAuth,
  getUserByEmail,
} = require("../services/service");



/*
access_level :
-> 
    < 5 = email not verified
    < 10 = simple user with email verified
    < 
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
