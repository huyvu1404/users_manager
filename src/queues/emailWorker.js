import { Worker } from "bullmq";
import { sendTaskCompletedEmail } from "../services/emailServices.js";
import connection from "../services/redisServices.js"

const emailWorker = new Worker("emails", async (job) => {
    try {
        const { user, task_id } = job.data;
        console.log(`Sending email for task ${task_id} → ${user.email}`);
        await sendTaskCompletedEmail(user, task_id);
        console.log(`Email sent for task ${task_id}`);
    } catch (err) {
        console.error(`Error processing task ${task.task_id}:`, err);
    }
}, { connection });

export default emailWorker;
