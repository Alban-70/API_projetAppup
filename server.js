const express = require("express");
const cors = require("cors");
require("dotenv").config();

const generateFilePerTable = require("./database/generator/generateFilePerTable");

const authRoutes = require("./routes/routes");

async function startServer() {
  try {
    await generateFilePerTable();

    const app = express();
    const PORT = process.env.PORT || 3000;

    app.use(
      cors({
        origin: process.env.LINK_FRONT,
        credentials: true,
      }),
    );

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use("/user", authRoutes);

    app.listen(PORT, () => {
      console.log(`Server started on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Erreur au démarrage :", err);
    process.exit(1);
  }
}

startServer();