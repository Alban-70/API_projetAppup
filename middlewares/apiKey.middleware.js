function requireApiKey(req, res, next) {
  const apiKey = req.headers["phone_key"];

  if (!apiKey)
    return res.status(401).json({ status: "error", message: "Key is missing" });

  if (apiKey !== process.env.PHONE_KEY)
    return res.status(403).json({ status: "error", message: "Key invalid" });

  next();
}

module.exports = requireApiKey;
