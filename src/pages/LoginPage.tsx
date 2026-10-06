import React, { useState } from 'react';
import {
  Zap,
  Mail,
  MessageSquare,
  FileSpreadsheet,
  ShieldCheck,
  CalendarCheck2,
  ArrowRight,
  AlertTriangle,
  UserPlus,
  LogIn,
  Building,
  Lock,
  User,
  CheckCircle,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export const LoginPage: React.FC = () => {
  const {
    signInWithGoogle,
    signInDemoAdmin,
    registerWithEmail,
    signInWithPassword,
    savedAccounts,
    switchUser,
    loading,
  } = useAuth();
  const { success, error: toastError } = useToast();

  const [mode, setMode] = useState<'register' | 'signin'>('register');
  const [authError, setAuthError] = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'register') {
        await registerWithEmail(cleanEmail, password, fullName, companyName);
        success('Account Created!', `Welcome ${fullName || cleanEmail}! Your private workspace is ready.`);
      } else {
        await signInWithPassword(cleanEmail, password);
        success('Welcome Back!', `Signed in as ${cleanEmail}`);
      }
    } catch (err: any) {
      const msg = err?.message || 'Authentication error';
      setAuthError(msg);
      toastError(mode === 'register' ? 'Registration Failed' : 'Sign In Failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
      success('Connected with Google', 'Google account authenticated successfully.');
    } catch (err: any) {
      const msg = err?.message || 'Failed to sign in with Google';
      setAuthError(msg);
      toastError('Login Failed', msg);
    }
  };

  const handleDemoLogin = async () => {
    setAuthError(null);
    try {
      await signInDemoAdmin();
      success('Demo Admin Mode', 'Loaded as Platform Administrator (Mithun).');
    } catch (err: any) {
      const msg = err?.message || 'Failed to sign in with demo admin';
      setAuthError(msg);
      toastError('Demo Login Failed', msg);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10 py-8">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 shadow-xl shadow-indigo-500/25 mb-4">
            <Zap className="w-8 h-8 text-white fill-white" />
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Astrix Automation
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1.5">
            Enterprise recurring contact uploads & multi-channel email campaigns
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl shadow-black/60">
          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-slate-800/80 rounded-xl mb-6 border border-slate-700/60">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === 'register'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === 'signin'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
          </div>

          <div className="mb-5">
            <h2 className="text-base font-bold text-white">
              {mode === 'register' ? 'Create Your Sender Account' : 'Sign In to Your Workspace'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {mode === 'register'
                ? 'Register your email to upload private contacts and send campaigns separately from your own identity.'
                : 'Access your private contact sheets, scheduled mailings, and delivery logs.'}
            </p>
          </div>

          {authError && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <User className="w-3 h-3 text-indigo-400" />
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mithun or Sarah Jenkins"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <Building className="w-3 h-3 text-indigo-400" />
                    Company / Brand Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Media or Mithun Inc."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Mail className="w-3 h-3 text-indigo-400" />
                Email Address *
              </label>
              <input
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Lock className="w-3 h-3 text-indigo-400" />
                Password *
              </label>
              <input
                type="password"
                required
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] disabled:opacity-50 mt-2"
            >
              {mode === 'register' ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  Register Account & Start Sending
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In to Workspace
                </>
              )}
            </button>
          </form>

          {/* Social / Google Sign In */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-slate-900 px-2 text-slate-500 font-semibold tracking-wider">
                Or Continue With
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-medium text-xs transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Sign In with Google Account
            </button>

            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-300 font-medium text-xs border border-slate-700/60 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              Quick Demo Admin (bmmithun688@gmail.com)
            </button>
          </div>

          {/* Saved accounts on this device */}
          {savedAccounts.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-800/80">
              <p className="text-[11px] font-semibold text-slate-400 mb-2.5 flex items-center gap-1.5">
                <Users className="w-3 h-3 text-indigo-400" />
                Registered Accounts On This Browser:
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {savedAccounts.map((acc) => (
                  <button
                    key={acc.uid}
                    type="button"
                    onClick={() => switchUser(acc.uid)}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 text-left transition-all group"
                  >
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                        {acc.displayName || acc.email}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{acc.email}</p>
                    </div>
                    <span className="text-[10px] font-medium text-indigo-400 group-hover:text-indigo-300 px-2 py-0.5 rounded bg-indigo-500/10 shrink-0">
                      Switch &rarr;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Privacy & multi-tenancy badge */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Isolated contact uploads: only you see your contacts</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <CheckCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Send separately with your own email and connected Gmail</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Multi-User Contact Platform &bull; Protected by Firebase Auth & Firestore
        </p>
      </div>
    </div>
  );
};
