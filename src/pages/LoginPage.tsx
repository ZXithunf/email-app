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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle, signInDemoAdmin, loading } = useAuth();
  const { error: toastError } = useToast();
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
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

      <div className="max-w-md w-full relative z-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 shadow-xl shadow-indigo-500/25 mb-4">
            <Zap className="w-8 h-8 text-white fill-white" />
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Contact Automation Platform
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Enterprise monthly recurring email, SMS & WhatsApp communications
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl shadow-black/60">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Administrator Access</h2>
            <p className="text-xs text-slate-400 mt-1">
              Sign in with your verified administrative credentials to manage contacts and campaigns.
            </p>
          </div>

          {authError && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-medium text-sm transition-all shadow-md shadow-white/5 active:scale-[0.98] disabled:opacity-50"
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
              Sign In with Google Admin
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase">
                <span className="bg-slate-900 px-2 text-slate-500 font-medium">Or Quick Review</span>
              </div>
            </div>

            <button
              onClick={handleDemoLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/25 active:scale-[0.98] disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              Enter as Platform Administrator
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>

          {/* Value props list */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 space-y-2.5">
            <div className="flex items-center gap-2.5 text-xs text-slate-400">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Bulk Excel (.xlsx / .xls) parsing & deduplication</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-400">
              <CalendarCheck2 className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Strict duplicate-suppressed monthly recurrence</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-400">
              <Mail className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Amazon SES transactional and broadcast delivery</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-400">
              <MessageSquare className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Twilio SMS & WhatsApp multi-channel messaging</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Protected by Firebase Authentication & Firestore Security Rules
        </p>
      </div>
    </div>
  );
};
