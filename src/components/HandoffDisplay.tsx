import { Copy } from 'lucide-react';
import { loadLogs, getMasterNote } from '../storage';
import { formatHandoffMarkdown, formatFullAiContext } from '../formatHandoff';
import { generateProjectContext } from '../generateProjectContext';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import type { LogEntry, Project } from '../types';

interface HandoffDisplayProps {
  log: LogEntry;
  lang: Lang;
  projects: Project[];
  showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
}

export default function HandoffDisplay({ log, lang, projects, showToast }: HandoffDisplayProps) {
  return (
    <>
      <div className="flex gap-sm mb-md">
        <button
          className="btn flex-row gap-6"
          onClick={async () => {
            try {
              const handoffMd = formatHandoffMarkdown(log);
              await navigator.clipboard.writeText(handoffMd);
              showToast?.(t('logCopied', lang), 'success');
            } catch {
              showToast?.(t('copyFailed', lang), 'error');
            }
          }}
        >
          <Copy size={14} />
          {t('copyHandoff', lang)}
        </button>
        {log.projectId && projects.find(p => p.id === log.projectId) && (
          <button
            className="btn btn-primary flex-row gap-6"
            title={t('copyAiContextTitle', lang)}
            onClick={async () => {
              try {
                const project = projects.find(p => p.id === log.projectId);
                const mn = getMasterNote(log.projectId!);
                if (!project || !mn) { showToast?.(t('aiContextNeeded', lang), 'default'); return; }
                const freshLogs = loadLogs();
                const ctx = generateProjectContext(mn, freshLogs, project.name);
                const aiContextMd = formatFullAiContext(ctx, log);
                const handoffMd = formatHandoffMarkdown(log);
                await navigator.clipboard.writeText(aiContextMd + '\n\n---\n\n' + handoffMd);
                showToast?.(t('logCopied', lang), 'success');
              } catch {
                showToast?.(t('copyFailed', lang), 'error');
              }
            }}
          >
            <Copy size={14} />
            {t('copyAiContext', lang)}
          </button>
        )}
      </div>
      {/* Session Context (handoffMeta) */}
      {log.handoffMeta && (log.handoffMeta.sessionFocus || log.handoffMeta.whyThisSession || log.handoffMeta.timePressure) && (
        <div className="resume-context-hero resume-hero-mb-sm">
          <div className="resume-context-hero-label">{lang === 'ja' ? 'セッション概要' : 'Session Context'}</div>
          <div className="resume-context-hero-body">
            {[
              log.handoffMeta.sessionFocus && `Focus: ${log.handoffMeta.sessionFocus}`,
              log.handoffMeta.whyThisSession && `Why: ${log.handoffMeta.whyThisSession}`,
              log.handoffMeta.timePressure && `Time: ${log.handoffMeta.timePressure}`,
            ].filter(Boolean).join('\n')}
          </div>
        </div>
      )}
      {/* Resume Checklist (structured or legacy) */}
      {(() => {
        if (log.resumeChecklist && log.resumeChecklist.length > 0) {
          return (
            <div className="resume-context-hero resume-hero-mb-md">
              <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
              <div className="resume-context-hero-body">
                {log.resumeChecklist.map((item, i) => {
                  const parts = [item.action];
                  if (item.whyNow) parts.push(`  → ${item.whyNow}`);
                  if (item.ifSkipped) parts.push(`  ⚠ ${item.ifSkipped}`);
                  return `${i + 1}. ${parts.join('\n')}`;
                }).join('\n')}
              </div>
            </div>
          );
        }
        const resumeItems = log.resumeContext || (log.resumePoint ? [log.resumePoint] : []);
        return resumeItems.length > 0 ? (
          <div className="resume-context-hero resume-hero-mb-md">
            <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
            <div className="resume-context-hero-body">{resumeItems.join('\n')}</div>
          </div>
        ) : null;
      })()}
    </>
  );
}
