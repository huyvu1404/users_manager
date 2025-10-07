import { Worker } from "bullmq";
import { sendEmail } from "../services/emailServices.js";
import connection from "../services/redisServices.js"

const emailWorker = new Worker("emails", async (job) => {
    try {

        const { user, task_id } = job.data;
        const mailOptions = {
            from: 'Social Listening Auto Labeling <no-reply>',
            to: user.email,
            subject: `Your task ${task_id} has been completed`,
            html: `
            <h2>Task Completed</h2>
            <p>Hello ${user.user_name},</p>
            <p>Your task has been successfully <b>completed</b>.</p>
            <p>You can download the result from the monitoring page.</p>
            <hr/>
            <small>Task ID: ${task_id}</small>
            `,
        };
        console.log(`Sending email for task ${task_id} → ${user.email}`);
        await sendEmail(mailOptions);
        console.log(`Email sent for task ${task_id}`);
    } catch (err) {
        console.error(`Error processing task ${task.task_id}:`, err);
    }
}, { connection });

export default emailWorker;
