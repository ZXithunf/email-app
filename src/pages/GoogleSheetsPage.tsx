import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Link2,
  UploadCloud,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  Database,
  Plus,
  Table,
  Check,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  listUserGoogleSpreadsheets,
  getSpreadsheetDetails,
  readSpreadsheetSheetValues,
  parseSheetRowsToContacts,
  exportContactsToGoogleSheets,
  appendContactsToExistingSpreadsheet,
  extractSpreadsheetId,
  DriveSpreadsheetFile,
  SpreadsheetMetadata,
  GoogleSheetsImportPreview,
} from '../services/googleSheetsService';
import { fetchContacts, bulkImportValidatedContacts } from '../services/contactService';
import { Contact } from '../types';
import { ActivePage } from '../components/layout/AppLayout';

interface GoogleSheetsPageProps {
  onNavigate: (page: ActivePage) => void;
}

export const GoogleSheetsPage: React.FC<GoogleSheetsPageProps> = ({ onNavigate }) => {
  const { googleAccessToken, requestGoogleWorkspaceAuth, currentUser } = useAuth();
  const { success, error: toastError, info } = useToast();

  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'browse'>('import');
  const [existingContacts, setExistingContacts] = useState<Contact[]>([]);

  // Auth & Connection State
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // Drive Browse State
  const [spreadsheets, setSpreadsheets] = useState<DriveSpreadsheetFile[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);

  // Sheet Selection & Metadata
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState('');
  const [spreadsheetMetadata, setSpreadsheetMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [selectedSheetTitle, setSelectedSheetTitle] = useState('');

  // Import Preview State
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [importPreview, setImportPreview] = useState<GoogleSheetsImportPreview | null>(null);
  const [filterPreview, setFilterPreview] = useState<'all' | 'valid' | 'invalid'>('all');
  const [isImportingToDb, setIsImportingToDb] = useState(false);
  const [importFinished, setImportFinished] = useState<{ imported: number } | null>(null);

  // Export State
  const [exportTitle, setExportTitle] = useState(
    `Contacts - Contact Automation Platform (${new Date().toISOString().split('T')[0]})`
  );
  const [exportFilter, setExportFilter] = useState<'all' | 'subscribed'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [exportedSheet, setExportedSheet] = useState<{
    id: string;
    url: string;
    count: number;
  } | null>(null);

  // Load existing contacts on mount
  useEffect(() => {
    fetchContacts()
      .then((c) => setExistingContacts(c || []))
      .catch((err) => console.warn('Could not load existing contacts:', err));
  }, []);

  // If token is available, pre-load spreadsheets list
  useEffect(() => {
    if (googleAccessToken) {
      loadDriveSpreadsheets(googleAccessToken);
    }
  }, [googleAccessToken]);

  const loadDriveSpreadsheets = async (token: string) => {
    setIsLoadingDrive(true);
    try {
      const files = await listUserGoogleSpreadsheets(token);
      setSpreadsheets(files);
    } catch (err: any) {
      console.warn('Could not list drive spreadsheets:', err);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleConnectGoogle = async () => {
    setIsAuthorizing(true);
    try {
      const token = await requestGoogleWorkspaceAuth();
      success('Connected to Google Workspace', 'Access granted to Google Sheets & Drive.');
      await loadDriveSpreadsheets(token);
    } catch (err: any) {
      toastError('Connection Error', err?.message || 'Could not connect to Google Workspace.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleLoadSpreadsheetDetails = async (idOrUrl?: string) => {
    const raw = idOrUrl || spreadsheetInput;
    const cleanId = extractSpreadsheetId(raw);
    if (!cleanId) {
      toastError('Missing Spreadsheet ID', 'Please enter a valid Google Sheets URL or ID.');
      return;
    }

    if (!googleAccessToken) {
      toastError('Authorization Required', 'Please connect your Google account first.');
      return;
    }

    setIsLoadingMetadata(true);
    setSpreadsheetMetadata(null);
    setImportPreview(null);
    setImportFinished(null);

    try {
      const meta = await getSpreadsheetDetails(googleAccessToken, cleanId);
      setSpreadsheetMetadata(meta);
      setSelectedSpreadsheetId(cleanId);
      if (meta.sheets && meta.sheets.length > 0) {
        setSelectedSheetTitle(meta.sheets[0].title);
      }
      success('Spreadsheet Loaded', `Found ${meta.sheets.length} sheet tab(s) in "${meta.title}".`);
    } catch (err: any) {
      toastError('Could Not Load Sheet', err?.message);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleFetchSheetData = async () => {
    if (!googleAccessToken || !selectedSpreadsheetId || !selectedSheetTitle) {
      toastError('Selection Missing', 'Please select a spreadsheet and sheet tab.');
      return;
    }

    setIsLoadingRows(true);
    try {
      const rows = await readSpreadsheetSheetValues(
        googleAccessToken,
        selectedSpreadsheetId,
        selectedSheetTitle
      );

      if (rows.length < 2) {
        toastError('Empty Sheet', 'This sheet has no data rows. Expected header + data.');
        setIsLoadingRows(false);
        return;
      }

      // Re-fetch contacts to make sure deduplication is up-to-date
      const currentDbContacts = await fetchContacts();
      setExistingContacts(currentDbContacts);

      const parsed = parseSheetRowsToContacts(rows, currentDbContacts);
      setImportPreview(parsed);
      success(
        'Rows Evaluated',
        `Parsed ${parsed.totalRows} row(s): ${parsed.validCount} valid, ${parsed.invalidCount} flagged.`
      );
    } catch (err: any) {
      toastError('Read Error', err?.message);
    } finally {
      setIsLoadingRows(false);
    }
  };

  const handleCommitImport = async () => {
    if (!importPreview || importPreview.validCount === 0) return;

    setIsImportingToDb(true);
    try {
      const validRecords = importPreview.records.filter((r) => r.isValid);
      const res = await bulkImportValidatedContacts(
        validRecords,
        `Google Sheet: ${spreadsheetMetadata?.title || 'Import'}`
      );
      setImportFinished({ imported: res.importedCount });
      success('Contacts Imported', `Successfully added ${res.importedCount} contacts from Google Sheets!`);

      // Refresh local contacts list
      const refreshed = await fetchContacts();
      setExistingContacts(refreshed);
    } catch (err: any) {
      toastError('Import Failed', err?.message);
    } finally {
      setIsImportingToDb(false);
    }
  };

  const handleExecuteExport = async () => {
    if (!googleAccessToken) {
      toastError('Auth Required', 'Please connect Google account first.');
      return;
    }

    const contactsToExport =
      exportFilter === 'subscribed'
        ? existingContacts.filter((c) => c.status === 'subscribed')
        : existingContacts;

    if (contactsToExport.length === 0) {
      toastError('No Contacts', 'No contacts match the export selection.');
      return;
    }

    setExportConfirmOpen(false);
    setIsExporting(true);
    setExportedSheet(null);

    try {
      const result = await exportContactsToGoogleSheets(
        googleAccessToken,
        exportTitle,
        contactsToExport
      );
      setExportedSheet({
        id: result.spreadsheetId,
        url: result.spreadsheetUrl,
        count: result.totalExported,
      });
      success('Export Successful', `Created Google Sheet with ${result.totalExported} contacts!`);
      // Refresh drive list
      loadDriveSpreadsheets(googleAccessToken);
    } catch (err: any) {
      toastError('Export Failed', err?.message);
    } finally {
      setIsExporting(false);
    }
  };

  const filteredPreviewRecords = importPreview
    ? importPreview.records.filter((r) => {
        if (filterPreview === 'valid') return r.isValid;
        if (filterPreview === 'invalid') return !r.isValid;
        return true;
      })
    : [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Google Sheets Integration
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Connect live Google Spreadsheets to synchronize contacts, import audiences with duplicate protection, and export segmented lists to Google Drive.
          </p>
        </div>

        {/* Auth status indicator */}
        <div className="flex items-center gap-3">
          {googleAccessToken ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Workspace Connected</span>
            </div>
          ) : (
            <button
              onClick={handleConnectGoogle}
              disabled={isAuthorizing}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 rounded-xl text-xs font-semibold shadow-md transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              {isAuthorizing ? 'Connecting to Google...' : 'Connect Google Workspace'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('import')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'import'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          Import from Google Sheet
        </button>

        <button
          onClick={() => setActiveTab('export')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'export'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <DownloadCloud className="w-4 h-4" />
          Export Contacts to Google Sheets
        </button>

        <button
          onClick={() => setActiveTab('browse')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'browse'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          Browse Google Drive Files ({spreadsheets.length})
        </button>
      </div>

      {/* TAB 1: IMPORT FROM GOOGLE SHEETS */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {!googleAccessToken && (
            <div className="p-6 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/30 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Connect Google Workspace to import directly from Drive
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xl">
                  Authorize read access to select any Google Spreadsheet from your Google Drive, map contact columns, and validate duplicate phone numbers and emails automatically.
                </p>
              </div>
              <button
                onClick={handleConnectGoogle}
                disabled={isAuthorizing}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all shrink-0 shadow-lg shadow-emerald-500/20"
              >
                {isAuthorizing ? 'Connecting...' : 'Authorize Google Sheets Access'}
              </button>
            </div>
          )}

          {/* Spreadsheet Selector Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Link2 className="w-4 h-4 text-emerald-400" />
              1. Select Google Spreadsheet
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Google Sheet URL or Spreadsheet ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit or ID"
                    value={spreadsheetInput}
                    onChange={(e) => setSpreadsheetInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={() => handleLoadSpreadsheetDetails()}
                    disabled={isLoadingMetadata || !googleAccessToken}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50 shrink-0"
                  >
                    {isLoadingMetadata ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Load Sheet'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Or Pick from Your Drive Files
                </label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      setSpreadsheetInput(e.target.value);
                      handleLoadSpreadsheetDetails(e.target.value);
                    }
                  }}
                  disabled={!googleAccessToken || spreadsheets.length === 0}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">
                    {spreadsheets.length === 0
                      ? 'No spreadsheets found in Drive'
                      : 'Choose recent spreadsheet...'}
                  </option>
                  {spreadsheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Loaded Metadata Display */}
            {spreadsheetMetadata && (
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl mt-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider">
                      Active Spreadsheet
                    </span>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      {spreadsheetMetadata.title}
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${spreadsheetMetadata.spreadsheetId}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-emerald-400"
                        title="Open in Google Sheets"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </h4>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Select Tab:</span>
                    <select
                      value={selectedSheetTitle}
                      onChange={(e) => setSelectedSheetTitle(e.target.value)}
                      className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-medium focus:outline-none focus:border-emerald-500"
                    >
                      {spreadsheetMetadata.sheets.map((s) => (
                        <option key={s.sheetId} value={s.title}>
                          {s.title}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={handleFetchSheetData}
                      disabled={isLoadingRows}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-all disabled:opacity-50"
                    >
                      {isLoadingRows ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Fetching Rows...
                        </>
                      ) : (
                        <>
                          <Table className="w-3.5 h-3.5" />
                          Fetch Rows
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Import Complete Banner */}
          {importFinished && (
            <div className="p-5 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Import Successful!</h4>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    Added {importFinished.imported} validated contacts directly to your platform database.
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('contacts')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow"
              >
                View Contact Directory
              </button>
            </div>
          )}

          {/* Import Preview & Verification */}
          {importPreview && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    2. Verification & Duplicate Detection
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Found {importPreview.totalRows} data row(s) in tab "{selectedSheetTitle}".
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilterPreview('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      filterPreview === 'all'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({importPreview.totalRows})
                  </button>
                  <button
                    onClick={() => setFilterPreview('valid')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      filterPreview === 'valid'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Valid ({importPreview.validCount})
                  </button>
                  <button
                    onClick={() => setFilterPreview('invalid')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      filterPreview === 'invalid'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Flagged ({importPreview.invalidCount})
                  </button>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Rows</span>
                  <p className="text-lg font-bold text-white">{importPreview.totalRows}</p>
                </div>
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl">
                  <span className="text-[10px] text-emerald-400 uppercase font-semibold">
                    Ready to Import
                  </span>
                  <p className="text-lg font-bold text-emerald-300">{importPreview.validCount}</p>
                </div>
                <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-xl">
                  <span className="text-[10px] text-rose-400 uppercase font-semibold">
                    Flagged / Duplicates
                  </span>
                  <p className="text-lg font-bold text-rose-300">{importPreview.invalidCount}</p>
                </div>
              </div>

              {/* Table Preview */}
              <div className="max-h-80 overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">Name</th>
                      <th className="p-2.5">Email</th>
                      <th className="p-2.5">Phone</th>
                      <th className="p-2.5">Company</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredPreviewRecords.map((r) => (
                      <tr
                        key={r.rowIndex}
                        className={r.isValid ? 'hover:bg-slate-800/30' : 'bg-rose-950/10'}
                      >
                        <td className="p-2.5 font-mono text-slate-400">{r.rowIndex}</td>
                        <td className="p-2.5 font-medium text-white">{r.data.name}</td>
                        <td className="p-2.5 text-slate-300">{r.data.email}</td>
                        <td className="p-2.5 font-mono text-slate-400">{r.data.phone}</td>
                        <td className="p-2.5 text-slate-400">{r.data.company || '-'}</td>
                        <td className="p-2.5">
                          {r.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Valid
                            </span>
                          ) : (
                            <div className="text-[10px] text-rose-400 space-y-0.5">
                              {r.errors.map((err, idx) => (
                                <div key={idx} className="flex items-center gap-1">
                                  <XCircle className="w-3 h-3 shrink-0" />
                                  <span>{err}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-400">
                  Only the {importPreview.validCount} validated contact(s) will be committed.
                </span>

                <button
                  onClick={handleCommitImport}
                  disabled={isImportingToDb || importPreview.validCount === 0}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
                >
                  {isImportingToDb ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Importing to Platform...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Import {importPreview.validCount} Contacts into Platform
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: EXPORT CONTACTS TO GOOGLE SHEETS */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <DownloadCloud className="w-4 h-4 text-emerald-400" />
                Export Contacts to a New Google Spreadsheet
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Creates a new styled spreadsheet directly inside your Google Drive formatted with column headers, freeze-panes, and live contact data.
              </p>
            </div>

            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  New Spreadsheet Title
                </label>
                <input
                  type="text"
                  value={exportTitle}
                  onChange={(e) => setExportTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Audience Scope
                </label>
                <select
                  value={exportFilter}
                  onChange={(e) => setExportFilter(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">All Platform Contacts ({existingContacts.length})</option>
                  <option value="subscribed">
                    Subscribed Contacts Only (
                    {existingContacts.filter((c) => c.status === 'subscribed').length})
                  </option>
                </select>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setExportConfirmOpen(true)}
                  disabled={!googleAccessToken || isExporting || existingContacts.length === 0}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Creating Spreadsheet in Google Drive...
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-4 h-4" />
                      Create & Export to Google Sheets
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Export Success Result */}
            {exportedSheet && (
              <div className="p-5 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Google Sheet Created Successfully!</h4>
                    <p className="text-xs text-emerald-200 mt-0.5">
                      Exported {exportedSheet.count} contacts to "{exportTitle}".
                    </p>
                  </div>
                </div>

                <a
                  href={exportedSheet.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition-all shrink-0"
                >
                  <span>Open in Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: BROWSE GOOGLE DRIVE FILES */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-emerald-400" />
              Google Spreadsheets in Your Drive
            </h3>

            <button
              onClick={() => googleAccessToken && loadDriveSpreadsheets(googleAccessToken)}
              disabled={isLoadingDrive || !googleAccessToken}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrive ? 'animate-spin' : ''}`} />
              Refresh Drive Files
            </button>
          </div>

          {!googleAccessToken ? (
            <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
              <FileSpreadsheet className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-white">Connect Google Workspace</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Authorize your account to view and access spreadsheets stored in your Google Drive.
              </p>
              <button
                onClick={handleConnectGoogle}
                className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs"
              >
                Connect Now
              </button>
            </div>
          ) : spreadsheets.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
              <FileSpreadsheet className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-white">No Spreadsheets Found</h4>
              <p className="text-xs text-slate-400 mt-1">
                We could not find any Google Sheets in your Google Drive. You can create one via the Export tab!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {spreadsheets.map((sheet) => (
                <div
                  key={sheet.id}
                  className="p-4 bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 rounded-xl transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate group-hover:text-emerald-300">
                        {sheet.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Modified:{' '}
                        {sheet.modifiedTime
                          ? new Date(sheet.modifiedTime).toLocaleDateString()
                          : 'Recently'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setSpreadsheetInput(sheet.id);
                        setActiveTab('import');
                        handleLoadSpreadsheetDetails(sheet.id);
                      }}
                      className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold"
                    >
                      Import
                    </button>
                    {sheet.webViewLink && (
                      <a
                        href={sheet.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-400 hover:text-white"
                        title="Open in Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mandatory User Confirmation Dialog for Destructive/Mutating Operations per workspace-integration skill */}
      {exportConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Export to Google Sheets</h3>
                <p className="text-xs text-slate-400 mt-0.5">Google Drive file creation</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This action will create a new Google Spreadsheet titled{' '}
              <strong className="text-white">"{exportTitle}"</strong> in your Google Drive and write{' '}
              <strong className="text-emerald-400">
                {exportFilter === 'subscribed'
                  ? existingContacts.filter((c) => c.status === 'subscribed').length
                  : existingContacts.length}{' '}
                contact records
              </strong>{' '}
              with formatting into it.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setExportConfirmOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteExport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30"
              >
                Confirm & Create Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
