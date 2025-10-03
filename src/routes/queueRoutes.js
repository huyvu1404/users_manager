import express from "express";
import { taskQueue } from "../queues/queue.js";

const queueRouter = express.Router()

queueRouter.post("/", async (req, res) => {
    try {
        const { task_id } = req.body;
        const user = req.user;
        await taskQueue.add("tasks", {user, task_id });
        return res.status(200).json({ message: "Task pushed to queue" });
    } catch (error) {
        console.error("Error pushing to queue:", error);
        return res.status(500).json({ error: "Failed to push task to queue" });
    }
});

export default queueRouter;
