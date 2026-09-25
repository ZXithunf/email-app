import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  Mail,
  MessageSquare,
  Play,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Eye,
  Smartphone,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { Campaign, Contact, MessageLog } from '../types';
import { getCampaignById, toggleCampaignActive, updateCampaign } from '../services/campaignService';
import { fetchContacts } from '../services/contactService';
import {
  fetchMessageLogs,
  executeCampaignDelivery,
  CampaignExecutionResult,
} from '../services/schedulerService';
import { interpolateTemplate } from '../services/templateService';
import { useToast } from '../contexts/ToastContext';
import { ActivePage } from '../components/layout/AppLayout';
import {
  TIMEZONE_OPTIONS,
  getTimezoneLabel,
  getTimezoneShortLabel,
  formatInTimezone,
  isIndianTimezone,
  getCurrentTimeInZone,
} from '../utils/timezoneUtils';

interface CampaignDetailsPageProps {
  campaignId: string;
  onNavigate: (page: ActivePage, campaignId?: string) => void;
}

export const CampaignDetailsPage: React.FC<CampaignDetailsPageProps> = ({
  campaignId,
  onNavigate,
}) => {
  const { success, error: toastError, info } = useToast();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'recipients' | 'logs'>('preview');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewContactIndex, setPreviewContactIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastExecution, setLastExecution] = useState<CampaignExecutionResult | null>(null);

  // Force re-send & Direct Test Dispatch
  const [forceResend, setForceResend] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmail, setTestEmail] = useState('bmmithun688@gmail.com');
  const [testPhone, setTestPhone] = useState('+91');
  const [testChannel, setTestChannel] = useState<'whatsapp' | 'email' | 'sms'>('whatsapp');
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Schedule & Timezone editing
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [editDayOfMonth, setEditDayOfMonth] = useState<number>(1);
  const [editSendTime, setEditSendTime] = useState('09:00');
  const [editTimezone, setEditTimezone] = useState('Asia/Kolkata');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  useEffect(() => {
    loadData();
  }, [campaignId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [camp, allContacts, allLogs] = await Promise.all([
        getCampaignById(campaignId),
        fetchContacts(),
        fetchMessageLogs(200),
      ]);
      setCampaign(camp);
      if (camp) {
        setEditDayOfMonth(camp.dayOfMonth);
        setEditSendTime(camp.sendTime);
        setEditTimezone(camp.timezone || 'Asia/Kolkata');
      }
      setContacts(allContacts || []);
      setLogs((allLogs || []).filter((l) => l.campaignId === campaignId));
    } catch (err: any) {
      toastError('Load Error', err?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign) return;
    setIsSavingSchedule(true);
    try {
      await updateCampaign(campaign.id, {
        dayOfMonth: editDayOfMonth,
        sendTime: editSendTime,
        timezone: editTimezone,
      });
      success('Schedule Updated', `Recurrence updated to day ${editDayOfMonth} at ${editSendTime} ${getTimezoneShortLabel(editTimezone)}.`);
      setIsEditingSchedule(false);
      await loadData();
    } catch (err: any) {
      toastError('Update Failed', err?.message);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-xs text-slate-400">Loading campaign details...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8 text-center bg-slate-900 rounded-2xl border border-slate-800">
        <p className="text-base font-bold text-white">Campaign not found</p>
        <button
          onClick={() => onNavigate('campaigns')}
          className="mt-4 px-4 py-2 bg-slate-800 text-xs text-slate-200 rounded-xl"
        >
          Back to Campaigns
        </button>
      </div>
    );
  }

  // Resolve target audience
  let targetRecipients = contacts.filter((c) => c.status === 'subscribed');
  if (campaign.recipientFilter?.type === 'tags' && campaign.recipientFilter.tags?.length) {
    const filterTags = campaign.recipientFilter.tags;
    targetRecipients = targetRecipients.filter((c) => c.tags.some((t) => filterTags.includes(t)));
  } else if (campaign.recipientFilter?.type === 'company' && campaign.recipientFilter.company) {
    targetRecipients = targetRecipients.filter((c) => c.company === campaign.recipientFilter?.company);
  } else if (campaign.recipientFilter?.type === 'manual' && campaign.recipientFilter.contactIds) {
    targetRecipients = targetRecipients.filter((c) => campaign.recipientFilter?.contactIds?.includes(c.id));
  }

  const sampleContact: Contact = targetRecipients[previewContactIndex] || {
    id: 'sample',
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@acmecorp.com',
    phone: '+919876543210',
    company: 'Astrix Technologies',
    tags: ['VIP'],
    status: 'subscribed',
    consentGiven: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const renderedSubject = interpolateTemplate(campaign.emailSubject, sampleContact);
  const renderedEmailBody = interpolateTemplate(campaign.emailBody, sampleContact);
  const renderedSmsBody = interpolateTemplate(campaign.smsBody, sampleContact);

  const handleRunNow = async () => {
    setIsExecuting(true);
    try {
      const res = await executeCampaignDelivery(campaign, targetRecipients, {
        forceResend,
        companyName: 'Astrix',
      });
      setLastExecution(res);
      success(
        'Campaign Executed by Astrix',
        `Dispatched ${res.sentCount} message(s). ${res.skippedDuplicateCount} duplicates suppressed${
          forceResend ? ' (Force Re-send applied)' : ''
        }.`
      );
      // Reload logs
      const updatedLogs = await fetchMessageLogs(200);
      setLogs(updatedLogs.filter((l) => l.campaignId === campaign.id));
    } catch (err: any) {
      toastError('Execution Error', err?.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSendDirectTest = async () => {
    setIsSendingTest(true);
    try {
      const testContact: Contact = {
        id: `test-${Date.now()}`,
        name: 'Astrix Test User',
        email: testEmail.trim(),
        phone: testPhone.trim(),
        company: 'Astrix',
        tags: ['Test'],
        status: 'subscribed',
        consentGiven: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const testCampaign: Campaign = {
        ...campaign,
        channels: [testChannel],
      };

      const res = await executeCampaignDelivery(testCampaign, [testContact], {
        forceResend: true,
        companyName: 'Astrix',
      });

      const log = res.logs[0];
      if (log?.directActionUrl) {
        window.open(log.directActionUrl, '_blank');
      }

      success(
        'Astrix Test Dispatched',
        `Generated test alert from Astrix. Direct action link opened in your browser!`
      );
      setShowTestModal(false);

      const updatedLogs = await fetchMessageLogs(200);
      setLogs(updatedLogs.filter((l) => l.campaignId === campaign.id));
    } catch (err: any) {
      toastError('Test Failed', err?.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleToggleActive = async () => {
    try {
      await toggleCampaignActive(campaign.id, !campaign.active);
      setCampaign({ ...campaign, active: !campaign.active });
      success('Campaign State Updated', `Campaign is now ${!campaign.active ? 'Active' : 'Paused'}.`);
    } catch (err: any) {
      toastError('Toggle Failed', err?.message);
    }
  };

  const sentCount = logs.filter((l) => l.status === 'sent').length;
  const duplicateGuardCount = logs.filter((l) => l.status === 'skipped_duplicate').length;
  const errorCount = logs.filter((l) => l.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('campaigns')}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                {campaign.name}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  campaign.active
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {campaign.active ? 'Active' : 'Paused'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
              <span>Monthly recurrence scheduled on day {campaign.dayOfMonth} @ {campaign.sendTime}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                isIndianTimezone(campaign.timezone)
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}>
                {getTimezoneLabel(campaign.timezone)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/90 border border-slate-800 px-3 py-2 rounded-xl cursor-pointer hover:border-slate-700 select-none">
            <input
              type="checkbox"
              checked={forceResend}
              onChange={(e) => setForceResend(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span className="text-[11px] font-medium">Force Re-send (Bypass duplicate guard)</span>
          </label>
          <button
            onClick={() => setShowTestModal(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center gap-1.5"
          >
            <span>📱 Test Phone / Email</span>
          </button>
          <button
            onClick={handleToggleActive}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition-colors"
          >
            {campaign.active ? 'Pause Campaign' : 'Activate Campaign'}
          </button>
          <button
            onClick={handleRunNow}
            disabled={isExecuting}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
          >
            {isExecuting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Executing Run...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Trigger Run Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            Total Audience
          </span>
          <p className="text-2xl font-bold text-white mt-1">{targetRecipients.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Matched recipients</p>
        </div>

        <div className="bg-emerald-950/20 border border-emerald-800/40 p-4 rounded-xl">
          <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">
            Dispatches Sent
          </span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{sentCount}</p>
          <p className="text-[10px] text-emerald-500/80 mt-0.5">Successful deliveries</p>
        </div>

        <div className="bg-amber-950/20 border border-amber-800/40 p-4 rounded-xl">
          <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
            Duplicate Suppressed
          </span>
          <p className="text-2xl font-bold text-amber-400 mt-1">{duplicateGuardCount}</p>
          <p className="text-[10px] text-amber-500/80 mt-0.5">Protected from double-send</p>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Next Execution
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditDayOfMonth(campaign.dayOfMonth);
                  setEditSendTime(campaign.sendTime);
                  setEditTimezone(campaign.timezone || 'Asia/Kolkata');
                  setIsEditingSchedule(true);
                }}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold underline"
              >
                Edit
              </button>
            </div>
            <p className="text-sm font-bold text-indigo-300 font-mono mt-2">
              {formatInTimezone(campaign.nextSendAt, campaign.timezone)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              @ {campaign.sendTime} ({getTimezoneShortLabel(campaign.timezone)})
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'preview'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Message Preview & Test Rendering
        </button>
        <button
          onClick={() => setActiveTab('recipients')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'recipients'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Target Recipients ({targetRecipients.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'logs'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Delivery Audit History ({logs.length})
        </button>
      </div>

      {/* Tab 1: Preview */}
      {activeTab === 'preview' && (
        <div className="space-y-6">
          {/* Sample contact selector */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-medium text-slate-300">
                Previewing personalized placeholders for contact:
              </span>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={previewContactIndex}
                onChange={(e) => setPreviewContactIndex(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none"
              >
                {targetRecipients.slice(0, 10).map((c, idx) => (
                  <option key={c.id} value={idx}>
                    {c.name} ({c.company || 'No Company'})
                  </option>
                ))}
              </select>

              <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-1.5 rounded text-xs ${
                    previewDevice === 'desktop' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                  title="Desktop View"
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1.5 rounded text-xs ${
                    previewDevice === 'mobile' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                  title="Mobile View"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Email Preview Mockup */}
            {campaign.channels.includes('email') && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Mail className="w-4 h-4 text-blue-400" />
                    Amazon SES Email Preview
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    To: {sampleContact.email}
                  </span>
                </div>

                <div
                  className={`bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex-1 ${
                    previewDevice === 'mobile' ? 'max-w-xs mx-auto shadow-2xl' : 'w-full'
                  }`}
                >
                  <div className="bg-slate-900 p-3 border-b border-slate-800 text-xs">
                    <p className="font-semibold text-white truncate">
                      Subject: {renderedSubject}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      From: Astrix &lt;notifications@astrix.com&gt;
                    </p>
                  </div>

                  {campaign.emailImageUrl && (
                    <img
                      src={campaign.emailImageUrl}
                      alt="Campaign Banner"
                      className="w-full h-40 object-cover border-b border-slate-800"
                    />
                  )}

                  <div className="p-5 text-xs text-slate-200 leading-relaxed font-sans prose prose-invert max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: renderedEmailBody }} />
                  </div>

                  <div className="p-4 bg-slate-900/50 border-t border-slate-850 text-[10px] text-slate-500 text-center">
                    You received this monthly update as a registered contact of Astrix.
                    <br />
                    <a href="#" className="underline text-indigo-400">Unsubscribe</a>
                  </div>
                </div>
              </div>
            )}

            {/* SMS / WhatsApp Chat Mockup */}
            {(campaign.channels.includes('sms') || campaign.channels.includes('whatsapp')) && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    Astrix SMS / WhatsApp Preview
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    To: {sampleContact.phone}
                  </span>
                </div>

                {/* Phone device mockup */}
                <div className="w-72 mx-auto bg-slate-950 border-2 border-slate-800 rounded-3xl p-3 shadow-2xl space-y-3">
                  <div className="w-16 h-3 bg-slate-800 rounded-full mx-auto" />
                  <div className="text-center pb-2 border-b border-slate-850">
                    <p className="text-[11px] font-bold text-white">Astrix Notifications</p>
                    <p className="text-[9px] text-emerald-400">Astrix Verified Sender</p>
                  </div>

                  {campaign.smsImageUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-800">
                      <img
                        src={campaign.smsImageUrl}
                        alt="MMS attachment"
                        className="w-full h-28 object-cover"
                      />
                    </div>
                  )}

                  <div className="bg-emerald-950/60 border border-emerald-700/50 text-emerald-100 p-3 rounded-2xl rounded-tr-none text-xs leading-relaxed">
                    <p className="whitespace-pre-wrap">{renderedSmsBody}</p>
                    <span className="text-[9px] text-emerald-400 block text-right mt-1">
                      {campaign.sendTime} ✓✓
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Target Recipients */}
      {activeTab === 'recipients' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-3.5">Name</th>
                  <th className="p-3.5">Email</th>
                  <th className="p-3.5">Phone</th>
                  <th className="p-3.5">Company</th>
                  <th className="p-3.5">Subscription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {targetRecipients.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-800/30">
                    <td className="p-3.5 font-semibold text-white">{contact.name}</td>
                    <td className="p-3.5">{contact.email}</td>
                    <td className="p-3.5 font-mono">{contact.phone}</td>
                    <td className="p-3.5 text-slate-400">{contact.company || '—'}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {contact.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Delivery Audit History */}
      {activeTab === 'logs' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Sender</th>
                  <th className="p-3.5">Contact / Destination</th>
                  <th className="p-3.5">Channel</th>
                  <th className="p-3.5">Month Cycle</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Provider ID / Details</th>
                  <th className="p-3.5">Direct Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No delivery attempts recorded for this campaign yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const isIndianNumber = log.destination?.startsWith('+91');
                    return (
                      <tr key={log.id} className="hover:bg-slate-800/30">
                        <td className="p-3.5 font-mono text-slate-400">
                          {new Date(log.sentAt || log.scheduledAt).toLocaleString()}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-bold">
                            {log.companySender || 'Astrix'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-white">{log.contactName}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                            {isIndianNumber && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                🇮🇳 IN
                              </span>
                            )}
                            <span>{log.destination}</span>
                          </div>
                        </td>
                        <td className="p-3.5 uppercase text-[10px] font-bold text-slate-300">
                          {log.channel}
                        </td>
                        <td className="p-3.5 font-mono">{log.monthCycle}</td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              log.status === 'sent'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : log.status === 'skipped_duplicate'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                          {log.error || log.providerMessageId || '—'}
                        </td>
                        <td className="p-3.5">
                          {log.directActionUrl && (
                            <a
                              href={log.directActionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-colors ${
                                log.channel === 'whatsapp'
                                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                  : log.channel === 'email'
                                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                  : 'bg-slate-700 hover:bg-slate-600 text-white'
                              }`}
                            >
                              {log.channel === 'whatsapp' ? '💬 WhatsApp' : log.channel === 'email' ? '✉️ Email' : '📱 SMS'}
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Test Phone / Email Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                  A
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Send Live Astrix Test Message</h3>
                  <p className="text-[11px] text-slate-400">Directly verify recipient delivery with Astrix branding</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Company Sender</label>
                <div className="px-3.5 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white font-semibold flex items-center justify-between">
                  <span>Astrix</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">Verified Sender</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select Channel</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
                    { id: 'email', label: 'Email', icon: '✉️' },
                    { id: 'sms', label: 'SMS', icon: '📱' },
                  ].map((ch) => (
                    <button
                      type="button"
                      key={ch.id}
                      onClick={() => setTestChannel(ch.id as any)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        testChannel === ch.id
                          ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="block text-sm">{ch.icon}</span>
                      <span className="text-[11px] mt-0.5 block">{ch.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {testChannel === 'email' ? (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Recipient Email Address *</label>
                  <input
                    type="email"
                    required
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="bmmithun688@gmail.com"
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Will send from &quot;Astrix &lt;notifications@astrix.com&gt;&quot;
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Recipient Mobile Phone (Indian Numbers Accepted) *
                  </label>
                  <input
                    type="text"
                    required
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+91 98765 43210 (accepts +91, =91, 91)"
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[10px] text-amber-400/90 mt-1">
                    🇮🇳 Indian format supported: +91, =91, or 10 digits. Will prefix with Astrix brand signature.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendDirectTest}
                disabled={isSendingTest}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSendingTest ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Dispatching...
                  </>
                ) : (
                  <>
                    <span>🚀 Launch Astrix Test</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule & Timezone Editing Modal */}
      {isEditingSchedule && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Edit Recurrence & Timezone</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingSchedule(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Day of Month (1 - 31)
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  required
                  value={editDayOfMonth}
                  onChange={(e) => setEditDayOfMonth(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Send Time (HH:mm)
                </label>
                <input
                  type="time"
                  required
                  value={editSendTime}
                  onChange={(e) => setEditSendTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Timezone
                  </label>
                  {isIndianTimezone(editTimezone) && (
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      🇮🇳 IST Selected
                    </span>
                  )}
                </div>
                <select
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                >
                  {Array.from(new Set(TIMEZONE_OPTIONS.map((t) => t.group))).map((group) => (
                    <optgroup key={group} label={group} className="bg-slate-900 text-slate-300 font-bold">
                      {TIMEZONE_OPTIONS.filter((t) => t.group === group).map((tz) => (
                        <option key={tz.value} value={tz.value} className="bg-slate-800 text-white font-normal py-1">
                          {tz.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setEditTimezone('Asia/Kolkata')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                      editTimezone === 'Asia/Kolkata'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    🇮🇳 Indian Standard Time (IST)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTimezone('UTC')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                      editTimezone === 'UTC'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    🌐 UTC
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>Current: <span className="text-slate-200 font-medium">{getCurrentTimeInZone(editTimezone)}</span></span>
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditingSchedule(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSchedule}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                >
                  {isSavingSchedule ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
