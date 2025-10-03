import bcrypt from "bcrypt";
import pool from "../services/mysqlPool.js"

const initAdmin = async () => {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_EMAIL) {
    throw new Error("Missing ADMIN_PASSWORD or ADMIN_EMAIL in environment variables");
  }

  try {
    console.log("Connecting to database...");
    const [rows] = await pool.query("SELECT * FROM users WHERE user_name = 'admin'");

    if (rows.length === 0) {
      console.log("Creating admin user...");
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);

      await pool.query(
        "INSERT INTO users (full_name, user_name, password, email) VALUES (?, ?, ?, ?)",
        ["Administrator", "admin", hashedPassword, process.env.ADMIN_EMAIL]
      );

      await pool.query(
        "INSERT INTO user_roles (user_id, role) VALUES (LAST_INSERT_ID(), 'admin')"
      );

      console.log("Admin user created successfully.");
    } else {
      console.log("Admin already exists. Skipping creation.");
    }
  } catch (err) {
    console.error("Error initializing admin user:", err);
  } finally {
    await pool.end();
    console.log("Database connection closed.");
  }
};

initAdmin().catch(console.error);
