export interface Employee {
  id: number;
  name: string;
  username: string;
  password?: string;
  role: 'admin' | 'employee';
  hourly_rate: number;
}

export interface TimeLog {
  id: number;
  employee_id: number;
  start_time: string;
  end_time: string | null;
  total_hours: number | null;
  daily_pay: number | null;
}

export interface EmployeeWithStatus extends Employee {
  active_log: { id: number; start_time: string } | null;
  qr_code?: string;
}
