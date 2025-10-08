import express from "express";
import bcrypt from "bcrypt";
import pool from "../services/mysqlPool.js"
import { authenticateToken, generateToken } from "../middleware/auth.js";
import { sendEmail } from "../services/emailServices.js";
import rateLimit from "express-rate-limit";
import { hashToken, generateResetToken, timingSafeEqualHex } from "../utils/token.js";
import crypto from "crypto";

const requestLimiter = rateLimit({
  windowMs: 60*60*1000,
  max: 5,
  message: "Too many password reset requests, please try later."
});

const userRouter = express.Router()

userRouter.post("/register", authenticateToken,  async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
    }
    const { full_name, user_name, email, role } = req.body;
    try {
        const randomPassword = crypto.randomBytes(6).toString("hex");
        const hashedPassword = await bcrypt.hash(randomPassword, 10);
        const [userResult] = await pool.query(`
            INSERT INTO users (full_name, user_name, password, email, last_active) VALUES (?, ?, ?, ?, NOW())
            `, [full_name, user_name, hashedPassword, email]
        );
        const userId = userResult.insertId;
        await pool.query(`
            INSERT INTO user_roles (user_id, role) VALUES (?, ?)
            `, [userId, role,]
        );
        const { token, tokenHash } = generateResetToken();
        const expiresAt = new Date(Date.now() + 60*60*1000); 
        await pool.query(
        `INSERT INTO password_reset_tokens (user_id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
        [userId, email, tokenHash, expiresAt]
        );

        const resetUrl = `${process.env.UI_APP_ENDPOINT}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

        const mailOptions = {
            from: 'Social Listening Auto Labeling <no-reply>',  
            to: email,
            subject: "Đăng kí tài khoản thành công",
            text: `Truy cập link sau để tạo mật khẩu mới: ${resetUrl}`,
            html: `<p>Truy cập link bên dưới để tạo mật khẩu mới:</p>
                    <p><a href="${resetUrl}">Đặt lại mật khẩu</a></p>`
        };

        await sendEmail(mailOptions)
        await pool.query(`INSERT INTO user_activity_logs (user_name, action, description, created_at) VALUES (?, ?, ?, NOW())`,
            [req.user.user_name, "CREATE USER", `Created user ${user_name}`]
        ) 
        res.json({ message: "User registered", userId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Registration failed: Username or email already exists."})
    }
});


userRouter.post("/login", async (req, res) => {
  const { user_name, password } = req.body;
  
  try {
    const [rows] = await pool.query(`
      SELECT * FROM users WHERE user_name = ?
    `, [user_name]);

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await pool.query(`UPDATE users SET last_active = NOW() WHERE user_name = ?`, [user.user_name]);

    const [role_rows] = await pool.query(`SELECT role FROM user_roles WHERE user_id = ?`, [user.id]);
    const role = role_rows[0]?.role || "user";

    const token = generateToken({ 
        user_id: user.id, 
        user_name: user.user_name, 
        email: user.email, 
        role 
    });
    await pool.query(`INSERT INTO user_activity_logs (user_name, action, created_at) VALUES (?, ?, NOW())`,
        [user.user_name, "LOGIN"]
    )
    res.json({
      message: "Login successful",
      token
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

userRouter.post("/change-password", authenticateToken, async (req, res) => {
    try {
        const { old_password, new_password } = req.body
           const [rows] = await pool.query(`
        SELECT * FROM users WHERE user_name = ?
        `, [req.user.user_name]);

        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const user = rows[0];
        const match = await bcrypt.compare(old_password, user.password);
        if (!match) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const hashedPassword = await bcrypt.hash(new_password, 10);
        await pool.query(`UPDATE users SET password = ? WHERE user_name = ?`, [hashedPassword, req.user.user_name])
        await pool.query(`INSERT INTO user_activity_logs (user_name, action, created_at) VALUES (?, ?, NOW())`,
            [req.user.user_name, "CHANGE PASSWORD"]
        )
        res.json({
            message: "Password changed successfully"
        })
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Change password failed" })
    }
})

userRouter.get("/", authenticateToken, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
    }
    try {
        const [rows] = await pool.query(`
            SELECT 
                u.id, 
                u.full_name, 
                u.user_name, 
                u.last_active, 
                r.role,
                COUNT(t.task_id) AS total_tasks
            FROM users u
            LEFT JOIN user_roles r ON u.id = r.user_id
            LEFT JOIN tasks t ON u.id = t.user_id
            GROUP BY u.id, u.full_name, u.user_name, u.last_active, r.role;
            `
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fetch users failed" });
    }
});


userRouter.delete("/:user_id", authenticateToken, async (req, res) => {
    const { user_id } = req.params;
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
    }
    try {
        const [userRows] = await pool.query(`
            SELECT user_name, role 
            FROM users u
            LEFT JOIN user_roles ur
            ON u.id = ur.user_id
            WHERE u.id = ?
            `,[user_id]
        );
        if (userRows.length === 0) {
            return res.status(401).json({ error: "User not exists" });
        }
        const userToDelete = userRows[0];
        if (userToDelete.role === "admin") {
        return res.status(403).json({ error: "Cannot delete admin" });
        }

        await pool.query("DELETE FROM password_reset_tokens WHERE user_id = ?", [user_id]);
        await pool.query("DELETE FROM user_roles WHERE user_id = ?", [user_id]);
        await pool.query("DELETE FROM users WHERE id = ?", [user_id]);
        await pool.query(`INSERT INTO user_activity_logs (user_name, action, description, created_at) VALUES (?, ?, ?, NOW())`,
            [req.user.user_name, "DELETE USER", `Deleted user ${userToDelete.user_name}`]
        )
        res.json({ message: "User deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete user failed" });
    }
});

userRouter.post("/forgot-password", requestLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });

  try {
    const [users] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (users.length === 0) {
      return res.json({ ok: true });
    }
    const userId = users[0].id;
    const { token, tokenHash } = generateResetToken();
    const expiresAt = new Date(Date.now() + 60*60*1000); 

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
      [userId, email, tokenHash, expiresAt]
    );

    const resetUrl = `${process.env.UI_APP_ENDPOINT}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    const mailOptions = {
        from: 'Social Listening Auto Labeling <no-reply>',  
        to: email,
        subject: "Yêu cầu đặt lại mật khẩu",
        text: `Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu. Truy cập link sau để đặt lại: ${resetUrl}`,
        html: `<p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu. Truy cập link bên dưới để đặt lại:</p>
                <p><a href="${resetUrl}">Đặt lại mật khẩu</a></p>`
    };

    await sendEmail(mailOptions)
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } 
});

userRouter.post("/reset-password", async (req, res) => {
  const {email, token, new_password} = req.body
  if (!email || !token || !new_password) return res.status(400).json({ error: "Missing fields" });
  try {
    const [userRows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (userRows.length === 0) return res.status(400).json({ error: "Invalid token or email" });
    const user = userRows[0]
    const tokenHash = hashToken(token);
    const [rows] = await pool.query(
      `SELECT id, email, token_hash, expires_at, used FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
      [user.id]
    );

    let matched = null;
    for (const r of rows) {
      if (r.used) continue;
      if (new Date(r.expires_at) < new Date()) continue;
      if (timingSafeEqualHex(r.token_hash, tokenHash)) {
        matched = r;
        break;
      }
    }
    if (!matched) return res.status(400).json({ error: "Token invalid or expired" });

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(new_password, saltRounds);
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [passwordHash, user.id]);
    await pool.query("UPDATE password_reset_tokens SET used = TRUE WHERE id = ?", [matched.id]);
    await pool.query(`INSERT INTO user_activity_logs (user_name, action, created_at) VALUES (?, ?, NOW())`,
        [user.user_name, "RESET PASSWORD"]
    )
    return res.json({ ok: true, message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } 
});

userRouter.get("/verify-reset-token", async (req, res) => {
  const { email, token } = req.query;

  const [rows] = await pool.query(
    "SELECT token_hash, expires_at FROM password_reset_tokens WHERE email = ?",
    [email]
  );

  if (rows.length === 0) return res.status(404).json({ message: "Invalid email" });

  const user = rows[0];
  if (user.token_hash !== hashToken(token)) return res.status(400).json({ message: "Invalid token" });
  if (new Date() > user.expires_at) return res.status(400).json({ message: "Token expried" });

  res.json({ message: "Invalid token" });
});


export default userRouter;