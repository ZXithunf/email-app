import React, { useState, useEffect, useMemo } from 'react';
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
  FileText,
  HelpCircle,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  Phone,
  Mail,
  Building,
  Tag,
  Layers,
  Info,
} from 'lucide-react';
import {
  parseExcelFile,
  downloadSampleExcelTemplate,
  downloadSampleCsvTemplate,
  ParseExcelResult,
  ColumnMappingConfig,
} from '../utils/excelParser';
import { fetchContacts, bulkImportValidatedContacts } from '../services/contactService';
import { Contact, ValidatedImportRecord } from '../types';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { ActivePage } from '../components/layout/AppLayout';

interface ImportContactsPageProps {
  onNavigate: (page: ActivePage) => void;
}

export const ImportContactsPage: React.FC<ImportContactsPageProps> = ({ onNavigate }) => {
  const { success, error: toastError, info } = useToast();
  const { currentUser } = useAuth();
  const [existingContacts, setExistingContacts] = useState<Contact[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsingStage, setParsingStage] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [parseResult, setParseResult] = useState<ParseExcelResult | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'invalid'>('all');
  const [previewSearch, setPreviewSearch] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [allowPhoneOnly, setAllowPhoneOnly] = useState(true);

  // Sheet & Mapping Configuration
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [showMappingConfig, setShowMappingConfig] = useState(false);
  const [customMapping, setCustomMapping] = useState<ColumnMappingConfig>({});

  // Pagination for Preview Table (Fast DOM performance, no lag)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Firestore Import Execution State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; percentage: number }>({
    current: 0,
    total: 0,
    percentage: 0,
  });
  const [importComplete, setImportComplete] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number>(0);
  const [updatedCount, setUpdatedCount] = useState<number>(0);

  useEffect(() => {
    fetchContacts(currentUser?.uid)
      .then((c) => setExistingContacts(c || []))
      .catch((err) => console.warn('Could not prefetch existing contacts:', err));
  }, [currentUser?.uid]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    processUploadedFile(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processUploadedFile(droppedFile);
    }
  };

  const processUploadedFile = async (
    uploadedFile: File,
    overrideSheet?: string,
    overrideMapping?: ColumnMappingConfig
  ) => {
    // Lenient extension and mime verification
    const nameLower = uploadedFile.name.toLowerCase();
    const hasSpreadsheetExt =
      nameLower.endsWith('.xlsx') ||
      nameLower.endsWith('.xls') ||
      nameLower.endsWith('.csv') ||
      nameLower.endsWith('.tsv') ||
      nameLower.endsWith('.xlsm') ||
      nameLower.endsWith('.ods') ||
      nameLower.endsWith('.txt');

    const hasSpreadsheetMime =
      uploadedFile.type.includes('spreadsheet') ||
      uploadedFile.type.includes('csv') ||
      uploadedFile.type.includes('excel') ||
      uploadedFile.type.includes('octet-stream') ||
      uploadedFile.type === '';

    if (!hasSpreadsheetExt && !hasSpreadsheetMime) {
      toastError(
        'Spreadsheet Format Notice',
        'Please upload an Excel workbook (.xlsx, .xls, .csv, or .tsv).'
      );
    }

    setFile(uploadedFile);
    setIsParsing(true);
    setParsingStage('Reading spreadsheet file...');
    setImportComplete(false);
    setCurrentPage(1);

    try {
      // Read array buffer
      const buffer = fileBuffer || (await uploadedFile.arrayBuffer());
      if (!fileBuffer) {
        setFileBuffer(buffer);
      }

      setParsingStage('Detecting headers and auto-matching columns...');

      // Small async delay allows React to paint loading state immediately
      await new Promise((r) => setTimeout(r, 40));

      const result = await parseExcelFile(buffer, existingContacts, {
        sheetName: overrideSheet || selectedSheet || undefined,
        columnMapping: overrideMapping || customMapping,
        allowPhoneOnly,
      });

      setParseResult(result);
      setSelectedSheet(result.activeSheetName);

      // Sync custom mapping state with detected result
      setCustomMapping({
        nameCol: result.mappedColumns.nameCol,
        emailCol: result.mappedColumns.emailCol,
        phoneCol: result.mappedColumns.phoneCol,
        companyCol: result.mappedColumns.companyCol,
        tagsCol: result.mappedColumns.tagsCol,
      });

      success(
        'Spreadsheet Processed Successfully',
        `Analyzed ${result.records.length} contact rows: ${result.validCount} valid contacts ready.`
      );
    } catch (err: any) {
      toastError(
        'Spreadsheet Parsing Failed',
        err?.message || 'Unable to parse spreadsheet. Please verify headers exist.'
      );
      setParseResult(null);
    } finally {
      setIsParsing(false);
      setParsingStage('');
    }
  };

  // Re-run parsing when sheet changes or mapping changes
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (file && fileBuffer) {
      setIsParsing(true);
      setParsingStage(`Loading worksheet "${sheetName}"...`);
      setTimeout(async () => {
        try {
          const res = await parseExcelFile(fileBuffer, existingContacts, {
            sheetName,
            columnMapping: undefined, // Let auto-detection run for the new sheet
            allowPhoneOnly,
          });
          setParseResult(res);
          setCustomMapping({
            nameCol: res.mappedColumns.nameCol,
            emailCol: res.mappedColumns.emailCol,
            phoneCol: res.mappedColumns.phoneCol,
            companyCol: res.mappedColumns.companyCol,
            tagsCol: res.mappedColumns.tagsCol,
          });
          setCurrentPage(1);
        } catch (err: any) {
          toastError('Error switching sheet', err?.message);
        } finally {
          setIsParsing(false);
          setParsingStage('');
        }
      }, 30);
    }
  };

  const handleMappingChange = (field: keyof ColumnMappingConfig, colIdx: number) => {
    const nextMapping = {
      ...customMapping,
      [field]: colIdx,
    };
    setCustomMapping(nextMapping);

    if (file && fileBuffer) {
      setIsParsing(true);
      setParsingStage('Re-evaluating contacts with new column mapping...');
      setTimeout(async () => {
        try {
          const res = await parseExcelFile(fileBuffer, existingContacts, {
            sheetName: selectedSheet,
            columnMapping: nextMapping,
            allowPhoneOnly,
          });
          setParseResult(res);
          setCurrentPage(1);
        } catch (err: any) {
          toastError('Mapping update error', err?.message);
        } finally {
          setIsParsing(false);
          setParsingStage('');
        }
      }, 30);
    }
  };

  const handleToggleAllowPhoneOnly = (checked: boolean) => {
    setAllowPhoneOnly(checked);
    if (file && fileBuffer) {
      setIsParsing(true);
      setTimeout(async () => {
        try {
          const res = await parseExcelFile(fileBuffer, existingContacts, {
            sheetName: selectedSheet,
            columnMapping: customMapping,
            allowPhoneOnly: checked,
          });
          setParseResult(res);
          setCurrentPage(1);
        } catch (err: any) {
          toastError('Update error', err?.message);
        } finally {
          setIsParsing(false);
        }
      }, 30);
    }
  };

  const handleRemoveRow = (rowIndex: number) => {
    if (!parseResult) return;
    const updatedRecords = parseResult.records.filter((r) => r.rowIndex !== rowIndex);
    const validCount = updatedRecords.filter((r) => r.isValid).length;
    const invalidCount = updatedRecords.filter((r) => !r.isValid).length;
    const phoneOnlyCount = updatedRecords.filter((r) => r.isPhoneOnly).length;

    setParseResult({
      ...parseResult,
      records: updatedRecords,
      validCount,
      invalidCount,
      phoneOnlyCount,
    });
  };

  // Eligible records based on updateExisting toggle
  const eligibleRecords = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.records.filter(
      (r) => r.isValid || (updateExisting && r.isExistingInDb && !r.isDuplicateInFile)
    );
  }, [parseResult, updateExisting]);

  const handleConfirmImport = async () => {
    if (!parseResult || eligibleRecords.length === 0) {
      toastError(
        'No Records to Import',
        updateExisting
          ? 'No valid or updatable records were found.'
          : 'All records in file already exist in database or have errors. Enable "Update existing contacts" to refresh records.'
      );
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: eligibleRecords.length, percentage: 0 });

    try {
      const res = await bulkImportValidatedContacts(
        eligibleRecords,
        file?.name || 'excel_import',
        {
          updateExisting,
          existingContacts,
          userId: currentUser?.uid,
          ownerEmail: currentUser?.email || undefined,
          onProgress: (p) => setImportProgress(p),
        }
      );

      setImportedCount(res.importedCount);
      setUpdatedCount(res.updatedCount);
      setImportComplete(true);

      const msg =
        res.updatedCount > 0
          ? `Imported ${res.importedCount} new contacts and updated ${res.updatedCount} existing records for ${currentUser?.email || 'your account'}.`
          : `Successfully imported ${res.importedCount} contacts into your private database.`;

      success('Import Finished!', msg);

      // Refresh local contacts list
      fetchContacts(currentUser?.uid).then((c) => setExistingContacts(c || []));
    } catch (err: any) {
      toastError('Import Failed', err?.message || 'An error occurred writing records to Firestore.');
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered & Paginated records for instantaneous table rendering
  const filteredRecords = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.records.filter((r) => {
      // Tab filter
      if (filterTab === 'valid') {
        const isEligible = r.isValid || (updateExisting && r.isExistingInDb && !r.isDuplicateInFile);
        if (!isEligible) return false;
      } else if (filterTab === 'invalid') {
        const isEligible = r.isValid || (updateExisting && r.isExistingInDb && !r.isDuplicateInFile);
        if (isEligible) return false;
      }

      // Search query filter
      if (previewSearch.trim()) {
        const q = previewSearch.toLowerCase();
        const matches =
          r.data.name.toLowerCase().includes(q) ||
          r.data.email.toLowerCase().includes(q) ||
          r.data.phone.includes(q) ||
          r.data.company.toLowerCase().includes(q) ||
          r.data.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [parseResult, filterTab, updateExisting, previewSearch]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Import Contacts</h1>
          <p className="text-xs text-slate-400 mt-1">
            Fast Excel (.xlsx, .xls) and CSV parser with auto-column matching, phone number cleaner (+91), and duplicate protection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigate('google-sheets')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-xl border border-emerald-500/40 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Import from Google Sheets
          </button>
          <button
            onClick={() => downloadSampleExcelTemplate()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors shadow-sm"
            title="Download sample .xlsx template"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            Excel Template (.xlsx)
          </button>
          <button
            onClick={() => downloadSampleCsvTemplate()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors shadow-sm"
            title="Download sample .csv template"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            CSV Template (.csv)
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
            <strong>{importedCount} new contacts</strong> written to database
            {updatedCount > 0 && <>, and <strong>{updatedCount} existing contacts</strong> updated</>}.
            Duplicates and invalid records were safely handled.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => onNavigate('contacts')}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              View Contacts Directory
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('campaigns')}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Go to Campaigns
            </button>
            <button
              onClick={() => {
                setParseResult(null);
                setFile(null);
                setFileBuffer(null);
                setImportComplete(false);
                setImportedCount(0);
                setUpdatedCount(0);
              }}
              className="px-4 py-2.5 text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Upload Another File
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer relative group ${
              isDragging
                ? 'border-indigo-400 bg-indigo-950/40 scale-[1.01]'
                : 'border-slate-700/80 hover:border-indigo-500/70 bg-slate-900/40 hover:bg-slate-900/80'
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.xlsm,.ods,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
              onChange={handleFileChange}
              onClick={(e) => {
                (e.target as HTMLInputElement).value = '';
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">
                  {file ? file.name : 'Choose Excel (.xlsx, .xls) or CSV file, or drag & drop here'}
                </p>
                <p className="text-xs text-slate-400">
                  Instant detection for Name, Email, Phone/WhatsApp, Company, and Tags. Supports 10,000+ rows.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Supports Microsoft Excel, CSV, Google Sheets exports & Phone-only lists</span>
              </div>
            </div>
          </div>

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="p-8 text-center bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col items-center gap-3">
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
              <p className="text-xs text-slate-300 font-medium">
                {parsingStage || 'Parsing spreadsheet and matching columns...'}
              </p>
              <span className="text-[11px] text-slate-500">Processing cleanly in memory without freezing</span>
            </div>
          )}

          {/* Validation & Preview Section */}
          {parseResult && (
            <div className="space-y-6">
              {/* Sheet Selection Tab (if multi-sheet) */}
              {parseResult.availableSheets.length > 1 && (
                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold mr-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Worksheets:</span>
                  </div>
                  {parseResult.availableSheets.map((sName) => (
                    <button
                      key={sName}
                      onClick={() => handleSheetChange(sName)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedSheet === sName
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                      }`}
                    >
                      {sName}
                    </button>
                  ))}
                </div>
              )}

              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Total Rows
                  </span>
                  <p className="text-2xl font-bold text-white mt-1">
                    {parseResult.records.length}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Found in sheet</p>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-800/40 p-4 rounded-xl">
                  <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">
                    New Valid Contacts
                  </span>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">
                    {parseResult.validCount}
                  </p>
                  <p className="text-[10px] text-emerald-500/80 mt-1">
                    Ready to insert {parseResult.phoneOnlyCount > 0 && `(${parseResult.phoneOnlyCount} phone-only)`}
                  </p>
                </div>

                <div className="bg-amber-950/20 border border-amber-800/40 p-4 rounded-xl">
                  <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
                    Already in Database
                  </span>
                  <p className="text-2xl font-bold text-amber-400 mt-1">
                    {parseResult.existingDuplicateCount}
                  </p>
                  <p className="text-[10px] text-amber-400/80 mt-1">
                    {updateExisting ? 'Will be updated' : 'Will be skipped'}
                  </p>
                </div>

                <div className="bg-rose-950/20 border border-rose-800/40 p-4 rounded-xl">
                  <span className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">
                    Invalid / File Duplicates
                  </span>
                  <p className="text-2xl font-bold text-rose-400 mt-1">
                    {parseResult.invalidCount - parseResult.existingDuplicateCount}
                  </p>
                  <p className="text-[10px] text-rose-500/80 mt-1">Missing required data</p>
                </div>
              </div>

              {/* Column Mapping & Settings Bar */}
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-semibold text-white">Column Mapping & Options</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      Auto-Matched
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allowPhoneOnly}
                        onChange={(e) => handleToggleAllowPhoneOnly(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                      />
                      <span>Allow Phone-only contacts (for WhatsApp/SMS)</span>
                    </label>
                    <button
                      onClick={() => setShowMappingConfig(!showMappingConfig)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
                    >
                      {showMappingConfig ? 'Hide Mapping' : 'Customize Column Mapping'}
                    </button>
                  </div>
                </div>

                {/* Collapsible Column Selectors */}
                {showMappingConfig && (
                  <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-400" />
                        Name Column
                      </label>
                      <select
                        value={customMapping.nameCol ?? -1}
                        onChange={(e) => handleMappingChange('nameCol', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value={-1}>-- Not Mapped (Derive) --</option>
                        {parseResult.availableColumns.map((c) => (
                          <option key={c.index} value={c.index}>
                            {c.label} {c.sample ? `(${c.sample})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        Email Column
                      </label>
                      <select
                        value={customMapping.emailCol ?? -1}
                        onChange={(e) => handleMappingChange('emailCol', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value={-1}>-- Not Mapped --</option>
                        {parseResult.availableColumns.map((c) => (
                          <option key={c.index} value={c.index}>
                            {c.label} {c.sample ? `(${c.sample})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        Phone / WhatsApp
                      </label>
                      <select
                        value={customMapping.phoneCol ?? -1}
                        onChange={(e) => handleMappingChange('phoneCol', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value={-1}>-- Not Mapped --</option>
                        {parseResult.availableColumns.map((c) => (
                          <option key={c.index} value={c.index}>
                            {c.label} {c.sample ? `(${c.sample})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Building className="w-3 h-3 text-slate-400" />
                        Company Column
                      </label>
                      <select
                        value={customMapping.companyCol ?? -1}
                        onChange={(e) => handleMappingChange('companyCol', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value={-1}>-- Not Mapped --</option>
                        {parseResult.availableColumns.map((c) => (
                          <option key={c.index} value={c.index}>
                            {c.label} {c.sample ? `(${c.sample})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-slate-400" />
                        Tags Column
                      </label>
                      <select
                        value={customMapping.tagsCol ?? -1}
                        onChange={(e) => handleMappingChange('tagsCol', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value={-1}>-- Not Mapped --</option>
                        {parseResult.availableColumns.map((c) => (
                          <option key={c.index} value={c.index}>
                            {c.label} {c.sample ? `(${c.sample})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Duplicate Strategy Option */}
              {parseResult.existingDuplicateCount > 0 && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold text-amber-200">
                        {parseResult.existingDuplicateCount} contact{parseResult.existingDuplicateCount === 1 ? '' : 's'} already exist in your database
                      </p>
                      <p className="text-slate-300 text-[11px] mt-0.5">
                        By default, existing contacts are preserved without creating duplicates. You can choose to update their information with this sheet.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-900/80 px-3 py-2 rounded-lg border border-amber-500/30 hover:border-amber-500/60 select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-white">
                      Update existing records
                    </span>
                  </label>
                </div>
              )}

              {/* Progress Bar (During Firestore write) */}
              {isImporting && (
                <div className="bg-slate-900/90 border border-indigo-500/50 p-5 rounded-2xl space-y-3 shadow-xl">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                      Writing contacts to Firestore database...
                    </span>
                    <span className="font-mono text-indigo-300 font-bold">
                      {importProgress.current} / {importProgress.total} ({importProgress.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${importProgress.percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Filter Tabs, Search & Confirm Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/70 border border-slate-800 p-4 rounded-2xl">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60">
                    <button
                      onClick={() => {
                        setFilterTab('all');
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        filterTab === 'all'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All Rows ({parseResult.records.length})
                    </button>
                    <button
                      onClick={() => {
                        setFilterTab('valid');
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        filterTab === 'valid'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Eligible ({eligibleRecords.length})
                    </button>
                    <button
                      onClick={() => {
                        setFilterTab('invalid');
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        filterTab === 'invalid'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Issues ({parseResult.records.length - eligibleRecords.length})
                    </button>
                  </div>

                  {/* Search inside preview */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filter preview rows..."
                      value={previewSearch}
                      onChange={(e) => {
                        setPreviewSearch(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-44"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 hidden lg:inline">
                    {eligibleRecords.length} records ready
                  </span>
                  <button
                    onClick={handleConfirmImport}
                    disabled={isImporting || eligibleRecords.length === 0}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Importing {importProgress.current} / {importProgress.total}...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Confirm & Import {eligibleRecords.length} Records
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Preview Table with Pagination */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 font-semibold uppercase tracking-wider">
                        <th className="p-3.5 w-14">Row</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Name</th>
                        <th className="p-3.5">Email</th>
                        <th className="p-3.5">Phone / WhatsApp</th>
                        <th className="p-3.5">Company</th>
                        <th className="p-3.5">Tags</th>
                        <th className="p-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {paginatedRecords.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">
                            No records matching current filter or search.
                          </td>
                        </tr>
                      ) : (
                        paginatedRecords.map((item) => {
                          const isEligible =
                            item.isValid || (updateExisting && item.isExistingInDb && !item.isDuplicateInFile);

                          return (
                            <tr
                              key={item.rowIndex}
                              className={`hover:bg-slate-800/30 transition-colors ${
                                !isEligible ? 'bg-rose-950/15' : item.isExistingInDb ? 'bg-amber-950/10' : ''
                              }`}
                            >
                              <td className="p-3.5 font-mono text-slate-400">
                                #{item.rowIndex}
                              </td>
                              <td className="p-3.5">
                                {item.isValid ? (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                      <CheckCircle2 className="w-3 h-3" />
                                      {item.isPhoneOnly ? 'Phone Contact' : 'New Contact'}
                                    </span>
                                    {item.warnings && item.warnings.map((w, wIdx) => (
                                      <div key={wIdx} className="text-[10px] text-amber-300/80 font-medium">
                                        ℹ️ {w}
                                      </div>
                                    ))}
                                  </div>
                                ) : item.isExistingInDb ? (
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                    updateExisting
                                      ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
                                      : 'text-slate-400 bg-slate-800 border-slate-700'
                                  }`}>
                                    {updateExisting ? 'Will Update' : 'Existing in DB'}
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
                                {item.data.name || <span className="text-rose-400">Missing Name</span>}
                              </td>
                              <td className="p-3.5">
                                {item.isPhoneOnly ? (
                                  <span className="text-slate-400 italic text-[11px]">
                                    (Phone only - auto ID assigned)
                                  </span>
                                ) : item.data.email ? (
                                  item.data.email
                                ) : (
                                  <span className="text-rose-400 font-medium">Missing Email</span>
                                )}
                              </td>
                              <td className="p-3.5 font-mono">
                                {item.data.phone ? (
                                  <span className="text-emerald-300 font-medium">{item.data.phone}</span>
                                ) : (
                                  <span className="text-slate-500 italic">None</span>
                                )}
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
                                  onClick={() => handleRemoveRow(item.rowIndex)}
                                  className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                                  title="Exclude this row from import"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="p-3.5 border-t border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>Showing</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 bg-slate-800 border border-slate-700 rounded-md text-white text-xs"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span>rows of {filteredRecords.length} filtered items</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-40 text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-semibold text-white">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-40 text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
