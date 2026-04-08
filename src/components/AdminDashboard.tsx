import React, { useState, useEffect, useMemo } from 'react';
import { Users, FileText, Plus, Edit2, Check, X, Settings as SettingsIcon, Save, Trash2, Calendar as CalendarIcon, Filter, Download, ArrowUpRight, DollarSign, Clock, FileDown } from 'lucide-react';
import { format, isSameDay, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import Calendar from 'react-calendar';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Employee, TimeLog } from '../types';
import { formatPHP, cn } from '../lib/utils';
import 'react-calendar/dist/Calendar.css';

export default function AdminDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<(TimeLog & { employee_name: string, hourly_rate: number })[]>([]);
  const [settings, setSettings] = useState<{ clock_in_start: string, auto_stop_time: string }>({
    clock_in_start: '22:55',
    auto_stop_time: '07:00'
  });
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRate, setNewRate] = useState('');
  
  // Timesheet Filters
  const [selectedDate, setSelectedDate] = useState<Date | [Date, Date] | null>(new Date());
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');

  useEffect(() => {
    fetchData();
    fetchSettings();
    
    // Poll for updates every 10 seconds for the admin
    const interval = setInterval(() => {
      fetchData();
    }, 10000);
    
    return () => clearInterval(interval);
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

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data && data.clock_in_start) {
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        alert('Settings saved successfully');
      }
    } catch (err) {
      console.error('Failed to save settings', err);
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

  const handleDeleteEmployee = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this employee? This will also delete all their time logs.')) return;
    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete employee');
      }
    } catch (err) {
      console.error('Failed to delete employee', err);
    }
  };

  const startEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setNewName(emp.name);
    setNewUsername(emp.username);
    setNewPassword(emp.password || '');
    setNewRate(emp.hourly_rate.toString());
  };

  // Filtered logs for the timesheet
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const logDate = new Date(log.start_time);
      
      // Date filter
      let dateMatch = true;
      if (selectedDate instanceof Date) {
        dateMatch = isSameDay(logDate, selectedDate);
      } else if (Array.isArray(selectedDate)) {
        dateMatch = isWithinInterval(logDate, { start: selectedDate[0], end: selectedDate[1] });
      }

      // Employee filter
      const employeeMatch = employeeFilter === 'all' || log.employee_id.toString() === employeeFilter;

      return dateMatch && employeeMatch;
    });
  }, [logs, selectedDate, employeeFilter]);

  const stats = useMemo(() => {
    const totalHours = filteredLogs.reduce((acc, log) => acc + (log.total_hours || 0), 0);
    const totalPay = filteredLogs.reduce((acc, log) => acc + (log.daily_pay || 0), 0);
    const logCount = filteredLogs.length;
    return { totalHours, totalPay, logCount };
  }, [filteredLogs]);

  const generateReceipt = () => {
    if (employeeFilter === 'all') {
      alert('Please select a specific employee to generate a receipt.');
      return;
    }

    const employee = employees.find(e => e.id.toString() === employeeFilter);
    if (!employee) return;

    const doc = new jsPDF();
    const now = new Date();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('PAYMENT RECEIPT', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Generated on ${format(now, 'MMMM dd, yyyy hh:mm a')}`, 105, 28, { align: 'center' });
    
    // Employee Info
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(20, 35, 190, 35);
    
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('Employee Details', 20, 45);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Name: ${employee.name}`, 20, 52);
    doc.text(`Hourly Rate: ${formatPHP(employee.hourly_rate)}/hr`, 20, 58);
    
    // Period Summary
    doc.setFont('helvetica', 'bold');
    doc.text('Period Summary', 130, 45);
    doc.setFont('helvetica', 'normal');
    
    const periodText = Array.isArray(selectedDate) 
      ? `${format(selectedDate[0], 'MMM dd')} - ${format(selectedDate[1], 'MMM dd')}`
      : selectedDate ? format(selectedDate, 'MMMM dd, yyyy') : 'All Time';
      
    doc.text(`Period: ${periodText}`, 130, 52);
    doc.text(`Total Hours: ${stats.totalHours.toFixed(2)} hrs`, 130, 58);
    doc.text(`Total Payout: ${formatPHP(stats.totalPay)}`, 130, 64);
    
    // Table
    const tableData = filteredLogs.map(log => [
      format(new Date(log.start_time), 'MMM dd, yyyy'),
      format(new Date(log.start_time), 'hh:mm a'),
      log.end_time ? format(new Date(log.end_time), 'hh:mm a') : 'In Progress',
      `${log.total_hours?.toFixed(2) || '0.00'} hrs`,
      formatPHP(log.daily_pay || 0)
    ]);
    
    autoTable(doc, {
      startY: 75,
      head: [['Date', 'Start', 'End', 'Hours', 'Pay']],
      body: tableData,
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    
    // QR Code if exists on the employee object
    const empWithQr = employee as any;
    if (empWithQr.qr_code) {
      const finalY = (doc as any).lastAutoTable.finalY || 75;
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Method (QR Code)', 20, finalY + 20);
      try {
        doc.addImage(empWithQr.qr_code, 'PNG', 20, finalY + 25, 40, 40);
      } catch (e) {
        console.error('Could not add QR code to PDF', e);
      }
    }
    
    doc.save(`Receipt_${employee.name}_${format(now, 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-12 pb-20">
      {/* System Settings */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center gap-2 mb-6">
          <SettingsIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-slate-900">System Settings</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Clock-In Start Time (24h format)</label>
            <input
              type="time"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              value={settings.clock_in_start}
              onChange={(e) => setSettings({ ...settings, clock_in_start: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Auto-Stop Time (24h format)</label>
            <input
              type="time"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              value={settings.auto_stop_time}
              onChange={(e) => setSettings({ ...settings, auto_stop_time: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              onClick={handleSaveSettings}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all active:scale-95"
            >
              <Save className="w-5 h-5" /> Save Configuration
            </button>
          </div>
        </div>
      </section>

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
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startEdit(emp)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteEmployee(emp.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Timesheet Management */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Master Timesheet</h2>
              <p className="text-slate-500 text-sm">Review and manage employee work hours</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <select 
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
            >
              <option value="all">All Employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            <button 
              onClick={generateReceipt}
              disabled={employeeFilter === 'all'}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all shadow-sm",
                employeeFilter === 'all' 
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              <FileDown className="w-4 h-4" /> Generate Receipt
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <DollarSign className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Payout</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{formatPHP(stats.totalPay)}</div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-green-500" />
              <span>For selected period</span>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Hours</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{stats.totalHours.toFixed(2)} hrs</div>
            <div className="text-xs text-slate-500 mt-1">Across {stats.logCount} logs</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                <Users className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Logs</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{filteredLogs.filter(l => !l.end_time).length}</div>
            <div className="text-xs text-slate-500 mt-1">Currently clocked in</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Calendar Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <CalendarIcon className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900">Select Date</h3>
              </div>
              <Calendar 
                onChange={(val) => setSelectedDate(val as Date | [Date, Date])} 
                value={selectedDate}
                className="rounded-xl border-none"
                selectRange={true}
              />
              <div className="mt-4 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setSelectedDate(new Date())}
                  className="text-sm font-bold text-blue-600 hover:text-blue-700"
                >
                  Reset to Today
                </button>
              </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl">
              <h4 className="font-bold mb-2">Pro Tip</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Select a range on the calendar to see cumulative totals for a week or month.
              </p>
            </div>
          </div>

          {/* Logs Table */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-bold text-slate-700">
                    {Array.isArray(selectedDate) 
                      ? `${format(selectedDate[0], 'MMM dd')} - ${format(selectedDate[1], 'MMM dd')}`
                      : selectedDate ? format(selectedDate, 'MMMM dd, yyyy') : 'All Logs'}
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-400">{filteredLogs.length} entries found</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="px-6 py-4 font-bold">Employee</th>
                      <th className="px-6 py-4 font-bold">Time</th>
                      <th className="px-6 py-4 font-bold">Duration</th>
                      <th className="px-6 py-4 font-bold text-right">Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No logs found for this selection.</td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{log.employee_name}</div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-tighter">Rate: {formatPHP(log.hourly_rate)}/hr</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-600 font-medium">
                              {format(new Date(log.start_time), 'hh:mm a')} - {log.end_time ? format(new Date(log.end_time), 'hh:mm a') : '...'}
                            </div>
                            <div className="text-[10px] text-slate-400">{format(new Date(log.start_time), 'MMM dd')}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-1 rounded-lg text-xs font-bold",
                              log.total_hours && log.total_hours >= 8 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
                            )}>
                              {log.total_hours?.toFixed(2) || '0.00'} hrs
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-black text-slate-900">
                            {formatPHP(log.daily_pay || 0)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
