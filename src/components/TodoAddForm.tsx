import React, { useRef, useState, memo } from 'react';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import { addManualTodo } from '../storage';

interface TodoAddFormProps {
  lang: Lang;
  onRefresh: () => void;
  onClose: () => void;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export const TodoAddForm = memo(function TodoAddForm({ lang, onRefresh, onClose, showToast }: TodoAddFormProps) {
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
    <div className="content-card mb-20">
      <div className="todo-add-row">
        <input
          ref={inputRef}
          type="text"
          value={newText}
          onChange={(e) => { setNewText(e.target.value); setTodoError(''); }}
          onBlur={() => { if (newText.trim() === '') setTodoError(t('todoInputRequired', lang)); }}
          onKeyDown={handleKeyDown}
          placeholder={t('todoAddPlaceholder', lang)}
          maxLength={200}
          className="input flex-1"
          autoFocus
        />
        <button className="btn btn-primary shrink-0" onClick={handleAdd} disabled={!newText.trim()}>
          {t('todoAddBtn', lang)}
        </button>
        <button className="btn shrink-0" onClick={() => { onClose(); }}>
          ×
        </button>
      </div>
      {todoError && (
        <p className="todo-error-msg">{todoError}</p>
      )}
      <div className="todo-add-meta-row">
        <label className="todo-add-label">
          {t('todoSortPriority', lang)}:
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as '' | 'high' | 'medium' | 'low')}
            className="input input-sm todo-add-input-sm"
          >
            <option value="">{t('todoPriorityNone', lang)}</option>
            <option value="high">{t('todoPriorityHigh', lang)}</option>
            <option value="medium">{t('todoPriorityMedium', lang)}</option>
            <option value="low">{t('todoPriorityLow', lang)}</option>
          </select>
        </label>
        <label className="todo-add-label">
          {t('todoDueDate', lang)}:
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="input input-sm todo-add-input-sm"
          />
        </label>
      </div>
    </div>
  );
});
