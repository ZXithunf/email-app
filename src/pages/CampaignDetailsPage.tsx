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
import { getCampaignById, toggleCampaignActive } from '../services/campaignService';
import { fetchContacts } from '../services/contactService';
import {
  fetchMessageLogs,
  executeCampaignDelivery,
  CampaignExecutionResult,
} from '../services/schedulerService';
import { interpolateTemplate } from '../services/templateService';
import { useToast } from '../contexts/ToastContext';
import { ActivePage } from '../components/layout/AppLayout';

interface CampaignDetailsPageProps {
  campaignId: string;
  onNavigate: (page: ActivePage, campaignId?: string) => void;
}

export const CampaignDetailsPage: React.FC<CampaignDetailsPageProps> = ({
  campaignId,
  onNavigate,
}) => {
  const { success, error: toastError } = useToast();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'recipients' | 'logs'>('preview');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewContactIndex, setPreviewContactIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastExecution, setLastExecution] = useState<CampaignExecutionResult | null>(null);

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
      setContacts(allContacts || []);
      setLogs((allLogs || []).filter((l) => l.campaignId === campaignId));
    } catch (err: any) {
      toastError('Load Error', err?.message);
    } finally {
      setLoading(false);
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
    phone: '+14155552671',
    company: 'Acme Corporation',
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
      const res = await executeCampaignDelivery(campaign, targetRecipients);
      setLastExecution(res);
      success(
        'Campaign Executed',
        `Dispatched ${res.sentCount} message(s). ${res.skippedDuplicateCount} duplicates suppressed.`
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
            <p className="text-xs text-slate-400 mt-1">
              Monthly recurrence scheduled on day {campaign.dayOfMonth} @ {campaign.sendTime} {campaign.timezone}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
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

        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            Next Execution
          </span>
          <p className="text-sm font-bold text-indigo-300 font-mono mt-2">
            {new Date(campaign.nextSendAt).toLocaleDateString()}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">@ {campaign.sendTime} {campaign.timezone}</p>
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
                      From: notifications@contactautomation.io
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
                    You received this monthly update as a registered contact of Contact Automation.
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
                    Twilio SMS / WhatsApp Preview
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    To: {sampleContact.phone}
                  </span>
                </div>

                {/* Phone device mockup */}
                <div className="w-72 mx-auto bg-slate-950 border-2 border-slate-800 rounded-3xl p-3 shadow-2xl space-y-3">
                  <div className="w-16 h-3 bg-slate-800 rounded-full mx-auto" />
                  <div className="text-center pb-2 border-b border-slate-850">
                    <p className="text-[11px] font-bold text-white">AutoContact Bot</p>
                    <p className="text-[9px] text-slate-400">Twilio Verified Sender</p>
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
                  <th className="p-3.5">Contact</th>
                  <th className="p-3.5">Channel</th>
                  <th className="p-3.5">Month Cycle</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Provider ID / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No delivery attempts recorded for this campaign yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="p-3.5 font-mono text-slate-400">
                        {new Date(log.sentAt || log.scheduledAt).toLocaleString()}
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-white">{log.contactName}</div>
                        <div className="text-[11px] text-slate-400">{log.destination}</div>
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
                      <td className="p-3.5 font-mono text-[11px] text-slate-400">
                        {log.error || log.providerMessageId || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
