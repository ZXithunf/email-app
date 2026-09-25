import React, { useEffect, useState } from 'react';
import {
  Users,
  Megaphone,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  FileSpreadsheet,
  PlusCircle,
  Play,
  Mail,
  MessageSquare,
  Sparkles,
  Calendar,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Contact, Campaign, MessageLog } from '../types';
import { subscribeToContacts } from '../services/contactService';
import { subscribeToCampaigns } from '../services/campaignService';
import { subscribeToMessageLogs, executeCampaignDelivery } from '../services/schedulerService';
import { useToast } from '../contexts/ToastContext';
import { ActivePage } from '../components/layout/AppLayout';
import { getTimezoneShortLabel, isIndianTimezone } from '../utils/timezoneUtils';

interface DashboardPageProps {
  onNavigate: (page: ActivePage, campaignId?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { success, error: toastError } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [isRunningScheduler, setIsRunningScheduler] = useState(false);

  useEffect(() => {
    const unsubContacts = subscribeToContacts(setContacts);
    const unsubCampaigns = subscribeToCampaigns(setCampaigns);
    const unsubLogs = subscribeToMessageLogs(setLogs, 50);

    return () => {
      unsubContacts();
      unsubCampaigns();
      unsubLogs();
    };
  }, []);

  const totalContacts = contacts.length;
  const activeCampaigns = campaigns.filter((c) => c.active).length;
  const messagesSent = logs.filter((l) => l.status === 'sent').length;
  const failedMessages = logs.filter((l) => l.status === 'failed').length;
  const pendingMessages = logs.filter((l) => l.status === 'queued').length;
  const skippedDuplicates = logs.filter((l) => l.status === 'skipped_duplicate').length;

  const upcomingCampaigns = campaigns
    .filter((c) => c.active)
    .sort((a, b) => new Date(a.nextSendAt).getTime() - new Date(b.nextSendAt).getTime())
    .slice(0, 4);

  const recentActivity = logs.slice(0, 6);

  const handleRunMonthlyCycleNow = async (campaign: Campaign) => {
    setIsRunningScheduler(true);
    try {
      // Determine target recipients
      let targetContacts = contacts.filter((c) => c.status === 'subscribed');
      if (campaign.recipientFilter?.type === 'tags' && campaign.recipientFilter.tags?.length) {
        const filterTags = campaign.recipientFilter.tags;
        targetContacts = targetContacts.filter((c) =>
          c.tags.some((t) => filterTags.includes(t))
        );
      } else if (campaign.recipientFilter?.type === 'company' && campaign.recipientFilter.company) {
        targetContacts = targetContacts.filter((c) => c.company === campaign.recipientFilter?.company);
      } else if (campaign.recipientFilter?.type === 'manual' && campaign.recipientFilter.contactIds) {
        targetContacts = targetContacts.filter((c) =>
          campaign.recipientFilter?.contactIds?.includes(c.id)
        );
      }

      if (targetContacts.length === 0) {
        toastError('No Contacts Found', 'No subscribed contacts match this campaign criteria.');
        setIsRunningScheduler(false);
        return;
      }

      const result = await executeCampaignDelivery(campaign, targetContacts);
      success(
        'Campaign Dispatched',
        `Dispatched ${result.sentCount} message(s). ${result.skippedDuplicateCount} skipped as already delivered this month.`
      );
    } catch (err: any) {
      toastError('Execution Error', err?.message || 'Failed to dispatch campaign');
    } finally {
      setIsRunningScheduler(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-purple-950/40 border border-slate-800 p-6 rounded-2xl relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            Platform Overview
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
              Live Production
            </span>
          </h1>
          <p className="text-sm text-slate-400">
            Monthly recurring dispatch engine with automated duplicate suppression and audit logging.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <button
            onClick={() => onNavigate('google-sheets')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-xl border border-emerald-500/30 transition-all shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Google Sheets
          </button>
          <button
            onClick={() => onNavigate('import-contacts')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-all shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Upload Excel
          </button>
          <button
            onClick={() => onNavigate('create-campaign')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/25 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            Create Campaign
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total Contacts */}
        <div className="bg-slate-900/70 border border-slate-800/80 p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Contacts
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{totalContacts}</span>
            <span className="text-xs text-slate-400">records</span>
          </div>
          <button
            onClick={() => onNavigate('contacts')}
            className="mt-3 text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
          >
            View directory <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Active Campaigns */}
        <div className="bg-slate-900/70 border border-slate-800/80 p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Campaigns
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Megaphone className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{activeCampaigns}</span>
            <span className="text-xs text-slate-400">of {campaigns.length} total</span>
          </div>
          <button
            onClick={() => onNavigate('campaigns')}
            className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
          >
            Manage schedules <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Messages Sent */}
        <div className="bg-slate-900/70 border border-slate-800/80 p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Messages Sent
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{messagesSent}</span>
            <span className="text-xs text-slate-400">delivered</span>
          </div>
          <p className="mt-3 text-xs text-slate-400">Via SES & Twilio</p>
        </div>

        {/* Failed Messages */}
        <div className="bg-slate-900/70 border border-slate-800/80 p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Failed Messages
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-400">{failedMessages}</span>
            <span className="text-xs text-slate-400">errors</span>
          </div>
          <p className="mt-3 text-xs text-slate-400">Unsubscribed or bounce</p>
        </div>

        {/* Pending / Skipped Duplicates */}
        <div className="bg-slate-900/70 border border-slate-800/80 p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Duplicate Guard
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400">{skippedDuplicates}</span>
            <span className="text-xs text-slate-400">suppressed</span>
          </div>
          <p className="mt-3 text-xs text-slate-400">Protected duplicates</p>
        </div>
      </div>

      {/* Two Column Section: Upcoming Campaigns & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming Recurring Campaigns */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                Upcoming Monthly Campaigns
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically triggered each month on the scheduled day
              </p>
            </div>
            <button
              onClick={() => onNavigate('campaigns')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              All campaigns
            </button>
          </div>

          {upcomingCampaigns.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-slate-800 rounded-xl">
              <Megaphone className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No active monthly campaigns configured</p>
              <button
                onClick={() => onNavigate('create-campaign')}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Create your first campaign
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingCampaigns.map((camp) => (
                <div
                  key={camp.id}
                  className="p-4 rounded-xl bg-slate-800/40 border border-slate-850 hover:border-slate-700 transition-all flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white truncate">{camp.name}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Active
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400 flex-wrap">
                      <span>Day {camp.dayOfMonth} @ {camp.sendTime}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        isIndianTimezone(camp.timezone)
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {getTimezoneShortLabel(camp.timezone)}
                      </span>
                      <span>•</span>
                      <span>{camp.recipientCount} contacts</span>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        {camp.channels.includes('email') && (
                          <span title="Email"><Mail className="w-3 h-3 text-blue-400" /></span>
                        )}
                        {camp.channels.includes('sms') && (
                          <span title="SMS"><MessageSquare className="w-3 h-3 text-emerald-400" /></span>
                        )}
                        {camp.channels.includes('whatsapp') && (
                          <span title="WhatsApp"><MessageSquare className="w-3 h-3 text-purple-400" /></span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRunMonthlyCycleNow(camp)}
                      disabled={isRunningScheduler}
                      title="Trigger delivery now with duplicate check"
                      className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      Run Now
                    </button>
                    <button
                      onClick={() => onNavigate('campaign-details', camp.id)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Log */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-400" />
                Recent Delivery Activity
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time audit log of dispatches and duplicate guards
              </p>
            </div>
            <button
              onClick={() => onNavigate('message-logs')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Full logs
            </button>
          </div>

          {recentActivity.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-slate-800 rounded-xl">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No message dispatches recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Upload an Excel sheet and launch a campaign to start sending
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-slate-800/30 border border-slate-850 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5">
                      {log.status === 'sent' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                      {log.status === 'failed' && (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      {log.status === 'skipped_duplicate' && (
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                      )}
                      {log.status === 'queued' && (
                        <Clock className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 truncate">
                        {log.contactName || log.destination}
                      </p>
                      <p className="text-slate-400 text-[11px] truncate">
                        {log.campaignName} • <span className="uppercase text-[10px]">{log.channel}</span> ({log.provider})
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                        log.status === 'sent'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : log.status === 'failed'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : log.status === 'skipped_duplicate'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {log.status === 'skipped_duplicate' ? 'Duplicate Guard' : log.status}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {log.sentAt || log.scheduledAt ? new Date(log.sentAt || log.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
