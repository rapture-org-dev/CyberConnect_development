import { useState } from 'react';
import { X, Upload, Loader } from 'lucide-react';
import type { SheetTab, ImportValidationPreview } from '@/types';
import * as XLSX from 'xlsx';
import { decodeCsvFileText, parseWorksheetForImport } from '@/lib/importSheet';
import { ColumnMappingUI } from './ColumnMappingUI';
import { translate, type Language } from '@/lib/data';

interface Props {
  tab: SheetTab;
  projectId: string;
  onClose: () => void;
  onMappingComplete: (result: ImportValidationPreview) => void;
  language?: Language;
  /** While reading the file or validating on the server — parent can show a global overlay if needed. */
  onImportPhaseChange?: (phase: null | 'reading' | 'validating') => void;
}

export function ImportModal({
  tab,
  projectId,
  onClose,
  onMappingComplete,
  language = 'en',
  onImportPhaseChange,
}: Props) {
  const [step, setStep] = useState<'upload' | 'mapping'>('upload');
  const [excelData, setExcelData] = useState<{
    columns: string[];
    rows: Record<string, unknown>[];
  } | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsv = file.name.endsWith('.csv');
    
    if (!isExcel && !isCsv) {
      setError('Please upload an Excel (.xlsx, .xls) or CSV (.csv) file');
      return;
    }

    setLoading(true);
    setError('');
    onImportPhaseChange?.('reading');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = isCsv
        ? XLSX.read(decodeCsvFileText(arrayBuffer), { type: 'string' })
        : XLSX.read(arrayBuffer, { type: 'array' });
      
      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setError('File has no sheets');
        setLoading(false);
        return;
      }
      
      const worksheet = workbook.Sheets[sheetName];

      // Use AOA parsing so duplicate column names and trailing columns are preserved
      const { columns, rows } = parseWorksheetForImport(worksheet);

      if (rows.length === 0) {
        setError('File has no data rows');
        setLoading(false);
        return;
      }

      if (columns.length === 0) {
        setError('File has no header row');
        setLoading(false);
        return;
      }

      setExcelData({ columns, rows });
      setStep('mapping');
    } catch (err: any) {
      setError(`Failed to parse file: ${err.message}`);
    } finally {
      setLoading(false);
      onImportPhaseChange?.(null);
    }
  };

  if (step === 'mapping' && excelData) {
    return (
      <ColumnMappingUI
        tab={tab}
        projectId={projectId}
        excelColumns={excelData.columns}
        excelRows={excelData.rows}
        language={language}
        onBack={() => {
          setStep('upload');
          setExcelData(null);
        }}
        onMappingComplete={onMappingComplete}
        onClose={onClose}
        onValidatingChange={(v) => onImportPhaseChange?.(v ? 'validating' : null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="relative bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-lg p-6 animate-fade-in shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-surface-950/80 backdrop-blur-sm">
            <Loader className="h-8 w-8 animate-spin text-brand-400" />
            <p className="mt-3 text-sm text-gray-200">{translate('Reading file…', language)}</p>
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Batch Import</h2>
            <p className="text-xs text-gray-500">Import data from Excel file</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-3 block">Select File</label>
            <label className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed border-surface-700 rounded-lg hover:border-brand-500/50 hover:bg-surface-800/50 cursor-pointer transition-all">
              <div className="flex flex-col items-center justify-center">
                <Upload className="w-8 h-8 text-gray-600 mb-2" />
                <p className="text-sm font-medium text-gray-300">
                  {loading
                    ? translate('Reading file…', language)
                    : 'Click to upload or drag'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Excel (.xlsx, .xls) or CSV (.csv)</p>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                disabled={loading}
                className="hidden"
              />
            </label>
          </div>

          <div className="text-xs text-gray-600 space-y-1">
            <p>• Supports Excel (.xlsx, .xls) and CSV files</p>
            <p>• Map columns to sheet fields</p>
            <p>• Detect conflicts automatically</p>
            <p>• Choose action for each conflict</p>
          </div>
        </div>
      </div>
    </div>
  );
}
