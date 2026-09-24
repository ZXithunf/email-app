import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppLayout, ActivePage } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { ImportContactsPage } from './pages/ImportContactsPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { CreateCampaignPage } from './pages/CreateCampaignPage';
import { CampaignDetailsPage } from './pages/CampaignDetailsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { MessageLogsPage } from './pages/MessageLogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { Zap } from 'lucide-react';

const MainContent: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const handleNavigate = (page: ActivePage, campaignId?: string) => {
    setActivePage(page);
    if (campaignId) {
      setSelectedCampaignId(campaignId);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center animate-pulse mb-3">
          <Zap className="w-6 h-6 fill-current" />
        </div>
        <p className="text-xs font-medium text-slate-400">
          Initializing Contact Automation Platform...
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <AppLayout currentPage={activePage} onNavigate={handleNavigate}>
      {activePage === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
      {activePage === 'contacts' && <ContactsPage onNavigate={handleNavigate} />}
      {activePage === 'import-contacts' && <ImportContactsPage onNavigate={handleNavigate} />}
      {activePage === 'campaigns' && <CampaignsPage onNavigate={handleNavigate} />}
      {activePage === 'create-campaign' && <CreateCampaignPage onNavigate={handleNavigate} />}
      {activePage === 'campaign-details' && (
        <CampaignDetailsPage
          campaignId={selectedCampaignId || ''}
          onNavigate={handleNavigate}
        />
      )}
      {activePage === 'templates' && <TemplatesPage onNavigate={handleNavigate} />}
      {activePage === 'message-logs' && <MessageLogsPage />}
      {activePage === 'settings' && <SettingsPage />}
    </AppLayout>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainContent />
      </AuthProvider>
    </ToastProvider>
  );
}
