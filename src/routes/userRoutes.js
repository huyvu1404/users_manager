import express from "express";
import bcrypt from "bcrypt";
import pool from "../services/mysqlPool.js"
import { authenticateToken, generateToken } from "../middleware/auth.js";

const userRouter = express.Router()

userRouter.post("/register", authenticateToken,  async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
    }
    const { full_name, user_name, password, email, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [userResult] = await pool.query(`
            INSERT INTO users (full_name, user_name, password, email, last_active) VALUES (?, ?, ?, ?, NOW())
            `, [full_name, user_name, hashedPassword, email]
        );
        const userId = userResult.insertId;
        await pool.query(`
            INSERT INTO user_roles (user_id, role) VALUES (?, ?)
            `, [userId, role,]
        );
        res.json({ message: "User registered", userId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Registration failed: Username or email already exists."})
    }
});


userRouter.post("/login", async (req, res) => {
  const { user_name, password } = req.body;
  
  try {
    console.log(user_name)
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

    res.json({
      message: "Login successful",
      token
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});


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
        const [roleRows] = await pool.query(
        "SELECT role FROM user_roles WHERE user_id = ?",
        [user_id]
        );
        const roleToDelete = roleRows[0]?.role;
        if (roleToDelete === "admin") {
        return res.status(403).json({ error: "Cannot delete admin" });
        }
        await pool.query("DELETE FROM user_roles WHERE user_id = ?", [user_id]);
        await pool.query("DELETE FROM users WHERE id = ?", [user_id]);
        res.json({ message: "User deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete user failed" });
    }
});

export default userRouter;