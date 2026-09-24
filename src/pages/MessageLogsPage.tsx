import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Mail,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  Eye,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { MessageLog, ChannelType, MessageLogStatus } from '../types';
import { subscribeToMessageLogs } from '../services/schedulerService';
import { useToast } from '../contexts/ToastContext';

export const MessageLogsPage: React.FC = () => {
  const { info } = useToast();
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [inspectingLog, setInspectingLog] = useState<MessageLog | null>(null);

  useEffect(() => {
    const unsub = subscribeToMessageLogs(setLogs, 200);
    return () => unsub();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        l.contactName?.toLowerCase().includes(q) ||
        l.destination?.toLowerCase().includes(q) ||
        l.campaignName?.toLowerCase().includes(q) ||
        (l.providerMessageId && l.providerMessageId.toLowerCase().includes(q));

      const matchesChannel =
        selectedChannel === 'all' || l.channel === selectedChannel;

      const matchesStatus =
        selectedStatus === 'all' || l.status === selectedStatus;

      return matchesSearch && matchesChannel && matchesStatus;
    });
  }, [logs, searchQuery, selectedChannel, selectedStatus]);

  const handleExportLogs = () => {
    if (filteredLogs.length === 0) return;
    const rows = filteredLogs.map((l) => ({
      Timestamp: l.sentAt || l.scheduledAt,
      Campaign: l.campaignName,
      Recipient: l.contactName,
      Destination: l.destination,
      Channel: l.channel,
      Provider: l.provider,
      ProviderMessageId: l.providerMessageId || '',
      MonthCycle: l.monthCycle,
      Status: l.status,
      Error: l.error || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DeliveryLogs');
    XLSX.writeFile(wb, `message_logs_${Date.now()}.xlsx`);
    info('Exported', `Exported ${rows.length} log records to Excel.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Delivery & Audit Logs
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Immutable audit record of every multi-channel monthly dispatch attempt and duplicate suppression event.
          </p>
        </div>

        <button
          onClick={handleExportLogs}
          disabled={filteredLogs.length === 0}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Export Logs (.xlsx)
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by contact name, email/phone, campaign, or provider message ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="w-full md:w-36 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Channels</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full md:w-40 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="skipped_duplicate">Duplicate Guard</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Campaign</th>
                <th className="p-3.5">Recipient</th>
                <th className="p-3.5">Channel</th>
                <th className="p-3.5">Cycle</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="font-semibold text-white">No delivery records found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {logs.length === 0
                        ? 'Dispatch a monthly campaign to see live audit logs appear here'
                        : 'No records match your filter criteria'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(log.sentAt || log.scheduledAt).toLocaleString()}
                    </td>
                    <td className="p-3.5 font-semibold text-white max-w-xs truncate">
                      {log.campaignName}
                    </td>
                    <td className="p-3.5">
                      <div className="font-medium text-slate-200">{log.contactName}</div>
                      <div className="text-[11px] text-slate-400">{log.destination}</div>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                          log.channel === 'email'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : log.channel === 'sms'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}
                      >
                        {log.channel === 'email' && <Mail className="w-2.5 h-2.5" />}
                        {log.channel === 'sms' && <MessageSquare className="w-2.5 h-2.5" />}
                        {log.channel === 'whatsapp' && <MessageSquare className="w-2.5 h-2.5" />}
                        {log.channel}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-slate-300">
                      {log.monthCycle}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                          log.status === 'sent'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : log.status === 'skipped_duplicate'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : log.status === 'failed'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}
                      >
                        {log.status === 'sent' && <CheckCircle2 className="w-3 h-3" />}
                        {log.status === 'skipped_duplicate' && <ShieldCheck className="w-3 h-3" />}
                        {log.status === 'failed' && <XCircle className="w-3 h-3" />}
                        {log.status === 'queued' && <Clock className="w-3 h-3" />}
                        {log.status === 'skipped_duplicate' ? 'Duplicate Guard' : log.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setInspectingLog(log)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="View Full Delivery Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between text-xs text-slate-400">
          <span>
            Displaying {filteredLogs.length} of {logs.length} audit records
          </span>
          <span>Preserved in Firestore messageLogs collection</span>
        </div>
      </div>

      {/* Inspect Log Modal */}
      {inspectingLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setInspectingLog(null)}
              className="absolute right-5 top-5 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                Audit Record Details
              </span>
            </div>
            <h3 className="text-lg font-bold text-white mb-4">{inspectingLog.campaignName}</h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Recipient Name:</span>
                  <span className="text-white font-medium">{inspectingLog.contactName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Destination:</span>
                  <span className="text-white font-mono">{inspectingLog.destination}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Channel & Provider:</span>
                  <span className="text-white uppercase font-bold">
                    {inspectingLog.channel} ({inspectingLog.provider})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Monthly Cycle Key:</span>
                  <span className="text-white font-mono">{inspectingLog.monthCycle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Delivery Status:</span>
                  <span className="text-emerald-400 font-bold uppercase">
                    {inspectingLog.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Provider Message ID:</span>
                  <span className="text-indigo-300 font-mono text-[11px]">
                    {inspectingLog.providerMessageId || 'N/A'}
                  </span>
                </div>
              </div>

              {inspectingLog.error && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300">
                  <span className="font-bold block mb-0.5">Reported Note / Error:</span>
                  <p className="text-[11px] leading-relaxed">{inspectingLog.error}</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setInspectingLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
