import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, Clock, ChevronRight, LogOut, Lock, User, Settings, Moon, Sun } from 'lucide-react';
import { EmployeeWithStatus } from './types';
import EmployeePortal from './components/EmployeePortal';
import AdminDashboard from './components/AdminDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import { cn } from './lib/utils';

type View = 'employee' | 'admin';

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function DualClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (tz: string) => time.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
  const formatDate = (tz: string) => time.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });

  return (
    <div className="px-4 py-4 mb-4 bg-slate-900 rounded-2xl border border-slate-800">
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Manila, PH</span>
            <span className="text-[10px] font-bold text-blue-400">GMT+8</span>
          </div>
          <div className="text-lg font-mono font-black text-white">{formatTime('Asia/Manila')}</div>
          <div className="text-[10px] text-slate-500 font-bold uppercase">{formatDate('Asia/Manila')}</div>
        </div>
        
        <div className="h-px bg-slate-800" />
        
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Los Angeles, US</span>
            <span className="text-[10px] font-bold text-amber-400">PDT</span>
          </div>
          <div className="text-lg font-mono font-black text-white">{formatTime('America/Los_Angeles')}</div>
          <div className="text-[10px] text-slate-500 font-bold uppercase">{formatDate('America/Los_Angeles')}</div>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const [user, setUser] = useState<EmployeeWithStatus | null>(null);
  const [view, setView] = useState<View>('employee');
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.add('dark');
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('peso_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (!parsed || !parsed.session_token) {
          localStorage.removeItem('peso_user');
          setLoading(false);
          return;
        }

        // Fetch latest status from server using session token
        fetch('/api/me', {
          headers: { 
            'Content-Type': 'application/json',
            'x-session-token': parsed.session_token
          },
        })
        .then(res => {
          if (res.status === 401) throw new Error('Unauthorized');
          return res.json();
        })
        .then(data => {
          if (data && data.id) {
            setUser(data);
            localStorage.setItem('peso_user', JSON.stringify(data));
            setView(data.role === 'admin' ? 'admin' : 'employee');
          } else {
            handleLogout();
          }
          setLoading(false);
        })
        .catch(() => {
          handleLogout();
          setLoading(false);
        });
      } catch (e) {
        localStorage.removeItem('peso_user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        localStorage.setItem('peso_user', JSON.stringify(data));
        setView(data.role === 'admin' ? 'admin' : 'employee');
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (err) {
      setLoginError('Server error');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('peso_user');
    setUsername('');
    setPassword('');
  };

  const refreshUser = async () => {
    if (!user?.session_token) return;
    try {
      const res = await fetch('/api/me', {
        headers: { 
          'Content-Type': 'application/json',
          'x-session-token': user.session_token
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setUser(data);
          localStorage.setItem('peso_user', JSON.stringify(data));
        }
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (err) {
      console.error('Refresh failed', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 transition-colors duration-500">
        <div className="w-full max-w-[440px]">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-[2rem] text-white shadow-2xl shadow-blue-500/20 mb-6 transform hover:rotate-12 transition-transform duration-500">
              <Clock className="w-10 h-10" />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-3">TimeTracker</h1>
            <p className="text-slate-400 font-medium">Streamline your workflow with precision.</p>
          </div>

          <div className="bg-slate-900 p-10 rounded-[2.5rem] border border-slate-800 transition-all duration-500">
            <form onSubmit={handleLogin} className="space-y-8">
              {loginError && (
                <div className="p-4 bg-red-900/20 text-red-400 text-sm font-bold rounded-2xl border border-red-900/30 flex items-center gap-3 animate-shake">
                  <div className="w-1.5 h-1.5 bg-red-600 rounded-full" />
                  {loginError}
                </div>
              )}
              
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Username</label>
                <div className="group relative">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <User className="w-full h-full" />
                  </div>
                  <input
                    type="text"
                    required
                    className="w-full pl-14 pr-6 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-slate-800 transition-all text-white font-medium"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
                <div className="group relative">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Lock className="w-full h-full" />
                  </div>
                  <input
                    type="password"
                    required
                    className="w-full pl-14 pr-6 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-slate-800 transition-all text-white font-medium"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5"
              >
                Sign In to Dashboard
              </button>
            </form>
          </div>
          
          <div className="mt-12 flex flex-col items-center gap-4">
            <div className="flex items-center gap-4 text-slate-600">
              <div className="h-px w-12 bg-slate-800" />
              <span className="text-xs font-bold uppercase tracking-widest">Secure Access</span>
              <div className="h-px w-12 bg-slate-800" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 transition-colors duration-300">
      {/* Sidebar / Navigation */}
      <nav className="fixed top-0 left-0 h-full w-64 bg-slate-900 border-r border-slate-800 p-6 hidden lg:block">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <Clock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white">TimeTracker</h1>
        </div>

        <div className="space-y-2">
          <DualClock />

          {user.role === 'employee' && (
            <>
              <button
                onClick={() => setView('employee')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all",
                  view === 'employee' ? "bg-blue-900/30 text-blue-400" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                )}
              >
                <Users className="w-5 h-5" />
                My Portal
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                )}
              >
                <Settings className="w-5 h-5" />
                Settings
              </button>
            </>
          )}
          {user.role === 'admin' && (
            <button
              onClick={() => setView('admin')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all",
                view === 'admin' ? "bg-blue-900/30 text-blue-400" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              <LayoutDashboard className="w-5 h-5" />
              Admin Dashboard
            </button>
          )}
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-red-500 hover:bg-red-900/20 transition-all mt-10"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>

        <div className="absolute bottom-8 left-6 right-6">
          <div className="p-4 bg-slate-800 rounded-2xl text-white">
            <p className="text-xs text-slate-400 mb-1">Logged in as</p>
            <p className="text-sm font-bold truncate">{user.name}</p>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              {user.role}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="lg:ml-64 p-6 md:p-10 max-w-6xl mx-auto">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <Clock className="w-8 h-8 text-blue-600" />
            <span className="font-black text-xl text-white">TimeTracker</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleLogout} className="p-2 bg-red-900/20 text-red-500 rounded-lg"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        {/* View Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
            <span>Dashboard</span>
            <ChevronRight className="w-4 h-4" />
            <span className="capitalize">{view}</span>
          </div>
          <h2 className="text-3xl font-black text-white">
            {view === 'employee' ? 'Employee Portal' : 'Admin Dashboard'}
          </h2>
        </div>

        {view === 'employee' ? (
          <EmployeePortal 
            employee={user} 
            onRefresh={refreshUser}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            darkMode={true}
            setDarkMode={() => {}}
          />
        ) : (
          <AdminDashboard />
        )}
      </main>
    </div>
  );
}
