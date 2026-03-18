import type { TransformResult, HandoffResult } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';

export function WorklogResultDisplay({ result, lang }: { result: TransformResult; lang: Lang }) {
  return (
    <>
      <Section title={t('sectionToday', lang)} items={result.today} />
      <Section title={t('sectionDecisions', lang)} items={result.decisions} />
      <Section title={t('sectionTodo', lang)} items={result.todo} />
      <Section title={t('sectionRelatedProjects', lang)} items={result.relatedProjects} />
      {result.tags.length > 0 && (
        <div className="mt-lg">
          {result.tags.map((tag, i) => <span key={i} className="tag">{tag}</span>)}
        </div>
      )}
    </>
  );
}

export function HandoffResultDisplay({ result, lang }: { result: HandoffResult; lang: Lang }) {
  return (
    <>
      {/* Session Context (handoffMeta) */}
      {result.handoffMeta && (result.handoffMeta.sessionFocus || result.handoffMeta.whyThisSession || result.handoffMeta.timePressure) && (
        <div className="resume-context-hero mb-md">
          <div className="resume-context-hero-label">{lang === 'ja' ? 'セッション概要' : 'Session Context'}</div>
          <div className="resume-context-hero-body">
            {[
              result.handoffMeta.sessionFocus && `Focus: ${result.handoffMeta.sessionFocus}`,
              result.handoffMeta.whyThisSession && `Why: ${result.handoffMeta.whyThisSession}`,
              result.handoffMeta.timePressure && `Time: ${result.handoffMeta.timePressure}`,
            ].filter(Boolean).join('\n')}
          </div>
        </div>
      )}
      {/* Resume Checklist */}
      {result.resumeChecklist && result.resumeChecklist.length > 0 ? (
        <div className="resume-context-hero">
          <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
          <div className="resume-context-hero-body">
            {result.resumeChecklist.map((item, i) => {
              const parts = [item.action];
              if (item.whyNow) parts.push(`  → ${item.whyNow}`);
              if (item.ifSkipped) parts.push(`  ⚠ ${item.ifSkipped}`);
              return `${i + 1}. ${parts.join('\n')}`;
            }).join('\n')}
          </div>
        </div>
      ) : result.resumeContext.length > 0 && (
        <div className="resume-context-hero">
          <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
          <div className="resume-context-hero-body">{result.resumeContext.join('\n')}</div>
        </div>
      )}
      <Section title={t('sectionCurrentStatus', lang)} items={result.currentStatus} />
      <Section title={t('sectionNextActions', lang)} items={result.nextActions} />
      {result.actionBacklog && result.actionBacklog.length > 0 && (
        <Section title={lang === 'ja' ? 'バックログ' : 'Action Backlog'} items={result.actionBacklog.map(a => a.action)} />
      )}
      <Section title={t('sectionCompleted', lang)} items={result.completed} />
      <Section title={t('sectionDecisions', lang)} items={result.decisions} />
      <Section title={t('sectionBlockers', lang)} items={result.blockers} />
      <Section title={t('sectionConstraints', lang)} items={result.constraints} />
      {result.tags.length > 0 && (
        <div className="mt-lg">
          {result.tags.map((tag, i) => <span key={i} className="tag">{tag}</span>)}
        </div>
      )}
    </>
  );
}

function Section({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="section">
      <h4>{title}</h4>
      <ul>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
}
