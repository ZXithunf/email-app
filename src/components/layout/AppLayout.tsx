import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Megaphone,
  PlusCircle,
  FileText,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  CheckCircle,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export type ActivePage =
  | 'dashboard'
  | 'contacts'
  | 'import-contacts'
  | 'google-sheets'
  | 'campaigns'
  | 'create-campaign'
  | 'campaign-details'
  | 'templates'
  | 'message-logs'
  | 'settings';

interface AppLayoutProps {
  currentPage: ActivePage;
  onNavigate: (page: ActivePage, campaignId?: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentPage,
  onNavigate,
  children,
}) => {
  const { adminProfile, currentUser, savedAccounts, switchUser, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  const navItems: {
    id: ActivePage;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'contacts', label: 'Contacts', icon: <Users className="w-5 h-5" /> },
    { id: 'import-contacts', label: 'Import Contacts', icon: <FileSpreadsheet className="w-5 h-5" /> },
    { id: 'google-sheets', label: 'Google Sheets', icon: <FileSpreadsheet className="w-5 h-5 text-emerald-400" />, badge: 'Sync' },
    { id: 'campaigns', label: 'Campaigns', icon: <Megaphone className="w-5 h-5" /> },
    { id: 'create-campaign', label: 'Create Campaign', icon: <PlusCircle className="w-5 h-5" /> },
    { id: 'templates', label: 'Templates', icon: <FileText className="w-5 h-5" /> },
    { id: 'message-logs', label: 'Message Logs', icon: <History className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row antialiased">
      {/* Mobile Top Nav */}
      <header className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20">
            A
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">Astrix Automation</h1>
          </div>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar for Desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800/80 flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center font-black text-white shadow-lg shadow-indigo-500/25">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <span className="font-bold text-white text-base tracking-tight block">
                Astrix
              </span>
              <span className="text-[11px] font-medium tracking-wide uppercase text-indigo-400">
                Automated Messaging
              </span>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Platform Core
          </div>
          {navItems.map((item) => {
            const isActive =
              currentPage === item.id ||
              (item.id === 'campaigns' && currentPage === 'campaign-details');
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                }`}
              >
                <span className={`${isActive ? 'text-white' : 'text-slate-400'}`}>
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User profile & account switching */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/50 relative">
          {showAccountMenu && (
            <div className="absolute bottom-full left-3 right-3 mb-2 p-3 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl z-50 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                  Accounts on this device
                </span>
                <button
                  onClick={() => setShowAccountMenu(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1 max-h-40 overflow-y-auto">
                {savedAccounts.map((acc) => {
                  const isCurrent = acc.uid === currentUser?.uid;
                  return (
                    <button
                      key={acc.uid}
                      onClick={() => {
                        switchUser(acc.uid);
                        setShowAccountMenu(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors ${
                        isCurrent
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="truncate">
                        <p className="font-semibold truncate">{acc.displayName || acc.email}</p>
                        <p className="text-[10px] text-slate-400 truncate">{acc.email}</p>
                      </div>
                      {isCurrent && <CheckCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  setShowAccountMenu(false);
                  logout();
                }}
                className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Register New User Account
              </button>
            </div>
          )}

          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-800 hover:border-slate-700 transition-all">
            <button
              onClick={() => setShowAccountMenu(!showAccountMenu)}
              title="Click to switch accounts or register another user"
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm shadow-indigo-600/30">
                {adminProfile?.displayName?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                  {adminProfile?.displayName || 'User'}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {currentUser?.email || adminProfile?.email || 'user@domain.com'}
                </p>
              </div>
            </button>
            <button
              onClick={() => logout()}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar for Desktop */}
        <header className="hidden md:flex items-center justify-between px-8 py-3.5 bg-slate-900/60 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle className="w-3.5 h-3.5" />
              Private Workspace Active
            </span>
            <span className="text-xs text-slate-500">|</span>
            <span className="text-xs text-slate-300 flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              Sender: <strong className="text-white">{currentUser?.email || adminProfile?.email}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => logout()}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/70 transition-colors flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5 text-indigo-400" />
              Register / Switch User
            </button>
            <button
              onClick={() => onNavigate('import-contacts')}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700/70 transition-colors flex items-center gap-2"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Import Excel
            </button>
            <button
              onClick={() => onNavigate('create-campaign')}
              className="px-3.5 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-sm shadow-indigo-600/30 transition-colors flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              New Campaign
            </button>
          </div>
        </header>

        {/* Dynamic page container */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
