import type { SheetTab } from '@/types';
import { Download, Search, Languages } from 'lucide-react';
import { useState } from 'react';
import type { Language, ProjectSheetRole } from '@/lib/data';
import { getClientRemarkColumnKeys, getLocalizedTabName } from '@/lib/data';

interface Props {
  /** Resolved workspace role on the active project (sheet RBAC). */
  projectSheetRole: ProjectSheetRole;
  tab: SheetTab;
  totalRows: number;
  projectName?: string;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onExport: () => void;
  /** Hide CSV/PDF export (e.g. special views with no sheet rows). */
  showExport?: boolean;
}

export function Header({
  projectSheetRole,
  tab,
  totalRows,
  projectName,
  language,
  onLanguageChange,
  onExport,
  showExport = true,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const toggleLanguage = () => {
    onLanguageChange(language === 'en' ? 'ja' : 'en');
  };

  return (
    <header className="bg-surface-900 border-b border-surface-700 px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-white truncate">{getLocalizedTabName(tab, language)}</h1>
          <p className="text-base text-gray-500">
            {projectName && <><span className="text-gray-400">{projectName}</span> &middot; </>}
            {totalRows} items
          </p>
        </div>

        <div className="flex-1 max-w-sm mx-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search / 検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-11 pr-4 py-3 text-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40 transition"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {projectSheetRole === 'client' && getClientRemarkColumnKeys(tab.id).length > 0 && (
            <span className="text-sm px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Remarks only (EN/JA)
            </span>
          )}
          {projectSheetRole === 'client' && getClientRemarkColumnKeys(tab.id).length === 0 && (
            <span className="text-sm px-2.5 py-1 rounded-full bg-surface-800 text-gray-400 border border-surface-700">
              Read-only
            </span>
          )}

          <button
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-gray-300 hover:text-white hover:border-surface-200 text-base font-medium transition-all"
            title={language === 'en' ? 'Switch to Japanese' : '英語に切り替え'}
          >
            <Languages className="w-4 h-4" />
            {language === 'en' ? 'EN' : 'JP'}
          </button>

          {showExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-gray-300 hover:text-white hover:border-surface-200 text-base font-medium transition-all"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
