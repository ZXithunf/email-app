import React, { useState, useEffect, useMemo } from 'react';
import {
  Megaphone,
  Mail,
  MessageSquare,
  Users,
  Calendar,
  Clock,
  Image as ImageIcon,
  CheckCircle,
  ArrowLeft,
  UploadCloud,
  FileText,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { Campaign, Contact, ChannelType, MessageTemplate } from '../types';
import { createCampaign, calculateNextSendAt } from '../services/campaignService';
import { fetchContacts } from '../services/contactService';
import { fetchTemplates } from '../services/templateService';
import { uploadCampaignImage } from '../services/storageService';
import { useToast } from '../contexts/ToastContext';
import { ActivePage } from '../components/layout/AppLayout';

interface CreateCampaignPageProps {
  onNavigate: (page: ActivePage, campaignId?: string) => void;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const CreateCampaignPage: React.FC<CreateCampaignPageProps> = ({ onNavigate }) => {
  const { success, error: toastError } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [channels, setChannels] = useState<ChannelType[]>(['email']);

  // Email content
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailImageUrl, setEmailImageUrl] = useState('');

  // SMS / WhatsApp content
  const [smsBody, setSmsBody] = useState('');
  const [smsImageUrl, setSmsImageUrl] = useState('');

  // Audience
  const [audienceType, setAudienceType] = useState<'all' | 'tags' | 'company' | 'manual'>('all');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  // Recurrence
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [sendTime, setSendTime] = useState('09:00');
  const [timezone, setTimezone] = useState('UTC');
  const [monthlyRecurrence, setMonthlyRecurrence] = useState(true);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [active, setActive] = useState(true);

  useEffect(() => {
    fetchContacts().then((res) => setContacts(res || []));
    fetchTemplates().then((res) => setTemplates(res || []));
  }, []);

  // Compute unique tags and companies
  const availableTags = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => c.tags?.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [contacts]);

  const availableCompanies = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => {
      if (c.company) s.add(c.company);
    });
    return Array.from(s).sort();
  }, [contacts]);

  // Resolve target contacts based on audience criteria
  const targetContacts = useMemo(() => {
    const subscribed = contacts.filter((c) => c.status === 'subscribed');
    if (audienceType === 'all') return subscribed;
    if (audienceType === 'tags') {
      if (!selectedTag) return [];
      return subscribed.filter((c) => c.tags?.includes(selectedTag));
    }
    if (audienceType === 'company') {
      if (!selectedCompany) return [];
      return subscribed.filter((c) => c.company === selectedCompany);
    }
    if (audienceType === 'manual') {
      return subscribed.filter((c) => selectedContactIds.has(c.id));
    }
    return subscribed;
  }, [contacts, audienceType, selectedTag, selectedCompany, selectedContactIds]);

  // Preview next send date
  const nextSendPreview = useMemo(() => {
    return calculateNextSendAt(dayOfMonth, sendTime);
  }, [dayOfMonth, sendTime]);

  const handleChannelToggle = (channel: ChannelType) => {
    if (channels.includes(channel)) {
      if (channels.length === 1) {
        toastError('At least one channel required');
        return;
      }
      setChannels(channels.filter((c) => c !== channel));
    } else {
      setChannels([...channels, channel]);
    }
  };

  const handleApplyTemplate = (tmpl: MessageTemplate) => {
    if (tmpl.channel === 'email') {
      setEmailSubject(tmpl.subject || '');
      setEmailBody(tmpl.content);
      if (!channels.includes('email')) setChannels([...channels, 'email']);
    } else {
      setSmsBody(tmpl.content);
      if (!channels.includes('sms') && !channels.includes('whatsapp')) {
        setChannels([...channels, tmpl.channel]);
      }
    }
    success('Template Injected', `Applied "${tmpl.name}" to campaign`);
  };

  const insertVariable = (variableKey: string, target: 'email' | 'sms') => {
    const placeholder = `{{${variableKey}}}`;
    if (target === 'email') {
      setEmailBody((prev) => prev + ' ' + placeholder);
    } else {
      setSmsBody((prev) => prev + ' ' + placeholder);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'email' | 'sms') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const url = await uploadCampaignImage(file);
      if (target === 'email') {
        setEmailImageUrl(url);
      } else {
        setSmsImageUrl(url);
      }
      success('Image Uploaded', 'Campaign image has been attached.');
    } catch (err: any) {
      toastError('Image Upload Failed', err?.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toastError('Validation Error', 'Campaign name is required');
      return;
    }

    if (channels.includes('email') && (!emailSubject.trim() || !emailBody.trim())) {
      toastError('Validation Error', 'Email Subject and Email Body are required for Email channel.');
      return;
    }

    if ((channels.includes('sms') || channels.includes('whatsapp')) && !smsBody.trim()) {
      toastError('Validation Error', 'SMS/WhatsApp message body is required.');
      return;
    }

    if (targetContacts.length === 0) {
      toastError('No Recipients', 'Please select at least one subscribed contact for this campaign.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newCampaign = await createCampaign(
        {
          name: name.trim(),
          emailSubject: emailSubject.trim(),
          emailBody: emailBody.trim(),
          emailImageUrl: emailImageUrl.trim() || undefined,
          smsBody: smsBody.trim(),
          smsImageUrl: smsImageUrl.trim() || undefined,
          channels,
          recipientFilter: {
            type: audienceType,
            tags: audienceType === 'tags' && selectedTag ? [selectedTag] : undefined,
            company: audienceType === 'company' ? selectedCompany : undefined,
            contactIds: audienceType === 'manual' ? Array.from(selectedContactIds) : undefined,
          },
          recipientCount: targetContacts.length,
          startDate,
          sendTime,
          timezone,
          monthlyRecurrence,
          dayOfMonth,
          active,
        },
        targetContacts
      );

      success('Campaign Created!', `"${newCampaign.name}" is scheduled for day ${dayOfMonth} monthly.`);
      onNavigate('campaign-details', newCampaign.id);
    } catch (err: any) {
      toastError('Creation Failed', err?.message || 'Failed to save campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back button & header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate('campaigns')}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Create Monthly Campaign
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure automated recurring monthly email and SMS/WhatsApp communications.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 1: Campaign Essentials */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-indigo-400" />
            1. Campaign Essentials
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Campaign Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Monthly Executive Briefing - 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Communication Channels (Multi-channel dispatch) *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleChannelToggle('email')}
                className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  channels.includes('email')
                    ? 'bg-blue-950/40 border-blue-500/60 text-white'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400'
                }`}
              >
                <Mail
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    channels.includes('email') ? 'text-blue-400' : 'text-slate-500'
                  }`}
                />
                <div>
                  <div className="text-xs font-bold text-white">Amazon SES Email</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Rich HTML newsletters & statements
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleChannelToggle('sms')}
                className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  channels.includes('sms')
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-white'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400'
                }`}
              >
                <MessageSquare
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    channels.includes('sms') ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                />
                <div>
                  <div className="text-xs font-bold text-white">Twilio SMS</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Direct SMS text reminders
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleChannelToggle('whatsapp')}
                className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  channels.includes('whatsapp')
                    ? 'bg-purple-950/40 border-purple-500/60 text-white'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400'
                }`}
              >
                <MessageSquare
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    channels.includes('whatsapp') ? 'text-purple-400' : 'text-slate-500'
                  }`}
                />
                <div>
                  <div className="text-xs font-bold text-white">Twilio WhatsApp</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    WhatsApp formatted broadcasts
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Template Picker */}
        {templates.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-xs text-slate-300 font-medium">
                Load content from pre-crafted template:
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {templates.slice(0, 3).map((tmpl) => (
                <button
                  type="button"
                  key={tmpl.id}
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg text-xs border border-slate-700 transition-colors"
                >
                  {tmpl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Section 2: Email Configuration */}
        {channels.includes('email') && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400" />
                2. Email Message (Amazon SES)
              </h2>
              {/* Variable chips */}
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span>Insert:</span>
                {['name', 'company', 'email'].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => insertVariable(v, 'email')}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded font-mono text-[10px]"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Subject Line *
              </label>
              <input
                type="text"
                required={channels.includes('email')}
                placeholder="e.g. Your Monthly Performance Digest - {{company}}"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Email Image */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Email Banner / Header Image (Firebase Storage)
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  placeholder="https://... or upload below"
                  value={emailImageUrl}
                  onChange={(e) => setEmailImageUrl(e.target.value)}
                  className="flex-1 w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 cursor-pointer flex items-center gap-2 shrink-0">
                  <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'email')}
                    className="hidden"
                  />
                </label>
              </div>
              {emailImageUrl && (
                <div className="mt-2 relative w-full h-32 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
                  <img
                    src={emailImageUrl}
                    alt="Email Banner Preview"
                    className="object-cover w-full h-full"
                  />
                  <button
                    type="button"
                    onClick={() => setEmailImageUrl('')}
                    className="absolute top-2 right-2 p-1 bg-black/70 text-white rounded-lg text-xs"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Body Content (HTML or plain text) *
              </label>
              <textarea
                rows={7}
                required={channels.includes('email')}
                placeholder="Hello {{name}}, welcome to your monthly update for {{company}}..."
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Section 3: SMS / WhatsApp Configuration */}
        {(channels.includes('sms') || channels.includes('whatsapp')) && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                3. SMS & WhatsApp Message (Twilio)
              </h2>
              {/* Variable chips */}
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span>Insert:</span>
                {['name', 'company'].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => insertVariable(v, 'sms')}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded font-mono text-[10px]"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Message Content *
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  {smsBody.length} chars (~{Math.ceil((smsBody.length || 1) / 160)} SMS segments)
                </span>
              </div>
              <textarea
                rows={4}
                required
                placeholder="Hi {{name}}! This is your monthly update from our team for {{company}}. Reply STOP to unsubscribe."
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white leading-relaxed focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* MMS / WhatsApp Media Image */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Message Image URL (MMS / WhatsApp Media)
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  placeholder="Optional media URL..."
                  value={smsImageUrl}
                  onChange={(e) => setSmsImageUrl(e.target.value)}
                  className="flex-1 w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 cursor-pointer flex items-center gap-2 shrink-0">
                  <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                  Attach Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'sms')}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Section 4: Target Recipients */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              4. Target Audience
            </h2>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {targetContacts.length} recipient{targetContacts.length === 1 ? '' : 's'} matched
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'all', label: 'All Subscribed', desc: 'All active contacts' },
              { id: 'tags', label: 'By Tag', desc: 'Specific audience tags' },
              { id: 'company', label: 'By Company', desc: 'Filtered by account' },
              { id: 'manual', label: 'Manual Pick', desc: 'Choose individually' },
            ].map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => setAudienceType(opt.id as any)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  audienceType === opt.id
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400'
                }`}
              >
                <div className="text-xs font-semibold text-white">{opt.label}</div>
                <div className="text-[11px] opacity-75 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>

          {audienceType === 'tags' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Select Tag Filter
              </label>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="w-full sm:w-72 px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">-- Choose a Tag --</option>
                {availableTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}

          {audienceType === 'company' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Select Company
              </label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full sm:w-72 px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">-- Choose a Company --</option>
                {availableCompanies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {audienceType === 'manual' && (
            <div className="border border-slate-800 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-800 bg-slate-950/40 p-2">
              {contacts.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 p-2 hover:bg-slate-850 rounded-lg cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selectedContactIds.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(selectedContactIds);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      setSelectedContactIds(next);
                    }}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span className="font-semibold text-white">{c.name}</span>
                  <span className="text-slate-400">({c.email})</span>
                  {c.company && (
                    <span className="ml-auto text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                      {c.company}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Section 5: Monthly Recurrence & Scheduling */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              5. Monthly Recurrence & Timing
            </h2>
            <span className="text-[11px] text-emerald-400 font-mono">
              Next Send: {new Date(nextSendPreview).toLocaleDateString()} @ {sendTime}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Day of Month */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Day of Month (1 - 31) *
              </label>
              <input
                type="number"
                min={1}
                max={31}
                required
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">Runs every month on this date</p>
            </div>

            {/* Send Time */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Send Time (HH:mm) *
              </label>
              <input
                type="time"
                required
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Timezone *
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Initial Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={monthlyRecurrence}
                  onChange={(e) => setMonthlyRecurrence(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span>Enable Monthly Recurrence</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span>Activate Immediately</span>
              </label>
            </div>

            <div className="text-[11px] text-amber-400/90 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" />
              Duplicate suppression guard ensures contacts are never messaged twice in the same monthly cycle.
            </div>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => onNavigate('campaigns')}
            className="px-5 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || targetContacts.length === 0}
            className="px-7 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? 'Scheduling Campaign...' : 'Save & Schedule Campaign'}
          </button>
        </div>
      </form>
    </div>
  );
};
