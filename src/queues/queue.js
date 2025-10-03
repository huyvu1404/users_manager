import { Queue } from "bullmq";
import connection from "../services/redisServices.js"

export const taskQueue = new Queue("tasks", {
  connection, 
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
  },
});

export const emailQueue = new Queue("emails", { 
  connection, 
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
  },
});
