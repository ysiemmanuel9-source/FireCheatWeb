require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

async function main() {
  const databaseName = process.env.DB_NAME || "fire_cheat_web";
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error("DB_NAME solo puede tener letras, numeros y guion bajo.");
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true
  });

  const sql = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${databaseName}\`;`
  );
  await connection.query(sql);
  await connection.end();
  console.log(`Base de datos "${databaseName}" creada/actualizada correctamente.`);
}

main().catch((error) => {
  console.error("Error creando la base de datos:", error.message);
  process.exit(1);
});
