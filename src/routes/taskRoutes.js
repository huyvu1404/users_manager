import express from "express";
import pool from "../services/mysqlPool.js"
import { upload } from "../middleware/upload.js";
import fs from "fs";

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

taskRouter.post("/", upload.single("file"), async (req, res) => {
    console.log(req.body)
    console.log(req.file)
    const { category } = req.body;
    const file = req.file;

    if (!req.user || !req.user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(file.path);
        formData.append("file", new Blob([fileBuffer]));

        const response = await fetch(`${process.env.TASK_API_URL}/api/label-excel-bg?category=${category}`, {
            method: "POST",
            body: formData,
            
        });

        if (response.ok) {
            const taskInfo = await response.json()
            console.log(taskInfo)
            await pool.query(`
                INSERT INTO tasks (task_id, user_id, file_name, category, creation_time, status, duration) 
                VALUES (?, ?, ?, ?, ?, "pending", 0)
                `,[taskInfo.task_id, req.user.user_id, file.filename, category, taskInfo.creation_time]
            );
            await pool.query(`INSERT INTO user_activity_logs (user_name, action, description, created_at) VALUES (?, ?, ?, NOW())`,
                [req.user.user_name, "SUBMIT TASK", `Submitted a new task with id: ${taskInfo.task_id}`]
            )
            res.status(201).json({ message: "Task created",  task_id: taskInfo.task_id });
        }
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