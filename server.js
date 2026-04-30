const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
require('./services/schedule');

const generateFilePerTable = require("./database/generator/generateFilePerTable");

const requireApiKey = require("./middlewares/apiKey.middleware");
const authRoutes = require("./routes/routes");

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), {
  flags: "a",
});
const errorLogStream = fs.createWriteStream(path.join(logsDir, "error.log"), {
  flags: "a",
});

async function startServer() {
  try {
    await generateFilePerTable();

    const app = express();
    const PORT = process.env.PORT || 3000;

    app.use(morgan("combined", { stream: accessLogStream }));

    app.use(morgan("dev"));

    app.use(
      morgan("combined", {
        stream: errorLogStream,
        skip: (req, res) => res.statusCode < 400,
      }),
    );

    app.use(
      cors({
        origin: process.env.LINK_FRONT,
        credentials: true,
      }),
    );

    app.use(requireApiKey);

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));


    app.use("/", authRoutes);

    app.listen(PORT, () => {
      console.log(`Server started on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Erreur au démarrage :", err);
    process.exit(1);
  }
}

startServer();