import nodemailer from "nodemailer";

export const sendEmail = async (mailOptions) => {
 
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,      
      pass: process.env.SMTP_PASS,  
    },
  });

  await transporter.sendMail(mailOptions);
};
