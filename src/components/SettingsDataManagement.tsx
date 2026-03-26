import { useState, useRef, memo } from 'react';
import { Download, Upload, AlertTriangle } from 'lucide-react';
import { useFocusTrap } from '../useFocusTrap';
import { exportAllData, validateBackup, importData, getDataUsage, formatBytes } from '../storage';
import type { LoreBackup } from '../storage';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import { todayISO } from '../utils/dateFormat';

interface SettingsDataManagementProps {
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export const SettingsDataManagement = memo(function SettingsDataManagement({ lang, showToast }: SettingsDataManagementProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ backup: LoreBackup; mode: 'merge' | 'overwrite' } | null>(null);
  const importTrapRef = useFocusTrap<HTMLDivElement>(!!pendingImport);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const backup = exportAllData();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = todayISO();
    a.href = url;
    a.download = `lore-backup-${date}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast?.(t('dataExportSuccess', lang), 'success');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (typeof reader.result !== 'string') return;
        const parsed = JSON.parse(reader.result);
        if (!validateBackup(parsed)) {
          setImportError(t('dataImportError', lang));
          return;
        }
        setPendingImport({ backup: parsed, mode: 'merge' });
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[SettingsPanel] import parse:', err);
        setImportError(t('dataImportError', lang));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportConfirm = () => {
    if (!pendingImport) return;
    const result = importData(pendingImport.backup, pendingImport.mode);
    setPendingImport(null);
    showToast?.(tf('dataImportSuccess', lang, result.logs, result.projects, result.todos), 'success');
  };

  return (
    <>
      <div className="content-card">
        <div className="content-card-header">{t('dataLabel', lang)}</div>
        <p className="meta meta-desc">
          {t('dataStorageNotice', lang)}
        </p>

        {/* Data Usage */}
        {(() => {
          const usage = getDataUsage();
          const barColor = usage.percentage >= 100 ? 'var(--error-text)' : usage.percentage >= 80 ? 'var(--warning-text, #f59e0b)' : 'var(--accent)';
          const isWarning = usage.percentage >= 80;
          return (
            <div className="data-usage-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('dataUsageLabel', lang)}
                </span>
                <span style={{ fontSize: 12, color: isWarning ? barColor : 'var(--text-muted)', fontWeight: isWarning ? 600 : 400 }}>
                  {formatBytes(usage.usedBytes)} / {formatBytes(usage.limitBytes)}
                </span>
              </div>
              <div className="progress-bar-track">
                <div style={{
                  height: '100%',
                  width: `${Math.min(usage.percentage, 100)}%`,
                  background: barColor,
                  borderRadius: 3,
                  transition: 'width 0.3s',
                }} />
              </div>
              {isWarning && (
                <p style={{ fontSize: 12, color: barColor, marginTop: 6, marginBottom: 0, fontWeight: 500 }}>
                  {t('dataUsageWarning', lang)}
                </p>
              )}
            </div>
          );
        })()}

        {/* Export */}
        <div className="mb-lg">
          <p className="meta mb-8 fs-13">
            {t('dataExportDesc', lang)}
          </p>
          <button className="btn btn-primary flex-row gap-6" onClick={handleExport}>
            <Download size={14} /> {t('dataExport', lang)}
          </button>
        </div>

        {/* Import */}
        <div>
          <p className="meta mb-8 fs-13">
            {t('dataImportDesc', lang)}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
            aria-label={t('dataImport', lang)}
          />
          <button className="btn flex-row gap-6" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> {t('dataImport', lang)}
          </button>
          {importError && (
            <p style={{ color: 'var(--error-text)', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> {importError}
            </p>
          )}
        </div>
      </div>

      {/* Import confirmation dialog */}
      {pendingImport && (
        <div className="modal-overlay" role="presentation" onClick={() => setPendingImport(null)}>
          <div ref={importTrapRef} className="modal-card max-w-420" role="dialog" aria-modal="true" aria-label={t('dataImport', lang)} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-md">{t('dataImport', lang)}</h3>
            <div className="flex-col-gap-md gap-10 mb-lg">
              <button
                className={`btn import-mode-btn${pendingImport.mode === 'merge' ? ' btn-primary' : ''}`}
                onClick={() => setPendingImport({ ...pendingImport, mode: 'merge' })}
              >
                <div className="import-mode-title">{t('dataImportMerge', lang)}</div>
                <div className="meta fs-12" style={{ marginTop: 2 }}>{t('dataImportConfirmMerge', lang)}</div>
              </button>
              <button
                className={`btn import-mode-btn${pendingImport.mode === 'overwrite' ? ' btn-primary' : ''}`}
                onClick={() => setPendingImport({ ...pendingImport, mode: 'overwrite' })}
              >
                <div className="import-mode-title">{t('dataImportOverwrite', lang)}</div>
                <div className="meta fs-12" style={{ marginTop: 2 }}>{t('dataImportConfirmOverwrite', lang)}</div>
              </button>
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn" onClick={() => setPendingImport(null)}>{t('cancel', lang)}</button>
              <button className="btn btn-primary" onClick={handleImportConfirm}>
                {pendingImport.mode === 'overwrite' ? t('dataImportOverwrite', lang) : t('dataImportMerge', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
