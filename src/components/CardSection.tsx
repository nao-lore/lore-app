import { CheckSquare, Square } from 'lucide-react';
import type { NextActionItem } from '../types';

function CardSection({ title, items, isNew }: { title: string; items: string[]; isNew?: (item: string) => boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="content-card">
      <div className="content-card-header">{title}</div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => {
          const fresh = isNew?.(item);
          return (
            <li key={i} style={{ marginBottom: 6, fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ flex: 1 }}>{item}</span>
              {fresh && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg, #f3f0ff)', padding: '1px 5px', borderRadius: 3, flexShrink: 0, marginTop: 3 }}>NEW</span>}
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
      <div className="content-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title}
        {items.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-placeholder)', fontWeight: 500 }}>{doneCount}/{items.length}</span>}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((item, i) => {
          const checked = checkedIndices.includes(i);
          const rich = richItems?.[i];
          return (
            <li
              key={i}
              onClick={() => onToggle(i)}
              style={{ marginBottom: 4, fontSize: 14, lineHeight: 1.7, color: checked ? 'var(--text-placeholder)' : 'var(--text-body)', display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', textDecoration: checked ? 'line-through' : 'none', padding: '4px 0', userSelect: 'none' }}
            >
              <span style={{ flexShrink: 0, marginTop: 3 }}>
                {checked ? <CheckSquare size={16} style={{ color: 'var(--accent)' }} /> : <Square size={16} style={{ color: 'var(--text-placeholder)' }} />}
              </span>
              <span>
                {item}
                {rich && (rich.whyImportant || rich.priorityReason || rich.dueBy || (rich.dependsOn && rich.dependsOn.length > 0)) && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: 2 }}>
                    {rich.whyImportant && (
                      <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                        Why: {rich.whyImportant}
                      </span>
                    )}
                    {rich.priorityReason && (
                      <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                        Priority: {rich.priorityReason}
                      </span>
                    )}
                    {rich.dependsOn && rich.dependsOn.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>
                        Depends on: {rich.dependsOn.join(', ')}
                      </span>
                    )}
                    {rich.dueBy && (
                      <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--bg-card)', borderRadius: 4, padding: '1px 6px', fontWeight: 500 }}>
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
