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

  // Settings
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare('SELECT * FROM settings').all() as any[];
    const result = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
    res.json(result);
  });

  app.put("/api/settings", (req, res) => {
    const { clock_in_start, auto_stop_time } = req.body;
    if (clock_in_start) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('clock_in_start', clock_in_start);
    if (auto_stop_time) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('auto_stop_time', auto_stop_time);
    res.json({ success: true });
  });

  function isTimeInRange(now: Date, startStr: string, endStr: string) {
    const [sH, sM] = startStr.split(':').map(Number);
    const [eH, eM] = endStr.split(':').map(Number);
    const nowH = now.getHours();
    const nowM = now.getMinutes();

    const startMin = sH * 60 + sM;
    const endMin = eH * 60 + eM;
    const nowMin = nowH * 60 + nowM;

    if (startMin <= endMin) {
      return nowMin >= startMin && nowMin <= endMin;
    } else {
      // Wraps around midnight (e.g., 22:55 to 07:00)
      return nowMin >= startMin || nowMin <= endMin;
    }
  }

  // Clock In
  app.post("/api/clock-in", (req, res) => {
    const { employee_id } = req.body;
    const now = new Date();
    
    const settings = db.prepare('SELECT * FROM settings').all() as any[];
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
    
    if (!isTimeInRange(now, config.clock_in_start, config.auto_stop_time)) {
      return res.status(400).json({ 
        error: `Clock-in is only allowed between ${config.clock_in_start} and ${config.auto_stop_time}.` 
      });
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

    const settings = db.prepare('SELECT * FROM settings').all() as any[];
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
    const [stopH, stopM] = config.auto_stop_time.split(':').map(Number);

    // Auto-stop logic
    const start = new Date(activeLog.start_time);
    const stopTime = new Date(start);
    
    const startH = start.getHours();
    if (startH >= stopH) {
      // Started before midnight or after midnight but before stop time
      // If started at 23:00 and stop is 07:00, stop is next day
      stopTime.setDate(stopTime.getDate() + 1);
    }
    stopTime.setHours(stopH, stopM, 0, 0);

    if (endTimeDate > stopTime) {
      endTimeDate = stopTime;
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
