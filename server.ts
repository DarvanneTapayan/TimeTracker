import "dotenv/config";
import express from "express";
import path from "path";
import { query, queryOne, initDb } from "./src/db.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize database (with error handling)
let dbInitialized = false;
let initError: string | null = null;

const initialize = async () => {
  try {
    console.log("Initializing database...");
    await initDb();
    dbInitialized = true;
    initError = null;
    console.log("Database initialized successfully");
  } catch (err: any) {
    initError = err.message;
    console.error("Failed to initialize database:", err);
  }
};

// API Routes

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    dbInitialized, 
    initError,
    env: process.env.NODE_ENV,
    hasPostgresUrl: !!process.env.POSTGRES_URL 
  });
});

// Login
app.post("/api/login", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const { username, password } = req.body;
    const cleanUsername = username?.trim();
    const cleanPassword = password?.trim();
    
    console.log(`Login attempt for: "${cleanUsername}"`);
    
    // Check for user first to provide better debug info
    const user = await queryOne('SELECT id, name, username, password, role, hourly_rate FROM employees WHERE LOWER(username) = LOWER(?)', [cleanUsername]);
    
    if (user) {
      if (user.password === cleanPassword) {
        console.log(`Login successful for: ${cleanUsername}`);
        const activeLog = await queryOne('SELECT id, start_time FROM time_logs WHERE employee_id = ? AND end_time IS NULL LIMIT 1', [user.id]);
        
        // Don't send password back to client
        const { password: _, ...userWithoutPassword } = user;
        res.json({ ...userWithoutPassword, active_log: activeLog || null });
      } else {
        console.log(`Password mismatch for: ${cleanUsername}`);
        res.status(401).json({ error: "Invalid credentials" });
      }
    } else {
      console.log(`User not found: ${cleanUsername}`);
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (err) {
    console.error("Login error:", err);
    next(err);
  }
});

// Get all employees (Admin only)
app.get("/api/employees", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const employees = await query(`
      SELECT id, name, username, password, role, hourly_rate
      FROM employees
      WHERE role = 'employee'
    `);
    res.json(employees);
  } catch (err) {
    next(err);
  }
});

// Create employee
app.post("/api/employees", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const { name, username, password, hourly_rate } = req.body;
    const rows = await query('INSERT INTO employees (name, username, password, role, hourly_rate) VALUES (?, ?, ?, ?, ?)', [name, username, password, 'employee', hourly_rate]) as any[];
    res.json({ id: rows[0].id });
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint failed') || err.message.includes('unique constraint')) {
      res.status(400).json({ error: "Username already exists" });
    } else {
      next(err);
    }
  }
});

