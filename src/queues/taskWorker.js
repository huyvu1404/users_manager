import { Worker } from "bullmq";
import connection from "../services/redisServices.js"
import { taskQueue, emailQueue } from "../queues/queue.js"

async function checkExternalStatus(task_id) {
    const externalRes = await fetch(`${process.env.TASK_API_ENDPOINT}/api/label-excel-bg`)
        .then(r => r.json());
    const externalTasks = externalRes.tasks || [];
    const task = externalTasks.find(task => task.task_id === task_id)
    const status = (task?.status || "").toLowerCase()
    return status
}

const taskWorker = new Worker("tasks", async (job) => {
  const task = job.data;
  try {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log(`Processing task ${task.task_id} for user ${task.user}`);
    const status = await checkExternalStatus(task.task_id);
    console.log(`Status: ${status}`)
    if (status === "completed") {
      await emailQueue.add("emails", {
        user: task.user,
        task_id: task.task_id,
      });
    } else if (status === "running") {
      console.log(`Task ${task.task_id} still running, requeue`);
      await taskQueue.add("tasks", task, { delay: process.env.DELAY * 60 * 1000 }); 
    }
  } catch (err) {
    console.error(`Error processing task ${task.task_id}:`, err);
  }
},{ connection });

export default taskWorker

