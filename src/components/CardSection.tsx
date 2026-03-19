import { memo } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import type { NextActionItem } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';

const CardSection = memo(function CardSection({ title, items, isNew, lang }: { title: string; items: string[]; isNew?: (item: string) => boolean; lang?: Lang }) {
  if (items.length === 0) return null;
  return (
    <div className="content-card">
      <div className="content-card-header">{title}</div>
      <ul className="list-disc">
        {items.map((item, i) => {
          const fresh = isNew?.(item);
          return (
            <li key={i} className="card-list-item">
              <span className="flex-1">{item}</span>
              {fresh && <span className="new-item-badge">{lang ? t('newBadge', lang) : 'NEW'}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
});

const CheckableCardSection = memo(function CheckableCardSection({ title, items, checkedIndices, onToggle, richItems, lang }: { title: string; items: string[]; checkedIndices: number[]; onToggle: (index: number) => void; richItems?: NextActionItem[]; lang?: Lang }) {
  if (items.length === 0) return null;
  const doneCount = checkedIndices.length;
  return (
    <div className="content-card">
      <div className="content-card-header card-list-header">
        {title}
        {items.length > 0 && <span className="text-placeholder fs-12" style={{ fontWeight: 500 }}>{doneCount}/{items.length}</span>}
      </div>
      <ul className="list-none">
        {items.map((item, i) => {
          const checked = checkedIndices.includes(i);
          const rich = richItems?.[i];
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onToggle(i)}
                className="btn-reset checkable-list-item"
                role="checkbox"
                aria-checked={checked}
                style={{ color: checked ? 'var(--text-placeholder)' : 'var(--text-body)', textDecoration: checked ? 'line-through' : 'none' }}
              >
                <span className="shrink-0 mt-3">
                  {checked ? <CheckSquare size={16} style={{ color: 'var(--accent)' }} /> : <Square size={16} className="text-placeholder" />}
                </span>
                <span>
                  {item}
                  {rich && (rich.whyImportant || rich.priorityReason || rich.dueBy || (rich.dependsOn && rich.dependsOn.length > 0)) && (
                    <span className="flex flex-wrap" style={{ gap: '2px 8px', marginTop: 2 }}>
                      {rich.whyImportant && (
                        <span className="rich-meta">
                          {lang ? t('richWhy', lang) : 'Why:'} {rich.whyImportant}
                        </span>
                      )}
                      {rich.priorityReason && (
                        <span className="rich-meta">
                          {lang ? t('richPriority', lang) : 'Priority:'} {rich.priorityReason}
                        </span>
                      )}
                      {rich.dependsOn && rich.dependsOn.length > 0 && (
                        <span className="rich-meta-sm">
                          {lang ? t('richDependsOn', lang) : 'Depends on:'} {rich.dependsOn.join(', ')}
                        </span>
                      )}
                      {rich.dueBy && (
                        <span className="rich-due-badge">
                          {rich.dueBy}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

export { CardSection, CheckableCardSection };
