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

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use("/api/users", userRouter);
app.use("/api/tasks", authenticateToken, taskRouter);
app.use("/api/activities", authenticateToken, activityRouter);

export default app;
