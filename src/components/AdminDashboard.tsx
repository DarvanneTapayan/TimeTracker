import React, { useState, useEffect } from 'react';
import { Users, FileText, Plus, Edit2, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { Employee, TimeLog } from '../types';
import { formatPHP, cn } from '../lib/utils';

export default function AdminDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<(TimeLog & { employee_name: string, hourly_rate: number })[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRate, setNewRate] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [empRes, logRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/admin/logs')
      ]);
      setEmployees(await empRes.json());
      setLogs(await logRes.json());
    } catch (err) {
      console.error('Failed to fetch admin data', err);
    }
  };

  const handleAddEmployee = async () => {
    if (!newName || !newUsername || !newPassword || !newRate) return;
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newName, 
          username: newUsername, 
          password: newPassword, 
          hourly_rate: parseFloat(newRate) 
        }),
      });
      if (res.ok) {
        setNewName('');
        setNewUsername('');
        setNewPassword('');
        setNewRate('');
        setIsAdding(false);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add employee');
      }
    } catch (err) {
      console.error('Failed to add employee', err);
    }
  };

  const handleUpdateEmployee = async (id: number) => {
    if (!newName || !newUsername || !newPassword || !newRate) return;
    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newName, 
          username: newUsername, 
          password: newPassword, 
          hourly_rate: parseFloat(newRate) 
        }),
      });
      if (res.ok) {
        setEditingId(null);
        setNewName('');
        setNewUsername('');
        setNewPassword('');
        setNewRate('');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to update employee', err);
    }
  };

  const startEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setNewName(emp.name);
    setNewUsername(emp.username);
    setNewPassword(emp.password || '');
    setNewRate(emp.hourly_rate.toString());
  };

  return (
    <div className="space-y-12">
      {/* Employee Management */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">Employee Management</h2>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 font-semibold">ID</th>
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-6 py-4 font-semibold">Username</th>
                <th className="px-6 py-4 font-semibold">Password</th>
                <th className="px-6 py-4 font-semibold">Hourly Rate</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isAdding && (
                <tr className="bg-blue-50/30">
                  <td className="px-6 py-4 text-slate-400 italic">New</td>
                  <td className="px-6 py-4">
                    <input
                      autoFocus
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Full Name"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Username"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Password"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="number"
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newRate}
                      onChange={(e) => setNewRate(e.target.value)}
                      placeholder="PHP Rate"
                    />
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={handleAddEmployee} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"><Check className="w-5 h-5" /></button>
                    <button onClick={() => setIsAdding(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md"><X className="w-5 h-5" /></button>
                  </td>
                </tr>
              )}
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-500 font-mono text-sm">#{emp.id}</td>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {editingId === emp.id ? (
                      <input
                        className="w-full px-3 py-1.5 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    ) : emp.name}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {editingId === emp.id ? (
                      <input
                        className="w-full px-3 py-1.5 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                      />
                    ) : emp.username}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {editingId === emp.id ? (
                      <input
                        className="w-full px-3 py-1.5 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    ) : '••••••••'}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {editingId === emp.id ? (
                      <input
                        type="number"
                        className="w-full px-3 py-1.5 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newRate}
                        onChange={(e) => setNewRate(e.target.value)}
                      />
                    ) : formatPHP(emp.hourly_rate)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {editingId === emp.id ? (
                      <div className="space-x-2">
                        <button onClick={() => handleUpdateEmployee(emp.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"><Check className="w-5 h-5" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md"><X className="w-5 h-5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(emp)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Timesheet Management */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-6 h-6 text-slate-600" />
          <h2 className="text-xl font-bold text-slate-900">Master Timesheet</h2>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 font-semibold">Employee</th>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Time Range</th>
                  <th className="px-6 py-4 font-semibold">Hours</th>
                  <th className="px-6 py-4 font-semibold text-right">Total Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No logs recorded yet.</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{log.employee_name}</div>
                        <div className="text-xs text-slate-400">Rate: {formatPHP(log.hourly_rate)}/hr</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {format(new Date(log.start_time), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {format(new Date(log.start_time), 'hh:mm a')} - {log.end_time ? format(new Date(log.end_time), 'hh:mm a') : '...'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-md text-sm font-medium",
                          log.total_hours && log.total_hours >= 8 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
                        )}>
                          {log.total_hours?.toFixed(2) || '0.00'} hrs
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        {formatPHP(log.daily_pay || 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
