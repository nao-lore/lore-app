import React, { useRef, useState } from 'react';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import { addManualTodo } from '../storage';

interface TodoAddFormProps {
  lang: Lang;
  onRefresh: () => void;
  onClose: () => void;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export function TodoAddForm({ lang, onRefresh, onClose, showToast }: TodoAddFormProps) {
  const [newText, setNewText] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low' | ''>('');
  const [newDueDate, setNewDueDate] = useState('');
  const [todoError, setTodoError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    if (!newText.trim()) {
      setTodoError(t('todoInputRequired', lang));
      return;
    }
    setTodoError('');
    addManualTodo(newText.trim(), {
      priority: newPriority || undefined,
      dueDate: newDueDate || undefined,
    });
    setNewText('');
    setNewPriority('');
    setNewDueDate('');
    onRefresh();
    showToast?.(t('todoAdd', lang), 'success');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="content-card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={inputRef}
          className="input"
          type="text"
          value={newText}
          onChange={(e) => { setNewText(e.target.value); setTodoError(''); }}
          onBlur={() => { if (newText.trim() === '') setTodoError(t('todoInputRequired', lang)); }}
          onKeyDown={handleKeyDown}
          placeholder={t('todoAddPlaceholder', lang)}
          maxLength={200}
          style={{ flex: 1 }}
          autoFocus
        />
        <button className="btn btn-primary" onClick={handleAdd} disabled={!newText.trim()} style={{ flexShrink: 0 }}>
          {t('todoAddBtn', lang)}
        </button>
        <button className="btn" onClick={() => { onClose(); }} style={{ flexShrink: 0 }}>
          ×
        </button>
      </div>
      {todoError && (
        <p style={{ color: 'var(--error-text)', fontSize: 12, margin: '4px 0 0' }}>{todoError}</p>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          {t('todoSortPriority', lang)}:
          <select
            className="input input-sm"
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as '' | 'high' | 'medium' | 'low')}
            style={{ fontSize: 12, padding: '2px 6px', minHeight: 24 }}
          >
            <option value="">{t('todoPriorityNone', lang)}</option>
            <option value="high">{t('todoPriorityHigh', lang)}</option>
            <option value="medium">{t('todoPriorityMedium', lang)}</option>
            <option value="low">{t('todoPriorityLow', lang)}</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          {t('todoDueDate', lang)}:
          <input
            className="input input-sm"
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            style={{ fontSize: 12, padding: '2px 6px', minHeight: 24 }}
          />
        </label>
      </div>
    </div>
  );
}
