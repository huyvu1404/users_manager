import express from "express";
import cors from "cors";

import userRouter from "./routes/userRoutes.js";
import taskRouter from "./routes/taskRoutes.js";
import activityRouter from "./routes/activityRoutes.js";
import { authenticateToken } from "./middleware/auth.js";

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);

app.use("/api/users", userRouter);
app.use("/api/tasks", authenticateToken, taskRouter);
app.use("/api/activities", authenticateToken, activityRouter);

export default app;
