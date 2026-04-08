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

function AppContent() {
  const [user, setUser] = useState<EmployeeWithStatus | null>(null);
  const [view, setView] = useState<View>('employee');
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('peso_dark_mode');
    return saved === 'true';
  });
  
  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    localStorage.setItem('peso_dark_mode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200 mx-auto mb-4">
              <Clock className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-black text-slate-900">TImeTracker</h1>
            <p className="text-slate-500 mt-2">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
            {loginError && (
              <div className="p-4 bg-red-50 text-red-600 text-sm font-medium rounded-xl border border-red-100">
                {loginError}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Username</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-100 transition-all active:scale-[0.98]"
            >
              Sign In
            </button>
          </form>
          
          <div className="mt-8 text-center text-slate-400 text-sm">
            <p>Admin: admin / admin123</p>
            <p>Employee: juan / password123</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Sidebar / Navigation */}
      <nav className="fixed top-0 left-0 h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 hidden lg:block">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 dark:shadow-none">
            <Clock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">TImeTracker</h1>
        </div>

        <div className="space-y-2">
          {user.role === 'employee' && (
            <>
              <button
                onClick={() => setView('employee')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all",
                  view === 'employee' ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
                )}
              >
                <Users className="w-5 h-5" />
                My Portal
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
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
                view === 'admin' ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
              )}
            >
              <LayoutDashboard className="w-5 h-5" />
              Admin Dashboard
            </button>
          )}
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all mt-10"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>

        <div className="absolute bottom-8 left-6 right-6">
          <div className="p-4 bg-slate-900 dark:bg-slate-800 rounded-2xl text-white">
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
            <span className="font-black text-xl dark:text-white">TImeTracker</span>
          </div>
          <button onClick={handleLogout} className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-lg"><LogOut className="w-5 h-5" /></button>
        </div>

        {/* View Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm mb-2">
            <span>Dashboard</span>
            <ChevronRight className="w-4 h-4" />
            <span className="capitalize">{view}</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white">
            {view === 'employee' ? 'Employee Portal' : 'Admin Dashboard'}
          </h2>
        </div>

        {view === 'employee' ? (
          <EmployeePortal 
            employee={user} 
            onRefresh={refreshUser}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
          />
        ) : (
          <AdminDashboard />
        )}
      </main>
    </div>
  );
}
