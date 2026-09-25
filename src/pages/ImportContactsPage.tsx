import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  ArrowRight,
  RefreshCw,
  Eye,
  Check,
  Trash2,
  Sparkles,
} from 'lucide-react';
import {
  parseExcelFile,
  downloadSampleExcelTemplate,
  ParseExcelResult,
} from '../utils/excelParser';
import { fetchContacts, bulkImportValidatedContacts } from '../services/contactService';
import { Contact, ValidatedImportRecord } from '../types';
import { useToast } from '../contexts/ToastContext';
import { ActivePage } from '../components/layout/AppLayout';

interface ImportContactsPageProps {
  onNavigate: (page: ActivePage) => void;
}

export const ImportContactsPage: React.FC<ImportContactsPageProps> = ({ onNavigate }) => {
  const { success, error: toastError, info } = useToast();
  const [existingContacts, setExistingContacts] = useState<Contact[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseExcelResult | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'invalid'>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [importComplete, setImportComplete] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number>(0);

  useEffect(() => {
    fetchContacts()
      .then((c) => setExistingContacts(c || []))
      .catch((err) => console.warn('Could not prefetch existing contacts:', err));
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    processFile(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const processFile = async (uploadedFile: File) => {
    if (!uploadedFile.name.match(/\.(xlsx|xls)$/i)) {
      toastError('Invalid File Format', 'Please upload a valid Microsoft Excel file (.xlsx or .xls).');
      return;
    }

    setFile(uploadedFile);
    setIsParsing(true);
    setImportComplete(false);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const result = await parseExcelFile(buffer, existingContacts);
      setParseResult(result);
      success(
        'Excel File Parsed',
        `Found ${result.records.length} total rows. ${result.validCount} valid, ${result.invalidCount} with issues.`
      );
    } catch (err: any) {
      toastError('Parsing Failed', err?.message || 'Unable to parse Excel file');
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleRemoveRow = (index: number) => {
    if (!parseResult) return;
    const updatedRecords = [...parseResult.records];
    const removed = updatedRecords.splice(index, 1)[0];

    const validCount = updatedRecords.filter((r) => r.isValid).length;
    const invalidCount = updatedRecords.filter((r) => !r.isValid).length;

    setParseResult({
      ...parseResult,
      records: updatedRecords,
      validCount,
      invalidCount,
    });
  };

  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.validCount === 0) {
      toastError('No Valid Records', 'There are no valid records to import.');
      return;
    }

    const validOnly = parseResult.records.filter((r) => r.isValid);

    setIsImporting(true);
    try {
      const res = await bulkImportValidatedContacts(
        validOnly,
        file?.name || 'excel_import.xlsx'
      );
      setImportedCount(res.importedCount);
      setImportComplete(true);
      success('Import Successful!', `Successfully imported ${res.importedCount} contacts into Firestore.`);
    } catch (err: any) {
      toastError('Import Failed', err?.message || 'An error occurred saving records to Firestore.');
    } finally {
      setIsImporting(false);
    }
  };

  const displayedRecords = parseResult
    ? parseResult.records.filter((r) => {
        if (filterTab === 'valid') return r.isValid;
        if (filterTab === 'invalid') return !r.isValid;
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Import Contacts</h1>
          <p className="text-xs text-slate-400 mt-1">
            Upload .xlsx or .xls Excel files. The system validates syntax and flags duplicate emails/phones before importing.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('google-sheets')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-xl border border-emerald-500/40 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Import from Google Sheets
          </button>
          <button
            onClick={() => downloadSampleExcelTemplate()}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            Download Excel Template (.xlsx)
          </button>
        </div>
      </div>

      {/* Completion Banner */}
      {importComplete ? (
        <div className="bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-600/50 p-8 rounded-2xl text-center shadow-xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Import Successfully Completed!</h2>
          <p className="text-xs text-slate-300 max-w-md mx-auto">
            <strong>{importedCount} valid contacts</strong> have been written to the Firestore database. Invalid or duplicate records were safely excluded.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => onNavigate('contacts')}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all flex items-center gap-2"
            >
              View Contacts Directory
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('create-campaign')}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            >
              Schedule Campaign
            </button>
            <button
              onClick={() => {
                setParseResult(null);
                setFile(null);
                setImportComplete(false);
              }}
              className="px-4 py-2.5 text-xs text-slate-400 hover:text-white"
            >
              Upload Another
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-700/80 hover:border-indigo-500/70 bg-slate-900/40 hover:bg-slate-900/80 rounded-2xl p-8 text-center transition-all cursor-pointer relative group"
          >
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">
                  {file ? file.name : 'Choose Excel file or drag & drop here'}
                </p>
                <p className="text-xs text-slate-400">
                  Supports Microsoft Excel (.xlsx, .xls) up to 10MB
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                Required columns: Name, Email, Phone, Company, Tags
              </div>
            </div>
          </div>

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="p-8 text-center bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col items-center gap-3">
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
              <p className="text-xs text-slate-300">
                Reading Excel workbook, verifying email patterns and detecting duplicate phone numbers...
              </p>
            </div>
          )}

          {/* Validation & Preview Section */}
          {parseResult && (
            <div className="space-y-6">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Total In File
                  </span>
                  <p className="text-2xl font-bold text-white mt-1">
                    {parseResult.records.length}
                  </p>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-800/40 p-4 rounded-xl">
                  <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">
                    Valid Records
                  </span>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">
                    {parseResult.validCount}
                  </p>
                  <p className="text-[10px] text-emerald-500/80 mt-1">Ready for import</p>
                </div>

                <div className="bg-rose-950/20 border border-rose-800/40 p-4 rounded-xl">
                  <span className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">
                    Invalid / Issues
                  </span>
                  <p className="text-2xl font-bold text-rose-400 mt-1">
                    {parseResult.invalidCount}
                  </p>
                  <p className="text-[10px] text-rose-500/80 mt-1">Will be skipped</p>
                </div>

                <div className="bg-amber-950/20 border border-amber-800/40 p-4 rounded-xl">
                  <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
                    Duplicates Caught
                  </span>
                  <p className="text-2xl font-bold text-amber-400 mt-1">
                    {parseResult.duplicateCount + parseResult.existingDuplicateCount}
                  </p>
                  <p className="text-[10px] text-amber-500/80 mt-1">In file or existing DB</p>
                </div>
              </div>

              {/* Filter Tabs & Confirm Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/70 border border-slate-800 p-4 rounded-2xl">
                <div className="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60">
                  <button
                    onClick={() => setFilterTab('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      filterTab === 'all'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All Rows ({parseResult.records.length})
                  </button>
                  <button
                    onClick={() => setFilterTab('valid')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      filterTab === 'valid'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Valid Only ({parseResult.validCount})
                  </button>
                  <button
                    onClick={() => setFilterTab('invalid')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      filterTab === 'invalid'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Issues / Invalid ({parseResult.invalidCount})
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 hidden md:inline">
                    Only verified valid records will be saved
                  </span>
                  <button
                    onClick={handleConfirmImport}
                    disabled={isImporting || parseResult.validCount === 0}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Writing to Firestore...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Confirm & Import {parseResult.validCount} Valid Records
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 font-semibold uppercase tracking-wider">
                        <th className="p-3.5 w-14">Row</th>
                        <th className="p-3.5">Validation</th>
                        <th className="p-3.5">Name</th>
                        <th className="p-3.5">Email</th>
                        <th className="p-3.5">Phone</th>
                        <th className="p-3.5">Company</th>
                        <th className="p-3.5">Tags</th>
                        <th className="p-3.5 text-right">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {displayedRecords.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">
                            No records in this tab.
                          </td>
                        </tr>
                      ) : (
                        displayedRecords.map((item, idx) => (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-800/30 transition-colors ${
                              !item.isValid ? 'bg-rose-950/15' : ''
                            }`}
                          >
                            <td className="p-3.5 font-mono text-slate-400">
                              #{item.rowIndex}
                            </td>
                            <td className="p-3.5">
                              {item.isValid ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Valid
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  {item.errors.map((err, errIdx) => (
                                    <div
                                      key={errIdx}
                                      className="inline-flex items-center gap-1 text-[10px] text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 font-medium mr-1 mb-0.5"
                                    >
                                      <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                      {err}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-3.5 font-semibold text-white">
                              {item.data.name || <span className="text-rose-400">Missing</span>}
                            </td>
                            <td className="p-3.5">
                              {item.data.email ? (
                                item.data.email
                              ) : (
                                <span className="text-rose-400 font-medium">Missing Email</span>
                              )}
                            </td>
                            <td className="p-3.5 font-mono">
                              {item.data.phone || <span className="text-rose-400">Missing</span>}
                            </td>
                            <td className="p-3.5 text-slate-400">{item.data.company || '—'}</td>
                            <td className="p-3.5">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {item.data.tags && item.data.tags.length > 0 ? (
                                  item.data.tags.map((t) => (
                                    <span
                                      key={t}
                                      className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]"
                                    >
                                      {t}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-500 text-[11px]">—</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() => handleRemoveRow(idx)}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                                title="Exclude this row from import"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
