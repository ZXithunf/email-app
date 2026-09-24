import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  Mail,
  MessageSquare,
  Sparkles,
  Copy,
  X,
  Check,
} from 'lucide-react';
import { MessageTemplate, ChannelType } from '../types';
import {
  subscribeToTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  seedStarterTemplatesIfEmpty,
} from '../services/templateService';
import { useToast } from '../contexts/ToastContext';
import { ActivePage } from '../components/layout/AppLayout';

interface TemplatesPageProps {
  onNavigate: (page: ActivePage) => void;
}

export const TemplatesPage: React.FC<TemplatesPageProps> = ({ onNavigate }) => {
  const { success, error: toastError } = useToast();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [activeChannelFilter, setActiveChannelFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [channel, setChannel] = useState<ChannelType>('email');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    seedStarterTemplatesIfEmpty();
    const unsub = subscribeToTemplates(setTemplates);
    return () => unsub();
  }, []);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setName('');
    setCategory('Monthly Digest');
    setChannel('email');
    setSubject('');
    setContent('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: MessageTemplate) => {
    setEditingTemplate(t);
    setName(t.name);
    setCategory(t.category || 'General');
    setChannel(t.channel);
    setSubject(t.subject || '');
    setContent(t.content);
    setIsModalOpen(true);
  };

  const insertVariable = (variableKey: string) => {
    setContent((prev) => prev + ` {{${variableKey}}}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      toastError('Validation Error', 'Template name and content are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, {
          name: name.trim(),
          category: category.trim(),
          channel,
          subject: channel === 'email' ? subject.trim() : undefined,
          content: content.trim(),
        });
        success('Template Updated', `Updated "${name}"`);
      } else {
        await createTemplate({
          name: name.trim(),
          category: category.trim(),
          channel,
          subject: channel === 'email' ? subject.trim() : undefined,
          content: content.trim(),
          variables: ['name', 'company', 'email', 'phone'],
        });
        success('Template Created', `Added "${name}" to library`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      toastError('Save Error', err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, templateName: string) => {
    if (!window.confirm(`Delete template "${templateName}"?`)) return;
    try {
      await deleteTemplate(id);
      success('Template Deleted', `Removed "${templateName}"`);
    } catch (err: any) {
      toastError('Delete Failed', err?.message);
    }
  };

  const filtered = templates.filter((t) =>
    activeChannelFilter === 'all' ? true : t.channel === activeChannelFilter
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Message Templates
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pre-crafted reusable email, SMS, and WhatsApp templates with dynamic variable insertion.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/25 transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Template
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {['all', 'email', 'sms', 'whatsapp'].map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannelFilter(ch)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
              activeChannelFilter === ch
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {ch === 'all' ? 'All Channels' : ch}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((template) => (
          <div
            key={template.id}
            className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg hover:border-slate-700 transition-all group"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 ${
                    template.channel === 'email'
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      : template.channel === 'sms'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  }`}
                >
                  {template.channel === 'email' && <Mail className="w-2.5 h-2.5" />}
                  {template.channel === 'sms' && <MessageSquare className="w-2.5 h-2.5" />}
                  {template.channel === 'whatsapp' && <MessageSquare className="w-2.5 h-2.5" />}
                  {template.channel}
                </span>

                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                  {template.category || 'General'}
                </span>
              </div>

              <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                {template.name}
              </h3>

              {template.subject && (
                <p className="text-xs text-indigo-300/90 font-medium mt-1 truncate">
                  Subject: {template.subject}
                </p>
              )}

              <div className="mt-3 p-3 bg-slate-950/60 rounded-xl border border-slate-850 text-xs text-slate-300 font-mono line-clamp-4 leading-relaxed whitespace-pre-wrap">
                {template.content}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-2">
              <button
                onClick={() => onNavigate('create-campaign')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Use in Campaign
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenEdit(template)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  title="Edit Template"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(template.id, template.name)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Delete Template"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-5 top-5 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">
              {editingTemplate ? 'Edit Template' : 'Create New Template'}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Insert variable placeholders to personalize messages per contact during monthly runs.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Monthly VIP Check-in"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Newsletter, Billing, Promo"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Target Channel *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['email', 'sms', 'whatsapp'] as ChannelType[]).map((ch) => (
                    <button
                      type="button"
                      key={ch}
                      onClick={() => setChannel(ch)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold uppercase tracking-wider transition-all ${
                        channel === ch
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              {channel === 'email' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Email Subject Line *
                  </label>
                  <input
                    type="text"
                    required={channel === 'email'}
                    placeholder="e.g. Monthly Executive Briefing - {{company}}"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Template Content *
                  </label>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <span>Insert:</span>
                    {['name', 'company', 'email', 'phone'].map((v) => (
                      <button
                        type="button"
                        key={v}
                        onClick={() => insertVariable(v)}
                        className="px-1.5 py-0.5 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded font-mono"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={6}
                  required
                  placeholder={
                    channel === 'email'
                      ? '<h2>Hello {{name}},</h2><p>Here is your monthly report for {{company}}...</p>'
                      : 'Hi {{name}}! This is your monthly update for {{company}}. Reply STOP to opt out.'
                  }
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingTemplate ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
