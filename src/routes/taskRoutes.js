import express from "express";
import { Readable } from "stream";
import pool from "../services/mysqlPool.js"
import { upload } from "../middleware/upload.js";
import { taskQueue } from "../queues/queue.js";

import fs from "fs";

const taskRouter = express.Router()

async function updateData(rows) {
    const externalRes = await fetch(`${process.env.TASK_API_ENDPOINT}/api/label-excel-bg`)
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

        const response = await fetch(`${process.env.TASK_API_ENDPOINT}/api/label-excel-bg?category=${category}`, {
            method: "POST",
            body: formData,
            
        });

        if (response.ok) {
            const taskInfo = await response.json()
            await taskQueue.add("tasks", {user: req.user, task_id: taskInfo.task_id });
            await pool.query(`
                INSERT INTO tasks (task_id, user_id, file_name, category, creation_time, status, duration) 
                VALUES (?, ?, ?, ?, ?, "pending", 0)
                `,[taskInfo.task_id, req.user.user_id, file.originalname, category, taskInfo.creation_time]
            );
            await pool.query(`INSERT INTO user_activity_logs (user_name, action, description, created_at) VALUES (?, ?, ?, NOW())`,
                [req.user.user_name, "SUBMIT TASK", `Submitted a new task with id: ${taskInfo.task_id}`]
            )
            res.status(201).json({ message: "Task created",  task_id: taskInfo.task_id });
        }
    } catch (err) {
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
    res.status(500).json({ error: "Fetch tasks failed" });
  }
});

taskRouter.get("/sampling/:task_id", async (req, res) => {
    try {
        if (!req.user || !req.user.user_id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { task_id } = req.params;

        const downloadResponse = await fetch(`${process.env.TASK_API_ENDPOINT}/api/label-excel-bg/${task_id}`, {
            method: "GET",
        });

        if (!downloadResponse.ok) {
            throw new Error("Can't download file");
        }

        const blob = await downloadResponse.blob();

        const file = new File([blob], `${task_id}.xlsx`, { type: blob.type });
        const formData = new FormData();
        formData.append("file", file);

        const upstream = await fetch(`${process.env.SAMPLING_API_ENDPOINT}/api/sample`, {
            method: "POST",
            body: formData,
        });

        if (upstream.ok) {
            await pool.query(`INSERT INTO user_activity_logs (user_name, action, description, created_at) VALUES (?, ?, ?, NOW())`,
                [req.user.user_name, "SUBMIT SAMPLING TASK", `Submitted a new sampling task`]
            )
        }
        for (const [key, value] of upstream.headers.entries()) {
            res.setHeader(key, value);
        }
        upstream.body.pipe(res);

    } catch (err) {
        res.status(500).json({ error: "Get sample failed", message: err.message });
    }
});

taskRouter.post("/sampling", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!req.user || !req.user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(file.path);
        formData.append("file", new Blob([fileBuffer]));

        const upstream = await fetch(`${process.env.SAMPLING_API_ENDPOINT}/api/sample`, {
            method: "POST",
            body: formData,
            
        });

        if (upstream.ok) {
            await pool.query(`INSERT INTO user_activity_logs (user_name, action, description, created_at) VALUES (?, ?, ?, NOW())`,
                [req.user.user_name, "SUBMIT SAMPLING TASK", `Submitted a new sampling task`]
            )
        }
        for (const [key, value] of upstream.headers.entries()) {
            res.setHeader(key, value);
        }
        upstream.body.pipe(res);
    } catch (err) {
        console.log(err)
        res.status(500).json({ error: "Create task failed" });
    }

});



taskRouter.get("/file/:task_id", async (req, res) => {
  try {
    const { task_id } = req.params;
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const url = `${process.env.TASK_API_ENDPOINT}/api/label-excel-bg/${task_id}`;
    const upstream = await fetch(url, { method: "GET" });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).send(text);
    }
    for (const [key, value] of upstream.headers.entries()) {
      res.setHeader(key, value);
    }
    if (upstream.body) {
      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.pipe(res);
    } else {
      throw new Error("Upstream body is null");
    }

  } catch (e) {
    res.status(500).json({ error: "Download file failed" });
  }
});





export default taskRouter;