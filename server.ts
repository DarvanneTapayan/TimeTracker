import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import db from "./src/db.js";
import { calculateDailyPay } from "./src/lib/utils.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // Login
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT id, name, username, role, hourly_rate FROM employees WHERE username = ? AND password = ?').get(username, password) as any;
    
    if (user) {
      const activeLog = db.prepare('SELECT id, start_time FROM time_logs WHERE employee_id = ? AND end_time IS NULL LIMIT 1').get(user.id);
      res.json({ ...user, active_log: activeLog || null });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Get all employees (Admin only)
  app.get("/api/employees", (req, res) => {
    const employees = db.prepare(`
      SELECT id, name, username, password, role, hourly_rate
      FROM employees
      WHERE role = 'employee'
    `).all();
    res.json(employees);
  });

  // Create employee
  app.post("/api/employees", (req, res) => {
    const { name, username, password, hourly_rate } = req.body;
    try {
      const result = db.prepare('INSERT INTO employees (name, username, password, role, hourly_rate) VALUES (?, ?, ?, ?, ?)')
        .run(name, username, password, 'employee', hourly_rate);
      res.json({ id: result.lastInsertRowid });
    } catch (err: any) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: "Username already exists" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Update employee
  app.put("/api/employees/:id", (req, res) => {
    const { name, username, password, hourly_rate } = req.body;
    db.prepare('UPDATE employees SET name = ?, username = ?, password = ?, hourly_rate = ? WHERE id = ?')
      .run(name, username, password, hourly_rate, req.params.id);
    res.json({ success: true });
  });

  // Clock In
  app.post("/api/clock-in", (req, res) => {
    const { employee_id } = req.body;
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Restriction: Only at 10:55 PM (22:55)
    // Allowing a small window (e.g., 10:55 PM to 11:15 PM) for practicality
    const isCorrectTime = (hours === 22 && minutes >= 55) || (hours === 23);
    
    if (!isCorrectTime) {
      return res.status(400).json({ error: "Clock-in is only allowed starting at 10:55 PM." });
    }

    const startTime = now.toISOString();
    
    // Check if already clocked in
    const existing = db.prepare('SELECT id FROM time_logs WHERE employee_id = ? AND end_time IS NULL').get(employee_id);
    if (existing) {
      return res.status(400).json({ error: "Already clocked in" });
    }

    const result = db.prepare('INSERT INTO time_logs (employee_id, start_time) VALUES (?, ?)').run(employee_id, startTime);
    res.json({ id: result.lastInsertRowid, start_time: startTime });
  });

  // Clock Out
  app.post("/api/clock-out", (req, res) => {
    const { employee_id } = req.body;
    let endTimeDate = new Date();
    
    const activeLog = db.prepare('SELECT * FROM time_logs WHERE employee_id = ? AND end_time IS NULL').get(employee_id) as any;
    if (!activeLog) {
      return res.status(400).json({ error: "Not clocked in" });
    }

    // Auto-stop at 7:00 AM logic
    // If current time is past 7:00 AM of the day following the start_time (or same day if they started very early)
    const start = new Date(activeLog.start_time);
    const sevenAM = new Date(start);
    if (start.getHours() >= 22) {
      // Started at night, 7 AM is the next day
      sevenAM.setDate(sevenAM.getDate() + 1);
    }
    sevenAM.setHours(7, 0, 0, 0);

    if (endTimeDate > sevenAM) {
      endTimeDate = sevenAM;
    }

    const endTime = endTimeDate.toISOString();
    const employee = db.prepare('SELECT hourly_rate FROM employees WHERE id = ?').get(employee_id) as any;
    
    const startTimeMs = start.getTime();
    const endTimeMs = endTimeDate.getTime();
    const durationHours = (endTimeMs - startTimeMs) / (1000 * 60 * 60);
    const cappedHours = Math.min(durationHours, 8);
    const dailyPay = cappedHours * employee.hourly_rate;

    db.prepare(`
      UPDATE time_logs 
      SET end_time = ?, total_hours = ?, daily_pay = ? 
      WHERE id = ?
    `).run(endTime, cappedHours, dailyPay, activeLog.id);

    res.json({ success: true, total_hours: cappedHours, daily_pay: dailyPay, end_time: endTime });
  });

  // Get logs for employee (current week)
  app.get("/api/logs/:employeeId", (req, res) => {
    const logs = db.prepare(`
      SELECT * FROM time_logs 
      WHERE employee_id = ? 
      AND datetime(start_time) >= datetime('now', '-7 days')
      ORDER BY start_time DESC
    `).all(req.params.employeeId);
    res.json(logs);
  });

  // Admin: Get all logs
  app.get("/api/admin/logs", (req, res) => {
    const logs = db.prepare(`
      SELECT l.*, e.name as employee_name, e.hourly_rate
      FROM time_logs l
      JOIN employees e ON l.employee_id = e.id
      ORDER BY l.start_time DESC
    `).all();
    res.json(logs);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
