import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  PlusCircle,
  Play,
  Calendar,
  Clock,
  Users,
  Mail,
  MessageSquare,
  CheckCircle,
  XCircle,
  MoreVertical,
  Trash2,
  Edit2,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Campaign, Contact } from '../types';
import {
  subscribeToCampaigns,
  toggleCampaignActive,
  deleteCampaign,
} from '../services/campaignService';
import { fetchContacts } from '../services/contactService';
import { executeCampaignDelivery, CampaignExecutionResult } from '../services/schedulerService';
import { useToast } from '../contexts/ToastContext';
import { ActivePage } from '../components/layout/AppLayout';

interface CampaignsPageProps {
  onNavigate: (page: ActivePage, campaignId?: string) => void;
}

export const CampaignsPage: React.FC<CampaignsPageProps> = ({ onNavigate }) => {
  const { success, error: toastError, info } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [executingCampaignId, setExecutingCampaignId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<CampaignExecutionResult | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);

  useEffect(() => {
    const unsub = subscribeToCampaigns(setCampaigns);
    fetchContacts().then(setContacts);
    return () => unsub();
  }, []);

  const handleToggleActive = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleCampaignActive(campaign.id, !campaign.active);
      success(
        'Campaign Updated',
        `Campaign "${campaign.name}" is now ${!campaign.active ? 'Active' : 'Paused'}.`
      );
    } catch (err: any) {
      toastError('Toggle Failed', err?.message);
    }
  };

  const handleRunCampaignNow = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    setExecutingCampaignId(campaign.id);
    setExecutionResult(null);

    try {
      let targets = contacts.filter((c) => c.status === 'subscribed');
      if (campaign.recipientFilter?.type === 'tags' && campaign.recipientFilter.tags?.length) {
        const filterTags = campaign.recipientFilter.tags;
        targets = targets.filter((c) => c.tags.some((t) => filterTags.includes(t)));
      } else if (campaign.recipientFilter?.type === 'company' && campaign.recipientFilter.company) {
        targets = targets.filter((c) => c.company === campaign.recipientFilter?.company);
      } else if (campaign.recipientFilter?.type === 'manual' && campaign.recipientFilter.contactIds) {
        targets = targets.filter((c) => campaign.recipientFilter?.contactIds?.includes(c.id));
      }

      if (targets.length === 0) {
        toastError('No Contacts Found', 'No subscribed contacts match the filter for this campaign.');
        setExecutingCampaignId(null);
        return;
      }

      const res = await executeCampaignDelivery(campaign, targets);
      setExecutionResult(res);
      success(
        'Execution Complete',
        `Dispatched: ${res.sentCount}, Suppressed Duplicates: ${res.skippedDuplicateCount}, Failed: ${res.failedCount}`
      );
    } catch (err: any) {
      toastError('Execution Failed', err?.message);
    } finally {
      setExecutingCampaignId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!campaignToDelete) return;
    try {
      await deleteCampaign(campaignToDelete.id);
      success('Campaign Deleted', `Removed "${campaignToDelete.name}"`);
      setCampaignToDelete(null);
    } catch (err: any) {
      toastError('Delete Failed', err?.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Monthly Recurring Campaigns
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Automated multi-channel communications scheduled to run on chosen days each month.
          </p>
        </div>

        <button
          onClick={() => onNavigate('create-campaign')}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/25 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          Create New Campaign
        </button>
      </div>

      {/* Execution Result Banner if recently run */}
      {executionResult && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-indigo-500/50 shadow-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Monthly Dispatch Cycle Executed</h4>
              <div className="flex items-center gap-3 text-[11px] text-slate-300 mt-0.5">
                <span className="text-emerald-400 font-medium">✓ {executionResult.sentCount} Sent</span>
                <span className="text-amber-400 font-medium">
                  🛡️ {executionResult.skippedDuplicateCount} Protected from Duplicate Delivery
                </span>
                {executionResult.failedCount > 0 && (
                  <span className="text-rose-400 font-medium">✕ {executionResult.failedCount} Failed</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('message-logs')}
            className="px-3 py-1.5 text-xs font-semibold text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-600 rounded-lg transition-colors shrink-0"
          >
            Review Logs
          </button>
        </div>
      )}

      {/* Campaigns Grid */}
      {campaigns.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4">
            <Megaphone className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No campaigns created yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
            Create automated recurring monthly campaigns to dispatch personalized emails, SMS texts, and WhatsApp updates.
          </p>
          <button
            onClick={() => onNavigate('create-campaign')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all inline-flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Build First Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaigns.map((campaign) => {
            const isExecuting = executingCampaignId === campaign.id;
            return (
              <div
                key={campaign.id}
                onClick={() => onNavigate('campaign-details', campaign.id)}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all hover:shadow-xl cursor-pointer group"
              >
                <div>
                  {/* Top badges */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      {campaign.channels.map((ch) => (
                        <span
                          key={ch}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 ${
                            ch === 'email'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : ch === 'sms'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          }`}
                        >
                          {ch === 'email' && <Mail className="w-2.5 h-2.5" />}
                          {ch === 'sms' && <MessageSquare className="w-2.5 h-2.5" />}
                          {ch === 'whatsapp' && <MessageSquare className="w-2.5 h-2.5" />}
                          {ch}
                        </span>
                      ))}
                    </div>

                    {/* Active toggle button */}
                    <button
                      onClick={(e) => handleToggleActive(campaign, e)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all flex items-center gap-1 ${
                        campaign.active
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          campaign.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      {campaign.active ? 'Active' : 'Paused'}
                    </button>
                  </div>

                  {/* Title & description */}
                  <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                    {campaign.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {campaign.emailSubject || campaign.smsBody || 'No preview available'}
                  </p>
                </div>

                {/* Schedule & Recipient Meta */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      Recurrence
                    </span>
                    <span className="text-white font-medium">
                      Day {campaign.dayOfMonth} monthly @ {campaign.sendTime}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      Next Execution
                    </span>
                    <span className="text-indigo-300 font-medium font-mono text-[11px]">
                      {new Date(campaign.nextSendAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      Audience
                    </span>
                    <span className="text-white font-medium">
                      {campaign.recipientCount} contact{campaign.recipientCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                {/* Card Action footer */}
                <div className="mt-5 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-2">
                  <button
                    onClick={(e) => handleRunCampaignNow(campaign, e)}
                    disabled={isExecuting}
                    className="flex-1 px-3 py-2 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isExecuting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Trigger Run Now
                      </>
                    )}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCampaignToDelete(campaign);
                    }}
                    className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-colors"
                    title="Delete Campaign"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Campaign Confirmation Dialog */}
      {campaignToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Delete Campaign?</h3>
            <p className="text-xs text-slate-400 mb-6">
              Are you sure you want to delete <strong>{campaignToDelete.name}</strong>? Its monthly recurrence will be stopped immediately.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setCampaignToDelete(null)}
                className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md shadow-rose-600/20"
              >
                Delete Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
