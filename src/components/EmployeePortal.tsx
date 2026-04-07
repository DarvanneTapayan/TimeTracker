import React, { useState, useEffect, useRef } from 'react';
import { Clock, LogOut, Play, Square, History } from 'lucide-react';
import { format } from 'date-fns';
import { EmployeeWithStatus, TimeLog } from '../types';
import { formatPHP, cn } from '../lib/utils';

interface EmployeePortalProps {
  employee: EmployeeWithStatus;
  onRefresh: () => void;
}

export default function EmployeePortal({ employee, onRefresh }: EmployeePortalProps) {
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [settings, setSettings] = useState<{ clock_in_start: string, auto_stop_time: string }>({
    clock_in_start: '22:55',
    auto_stop_time: '07:00'
  });
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchLogs();
    fetchSettings();
  }, [employee.id]);

  useEffect(() => {
    if (employee.active_log) {
      const start = new Date(employee.active_log.start_time).getTime();
      const updateTimer = () => {
        const now = new Date();
        
        // Calculate stop time of the relevant day
        if (!settings.auto_stop_time) return;
        const [stopH, stopM] = settings.auto_stop_time.split(':').map(Number);
        const stopTime = new Date(start);
        if (new Date(start).getHours() >= stopH) {
          stopTime.setDate(stopTime.getDate() + 1);
        }
        stopTime.setHours(stopH, stopM, 0, 0);

        const currentMs = now.getTime();
        const limitMs = stopTime.getTime();
        
        const effectiveNow = Math.min(currentMs, limitMs);
        setElapsedTime(effectiveNow - start);
      };
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [employee.active_log, settings.auto_stop_time]);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/logs/${employee.id}`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
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

  const handleClockIn = async () => {
    try {
      const res = await fetch('/api/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      const data = await res.json();
      if (res.ok) {
        onRefresh();
      } else {
        alert(data.error || 'Clock in failed');
      }
    } catch (err) {
      console.error('Clock in failed', err);
      alert('Connection error. Please try again.');
    }
  };

  const handleClockOut = async () => {
    try {
      const res = await fetch('/api/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      if (res.ok) {
        onRefresh();
        fetchLogs();
      } else {
        const data = await res.json();
        alert(data.error || 'Clock out failed');
      }
    } catch (err) {
      console.error('Clock out failed', err);
      alert('Connection error. Please try again.');
    }
  };

  const formatElapsedTime = (ms: number) => {
    // Cap at 8 hours
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours >= 8) return "08:00:00 (Capped)";
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isClockInAllowed = () => {
    if (!settings.clock_in_start || !settings.auto_stop_time) return false;
    const now = new Date();
    const [sH, sM] = settings.clock_in_start.split(':').map(Number);
    const [eH, eM] = settings.auto_stop_time.split(':').map(Number);
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
  };

  return (
    <div className="space-y-8">
      {/* Status Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Welcome, {employee.name}</h2>
            <p className="text-slate-500">Hourly Rate: {formatPHP(employee.hourly_rate)}</p>
            {!employee.active_log && (
              <p className={cn(
                "text-sm mt-2 font-medium",
                isClockInAllowed() ? "text-green-600" : "text-amber-600"
              )}>
                {isClockInAllowed() 
                  ? "✓ Clock-in is currently open." 
                  : `ⓘ Clock-in is allowed from ${settings.clock_in_start} to ${settings.auto_stop_time}.`}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {employee.active_log ? (
              <div className="flex flex-col items-end mr-4">
                <span className="text-sm font-medium text-blue-600 animate-pulse flex items-center gap-1">
                  <Clock className="w-4 h-4" /> Active Session
                </span>
                <span className="text-4xl font-mono font-bold text-slate-900">
                  {formatElapsedTime(elapsedTime)}
                </span>
              </div>
            ) : (
              <span className="text-slate-400 font-medium mr-4">Not Clocked In</span>
            )}
            
            <div className="flex gap-3">
              {!employee.active_log ? (
                <button
                  onClick={handleClockIn}
                  disabled={!isClockInAllowed()}
                  className={cn(
                    "flex items-center gap-2 px-8 py-4 rounded-xl font-bold transition-all active:scale-95 shadow-lg",
                    isClockInAllowed()
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  )}
                >
                  <Play className="w-5 h-5 fill-current" /> Clock In
                </button>
              ) : (
                <button
                  onClick={handleClockOut}
                  className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold transition-all active:scale-95 shadow-lg bg-red-500 hover:bg-red-600 text-white shadow-red-200"
                >
                  <Square className="w-5 h-5 fill-current" /> Stop / Clock Out
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Logs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="font-bold text-slate-700">Recent Logs (Past 7 Days)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Start</th>
                <th className="px-6 py-4 font-semibold">End</th>
                <th className="px-6 py-4 font-semibold">Hours (Capped)</th>
                <th className="px-6 py-4 font-semibold text-right">Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                    No logs found for this week.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-700">
                      {format(new Date(log.start_time), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {format(new Date(log.start_time), 'hh:mm a')}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {log.end_time ? format(new Date(log.end_time), 'hh:mm a') : '--:--'}
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
    </div>
  );
}
