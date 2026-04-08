import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Clock, LogOut, Play, Square, History, TrendingUp, Calendar, DollarSign, ArrowUpRight, CheckCircle2, AlertCircle, Settings, QrCode, Upload, X as XIcon } from 'lucide-react';
import { format, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(employee.qr_code || null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchSettings();
    
    // Poll for updates every 30 seconds to keep logs in sync
    const interval = setInterval(() => {
      fetchLogs();
      fetchSettings();
    }, 30000);
    
    return () => clearInterval(interval);
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

      // Heartbeat every 30 seconds
      const heartbeatInterval = setInterval(async () => {
        try {
          const res = await fetchWithAuth('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (res && !res.ok) {
            // If heartbeat fails (e.g. server auto-stopped the log), refresh to show correct state
            onRefresh();
          }
        } catch (err) {
          console.error('Heartbeat failed', err);
        }
      }, 30000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        clearInterval(heartbeatInterval);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedTime(0);
    }
  }, [employee.active_log, settings.auto_stop_time, employee.id]);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    try {
      const savedUser = localStorage.getItem('peso_user');
      if (!savedUser) throw new Error('No saved user');
      const parsed = JSON.parse(savedUser);
      const token = parsed?.session_token || '';
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'x-session-token': token,
        },
      });
    } catch (e) {
      console.error('Auth fetch failed', e);
      throw e;
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetchWithAuth(`/api/logs/${employee.id}`);
      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLogs(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetchWithAuth('/api/settings');
      if (res && res.ok) {
        const data = await res.json();
        if (data && data.clock_in_start) {
          setSettings(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  };

  const handleClockIn = async () => {
    try {
      const res = await fetchWithAuth('/api/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        await onRefresh();
        await fetchLogs();
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
      const res = await fetchWithAuth('/api/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        await onRefresh();
        await fetchLogs();
      } else {
        const data = await res.json();
        alert(data.error || 'Clock out failed');
      }
    } catch (err) {
      console.error('Clock out failed', err);
      alert('Connection error. Please try again.');
    }
  };

  const safeFormat = (dateStr: string | undefined, formatStr: string, fallback: string = '...') => {
    if (!dateStr) return fallback;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return fallback;
    try {
      return format(date, formatStr);
    } catch (e) {
      return fallback;
    }
  };

  const formatElapsedTime = (ms: number) => {
    if (isNaN(ms) || ms < 0) return "00:00:00";
    // Cap at 8 hours
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours >= 8) return "08:00:00 (Capped)";
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isClockInAllowed = () => {
    if (!settings || !settings.clock_in_start || !settings.auto_stop_time) return false;
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

  const weeklyStats = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });

    const safeLogs = Array.isArray(logs) ? logs : [];
    const weeklyLogs = safeLogs.filter(log => 
      isWithinInterval(new Date(log.start_time), { start, end })
    );

    const totalHours = weeklyLogs.reduce((acc, log) => acc + (log.total_hours || 0), 0);
    const totalPay = weeklyLogs.reduce((acc, log) => acc + (log.daily_pay || 0), 0);
    
    return { totalHours, totalPay, count: weeklyLogs.length, logs: weeklyLogs };
  }, [logs]);

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        setQrCode(base64String);
        try {
          await fetchWithAuth(`/api/employees/${employee.id}/qr`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qr_code: base64String }),
          });
        } catch (err) {
          console.error('Failed to save QR code', err);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header with Settings Toggle */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <Clock className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Employee Portal</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-2.5 rounded-xl transition-all shadow-sm",
              showSettings ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900">Payment Settings</h3>
                </div>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Upload your Maribank, GCash, or Maya QR code. This will be included in your generated receipts for easier payment processing.
                  </p>
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-500 mb-2" />
                      <p className="text-sm text-slate-500 font-medium">Click to upload QR Code</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleQrUpload} />
                  </label>
                </div>
                
                <div className="flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  {qrCode ? (
                    <div className="relative group">
                      <img src={qrCode} alt="QR Code" className="w-40 h-40 object-contain rounded-lg shadow-md" />
                      <button 
                        onClick={() => { setQrCode(null); /* Also update DB */ }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center space-y-2">
                      <QrCode className="w-12 h-12 text-slate-200 mx-auto" />
                      <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No QR Code Uploaded</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Weekly Earnings</span>
          </div>
          <div className="text-3xl font-black text-slate-900">{formatPHP(weeklyStats.totalPay)}</div>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-green-500" />
            Estimated for this week
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hours Logged</span>
          </div>
          <div className="text-3xl font-black text-slate-900">{weeklyStats.totalHours.toFixed(1)}h</div>
          <p className="text-xs text-slate-500 mt-2">Across {weeklyStats.count} shifts this week</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hourly Rate</span>
          </div>
          <div className="text-3xl font-black text-slate-900">{formatPHP(employee.hourly_rate)}</div>
          <p className="text-xs text-slate-500 mt-2">Standard employee rate</p>
        </motion.div>
      </div>

      {/* Status Card */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className={cn(
          "rounded-[2.5rem] p-1 shadow-2xl transition-all duration-500",
          employee.active_log 
            ? "bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-200" 
            : "bg-white border border-slate-200 shadow-slate-100"
        )}
      >
        <div className={cn(
          "rounded-[2.4rem] p-8 md:p-10",
          employee.active_log ? "bg-transparent text-white" : "bg-white text-slate-900"
        )}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest",
                  employee.active_log ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {employee.active_log ? "Currently Working" : "Off Duty"}
                </div>
                {employee.active_log && (
                  <span className="flex h-2 w-2 rounded-full bg-green-400 animate-ping" />
                )}
              </div>
              
              <div>
                <h2 className="text-4xl font-black tracking-tight">
                  {employee.active_log ? "You're on the clock" : `Hello, ${employee.name.split(' ')[0]}!`}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                  <p className={cn(
                    "text-lg font-medium",
                    employee.active_log ? "text-blue-100" : "text-slate-500"
                  )}>
                    {employee.active_log 
                      ? `Started at ${safeFormat(employee.active_log.start_time, 'hh:mm a')}`
                      : isClockInAllowed() 
                        ? "Ready to start your shift?" 
                        : `Next shift available at ${settings.clock_in_start}`}
                  </p>
                  <div className={cn(
                    "h-1 w-1 rounded-full",
                    employee.active_log ? "bg-blue-300" : "bg-slate-300"
                  )} />
                  <p className={cn(
                    "text-sm font-bold font-mono",
                    employee.active_log ? "text-blue-200" : "text-slate-400"
                  )}>
                    {format(currentTime, 'hh:mm:ss a')}
                  </p>
                </div>
              </div>

              {!employee.active_log && !isClockInAllowed() && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-xl w-fit">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs font-bold">Outside allowed hours</span>
                </div>
              )}
            </div>
            
            <div className="flex flex-col items-center lg:items-end gap-6">
              {employee.active_log && (
                <div className="text-center lg:text-right">
                  <div className="text-6xl md:text-7xl font-mono font-black tracking-tighter mb-2">
                    {formatElapsedTime(elapsedTime)}
                  </div>
                  <div className="text-blue-200 text-sm font-bold uppercase tracking-widest">Elapsed Time</div>
                </div>
              )}
              
              <div className="flex gap-4 w-full lg:w-auto">
                {!employee.active_log ? (
                  <button
                    onClick={handleClockIn}
                    disabled={!isClockInAllowed()}
                    className={cn(
                      "flex-1 lg:flex-none flex items-center justify-center gap-3 px-10 py-5 rounded-2xl font-black text-lg transition-all active:scale-95 shadow-xl",
                      isClockInAllowed()
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                    )}
                  >
                    <Play className="w-6 h-6 fill-current" /> Start Shift
                  </button>
                ) : (
                  <button
                    onClick={handleClockOut}
                    className="flex-1 lg:flex-none flex items-center justify-center gap-3 px-10 py-5 rounded-2xl font-black text-lg transition-all active:scale-95 shadow-xl bg-white text-blue-600 hover:bg-blue-50"
                  >
                    <Square className="w-6 h-6 fill-current" /> Finish Work
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Recent Logs Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
              <History className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-black text-slate-900">Recent Activity</h3>
          </div>
          <button 
            onClick={fetchLogs}
            className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
          >
            Refresh Logs
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence mode="popLayout">
            {(!Array.isArray(logs) || logs.length === 0) ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center"
              >
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-slate-300" />
                </div>
                <h4 className="font-bold text-slate-900">No logs yet</h4>
                <p className="text-slate-500 text-sm">Your shift history will appear here.</p>
              </motion.div>
            ) : (
              logs.map((log, index) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group bg-white rounded-3xl border border-slate-200 p-6 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-50 transition-all duration-300"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                        log.end_time ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
                      )}>
                        {log.end_time ? <CheckCircle2 className="w-7 h-7" /> : <Clock className="w-7 h-7 animate-pulse" />}
                      </div>
                      <div>
                        <div className="text-lg font-black text-slate-900">
                          {safeFormat(log.start_time, 'EEEE, MMMM dd')}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 font-medium">
                          <span>{safeFormat(log.start_time, 'hh:mm a')}</span>
                          <span>→</span>
                          <span>{log.end_time ? safeFormat(log.end_time, 'hh:mm a') : 'In Progress'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-10 border-t md:border-t-0 pt-4 md:pt-0">
                      <div className="text-center md:text-right">
                        <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Duration</div>
                        <div className={cn(
                          "text-xl font-black",
                          log.total_hours && log.total_hours >= 8 ? "text-amber-600" : "text-slate-900"
                        )}>
                          {log.total_hours?.toFixed(2) || '0.00'} <span className="text-xs">hrs</span>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Earnings</div>
                        <div className="text-xl font-black text-blue-600">
                          {formatPHP(log.daily_pay || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
