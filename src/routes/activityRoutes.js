import express from "express";
import pool from "../services/mysqlPool.js"

const activityRouter = express.Router()

activityRouter.get("/", async (req, res) => {
  try {
    let query = `
      SELECT * FROM user_activity_logs
    `;
    let params = [];

    if (req.user.role !== "admin") {
      query += " WHERE user_name = ?";
      params.push(req.user.user_name);
    }

    query += " ORDER BY created_at DESC";

    const [rows] = await pool.query(query, params);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fetch activities failed" });
  }
});

export default activityRouter;