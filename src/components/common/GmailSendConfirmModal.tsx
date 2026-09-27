import React from 'react';
import { Mail, AlertTriangle, ShieldCheck, X, Send, UserCheck } from 'lucide-react';

export interface GmailSendConfirmModalProps {
  isOpen: boolean;
  senderEmail?: string;
  recipientsCount: number;
  recipientSamples?: { name: string; email: string }[];
  subject: string;
  isBulk?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const GmailSendConfirmModal: React.FC<GmailSendConfirmModalProps> = ({
  isOpen,
  senderEmail,
  recipientsCount,
  recipientSamples = [],
  subject,
  isBulk = false,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Confirm Gmail API Email Dispatch
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Explicit confirmation required to send emails on your behalf
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-amber-300 text-xs leading-relaxed">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">
                You are about to dispatch real emails through Google Workspace:
              </p>
              <p className="mt-1 text-slate-300">
                This will send <span className="font-bold text-white">{recipientsCount} email{recipientsCount === 1 ? '' : 's'}</span> using your connected Gmail account. These emails will appear in your Google account's Sent folder.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                Sender Account:
              </span>
              <span className="font-mono font-medium text-white truncate max-w-[240px]">
                {senderEmail || 'Connected Google Account'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-slate-400">Email Subject:</span>
              <span className="font-medium text-white truncate max-w-[260px]">
                {subject || '(No Subject)'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-slate-400">Total Recipients:</span>
              <span className="font-bold text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                {recipientsCount} recipient{recipientsCount === 1 ? '' : 's'}
              </span>
            </div>

            {recipientSamples.length > 0 && (
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 block mb-2 font-medium">Recipient Preview:</span>
                <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                  {recipientSamples.slice(0, 4).map((r, i) => (
                    <div key={i} className="flex justify-between text-[11px] text-slate-300">
                      <span className="truncate">{r.name}</span>
                      <span className="font-mono text-slate-400">{r.email}</span>
                    </div>
                  ))}
                  {recipientsCount > 4 && (
                    <div className="text-[11px] text-slate-500 italic text-center pt-1">
                      + {recipientsCount - 4} more recipients
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Authorized under OAuth scope <code className="text-slate-300">gmail.send</code></span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 rounded-xl shadow-lg shadow-red-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Dispatching via Gmail...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Confirm & Send via Gmail</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
