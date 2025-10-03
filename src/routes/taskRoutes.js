import express from "express";
import pool from "../services/mysqlPool.js"

const taskRouter = express.Router()

async function updateData(rows) {
    const externalRes = await fetch(`${process.env.TASK_API_URL}/api/label-excel-bg`)
    .then(r => r.json());
    const externalTasks = externalRes.tasks || [];
    await Promise.all(
        rows.map(row => {
            const tasks = externalTasks.find(t => t.task_id === row.task_id);
            if (tasks) {
                row.status = tasks.status;                          
                row.duration = tasks.process_duration ?? row.duration;
                return pool.query(`
                    UPDATE tasks SET status = ?, duration = ? WHERE task_id = ?
                    `,[row.status, row.duration, row.task_id]
                );
            }
        })
    );
    return rows;
}

taskRouter.post("/", async (req, res) => {

    const { task_id, user_id, file_name, category, creation_time } = req.body;
    if (req.user.user_id !== user_id && req.user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
    }
    try {
        await pool.query(`
            INSERT INTO tasks (task_id, user_id, file_name, category, creation_time, status, duration) 
            VALUES (?, ?, ?, ?, ?, "pending", 0)
            `,[task_id, user_id, file_name, category, creation_time]
        );
        res.status(201).json({ message: "Task created",  task_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Create task failed" });
    }
});

taskRouter.get("/", async (req, res) => {
  try {
    let query = `
      SELECT t.task_id, u.full_name, t.file_name, t.category, t.status, t.creation_time, t.duration
      FROM tasks t
      LEFT JOIN users u ON t.user_id = u.id
    `;
    let params = [];

    if (req.user.role !== "admin") {
      query += " WHERE t.user_id = ?";
      params.push(req.user.user_id);
    }

    query += " ORDER BY creation_time DESC";

    const [rows] = await pool.query(query, params);
    const new_rows = await updateData(rows);

    res.json(new_rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fetch tasks failed" });
  }
});


export default taskRouter;