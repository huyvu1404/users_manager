import nodemailer from "nodemailer";

export const sendTaskCompletedEmail = async (user, task_id) => {
 
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,      
      pass: process.env.SMTP_PASS,  
    },
  });

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

  await transporter.sendMail(mailOptions);
};