// Update employee
app.put("/api/employees/:id", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const { name, username, password, hourly_rate } = req.body;
    await query('UPDATE employees SET name = ?, username = ?, password = ?, hourly_rate = ? WHERE id = ?', [name, username, password, hourly_rate, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Delete employee
app.delete("/api/employees/:id", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const { id } = req.params;
    await query('DELETE FROM time_logs WHERE employee_id = ?', [id]);
    await query('DELETE FROM employees WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Settings
app.get("/api/settings", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const settings = await query('SELECT * FROM settings') as any[];
    const result = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {
      clock_in_start: '22:55',
      auto_stop_time: '07:00'
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.put("/api/settings", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const { clock_in_start, auto_stop_time } = req.body;
    if (clock_in_start) {
      await query('DELETE FROM settings WHERE key = ?', ['clock_in_start']);
      await query('INSERT INTO settings (key, value) VALUES (?, ?)', ['clock_in_start', clock_in_start]);
    }
    if (auto_stop_time) {
      await query('DELETE FROM settings WHERE key = ?', ['auto_stop_time']);
      await query('INSERT INTO settings (key, value) VALUES (?, ?)', ['auto_stop_time', auto_stop_time]);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
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
    return nowMin >= startMin || nowMin <= endMin;
  }
}

// Clock In
app.post("/api/clock-in", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const { employee_id } = req.body;
    const now = new Date();
    
    const settings = await query('SELECT * FROM settings') as any[];
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {
      clock_in_start: '22:55',
      auto_stop_time: '07:00'
    });
    
    if (!isTimeInRange(now, config.clock_in_start, config.auto_stop_time)) {
      return res.status(400).json({ 
        error: `Clock-in is only allowed between ${config.clock_in_start} and ${config.auto_stop_time}.` 
      });
    }

    const startTime = now.toISOString();
    const existing = await queryOne('SELECT id FROM time_logs WHERE employee_id = ? AND end_time IS NULL', [employee_id]);
    if (existing) {
      return res.status(400).json({ error: "Already clocked in" });
    }

    const result = await query('INSERT INTO time_logs (employee_id, start_time, last_heartbeat) VALUES (?, ?, ?)', [employee_id, startTime, startTime]) as any[];
    res.json({ id: result[0].id, start_time: startTime });
  } catch (err) {
    next(err);
  }
});

// Heartbeat
app.post("/api/heartbeat", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const { employee_id } = req.body;
    const now = new Date().toISOString();
    
    // Update heartbeat for active log
    await query('UPDATE time_logs SET last_heartbeat = ? WHERE employee_id = ? AND end_time IS NULL', [now, employee_id]);
    
    // Trigger auto-stop check for everyone
    await autoStopStaleLogs();
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

async function autoStopStaleLogs() {
  const now = new Date();
  const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  
  // Find logs that haven't had a heartbeat in 5 minutes
  const staleLogs = await query(`
    SELECT l.*, e.hourly_rate 
    FROM time_logs l
    JOIN employees e ON l.employee_id = e.id
    WHERE l.end_time IS NULL 
    AND l.last_heartbeat < ?
  `, [fiveMinsAgo]) as any[];
  
  for (const log of staleLogs) {
    console.log(`Auto-stopping stale log for employee ${log.employee_id}`);
    
    // Use last_heartbeat as the end time (or now, but last_heartbeat is more accurate to when they were actually there)
    const endTimeDate = new Date(log.last_heartbeat);
    const startTimeDate = new Date(log.start_time);
    
    const durationHours = (endTimeDate.getTime() - startTimeDate.getTime()) / (1000 * 60 * 60);
    const cappedHours = Math.max(0, Math.min(durationHours, 8));
    const dailyPay = cappedHours * log.hourly_rate;
    
    await query(`
      UPDATE time_logs 
      SET end_time = ?, total_hours = ?, daily_pay = ? 
      WHERE id = ?
    `, [endTimeDate.toISOString(), cappedHours, dailyPay, log.id]);
  }
}

// Clock Out
app.post("/api/clock-out", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const { employee_id } = req.body;
    let endTimeDate = new Date();
    
    const activeLog = await queryOne('SELECT * FROM time_logs WHERE employee_id = ? AND end_time IS NULL', [employee_id]) as any;
    if (!activeLog) {
      return res.status(400).json({ error: "Not clocked in" });
    }

    const settings = await query('SELECT * FROM settings') as any[];
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {
      clock_in_start: '22:55',
      auto_stop_time: '07:00'
    });
    const [stopH, stopM] = config.auto_stop_time.split(':').map(Number);

    const start = new Date(activeLog.start_time);
    const stopTime = new Date(start);
    const startH = start.getHours();
    if (startH >= stopH) {
      stopTime.setDate(stopTime.getDate() + 1);
    }
    stopTime.setHours(stopH, stopM, 0, 0);

    if (endTimeDate > stopTime) {
      endTimeDate = stopTime;
    }

    const endTime = endTimeDate.toISOString();
    const employee = await queryOne('SELECT hourly_rate FROM employees WHERE id = ?', [employee_id]) as any;
    
    const startTimeMs = start.getTime();
    const endTimeMs = endTimeDate.getTime();
    const durationHours = (endTimeMs - startTimeMs) / (1000 * 60 * 60);
    const cappedHours = Math.min(durationHours, 8);
    const dailyPay = cappedHours * employee.hourly_rate;

    await query(`
      UPDATE time_logs 
      SET end_time = ?, total_hours = ?, daily_pay = ? 
      WHERE id = ?
    `, [endTime, cappedHours, dailyPay, activeLog.id]);

    res.json({ success: true, total_hours: cappedHours, daily_pay: dailyPay, end_time: endTime });
  } catch (err) {
    next(err);
  }
});

// Get logs for employee
app.get("/api/logs/:employeeId", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const logs = await query(`
      SELECT * FROM time_logs 
      WHERE employee_id = ? 
      ORDER BY start_time DESC
      LIMIT 50
    `, [req.params.employeeId]);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

// Admin: Get all logs
app.get("/api/admin/logs", async (req, res, next) => {
  try {
    if (!dbInitialized) await initialize();
    const logs = await query(`
      SELECT l.*, e.name as employee_name, e.hourly_rate
      FROM time_logs l
      JOIN employees e ON l.employee_id = e.id
      ORDER BY l.start_time DESC
    `);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

// Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("API Error:", err);
  res.status(500).json({ 
    error: "Internal server error", 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
  });
});

// Vite middleware for development
const startVite = async () => {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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
};

if (process.env.NODE_ENV !== "production") {
  startVite().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      initialize();
    });
  });
} else {
  // On Vercel, we don't call listen, we just export the app
  startVite();
  initialize();
}

export default app;
