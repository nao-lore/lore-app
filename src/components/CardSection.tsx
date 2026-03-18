import { CheckSquare, Square } from 'lucide-react';
import type { NextActionItem } from '../types';

function CardSection({ title, items, isNew }: { title: string; items: string[]; isNew?: (item: string) => boolean }) {
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
              {fresh && <span className="new-item-badge">NEW</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CheckableCardSection({ title, items, checkedIndices, onToggle, richItems }: { title: string; items: string[]; checkedIndices: number[]; onToggle: (index: number) => void; richItems?: NextActionItem[] }) {
  if (items.length === 0) return null;
  const doneCount = checkedIndices.length;
  return (
    <div className="content-card">
      <div className="content-card-header card-list-header">
        {title}
        {items.length > 0 && <span className="text-placeholder" style={{ fontSize: 12, fontWeight: 500 }}>{doneCount}/{items.length}</span>}
      </div>
      <ul className="list-none">
        {items.map((item, i) => {
          const checked = checkedIndices.includes(i);
          const rich = richItems?.[i];
          return (
            <li
              key={i}
              onClick={() => onToggle(i)}
              className="checkable-list-item"
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
                        Why: {rich.whyImportant}
                      </span>
                    )}
                    {rich.priorityReason && (
                      <span className="rich-meta">
                        Priority: {rich.priorityReason}
                      </span>
                    )}
                    {rich.dependsOn && rich.dependsOn.length > 0 && (
                      <span className="rich-meta-sm">
                        Depends on: {rich.dependsOn.join(', ')}
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { CardSection, CheckableCardSection };
