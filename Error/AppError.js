class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = Number(status);
    this.name = "AppError";
  }
}

module.exports = AppError;