import { useRef, useState, memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';

// ---- Stale banner ----

interface StaleBannerProps {
  lang: Lang;
  staleCount: number;
  onActivate: () => void;
}

export const StaleBanner = memo(function StaleBanner({ lang, staleCount, onActivate }: StaleBannerProps) {
  return (
    <button className="stale-todo-banner" onClick={onActivate} type="button">
      <AlertTriangle size={14} />
      <span>{tf('staleTodoBanner', lang, staleCount)}</span>
    </button>
  );
});

// ---- Stale filter indicator ----

interface StaleFilterIndicatorProps {
  lang: Lang;
  staleCount: number;
  onClear: () => void;
}

export const StaleFilterIndicator = memo(function StaleFilterIndicator({ lang, staleCount, onClear }: StaleFilterIndicatorProps) {
  return (
    <div className="filter-indicator-warning">
      <AlertTriangle size={12} />
      <span>{t('todoFilterStale', lang)}: {staleCount}</span>
      <button className="btn btn-xs-dismiss" onClick={onClear}>×</button>
    </div>
  );
});

// ---- Add TODO form (inline) ----

interface TodoInlineAddFormProps {
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
  onRefresh: () => void;
  onClose: () => void;
  onAdd: (text: string, priority: string, dueDate: string) => void;
}

export const TodoInlineAddForm = memo(function TodoInlineAddForm({
  lang, onClose, onAdd,
}: TodoInlineAddFormProps) {
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
    onAdd(newText.trim(), newPriority, newDueDate);
    setNewText('');
    setNewPriority('');
    setNewDueDate('');
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
      <div className="form-row">
        <input
          ref={inputRef}
          className="input flex-1"
          type="text"
          value={newText}
          onChange={(e) => { setNewText(e.target.value); setTodoError(''); }}
          onBlur={() => { if (newText.trim() === '') setTodoError(t('todoInputRequired', lang)); }}
          onKeyDown={handleKeyDown}
          placeholder={t('todoAddPlaceholder', lang)}
          aria-label={t('ariaTodoInput', lang)}
          maxLength={200}
          autoFocus
        />
        <button className="btn btn-primary shrink-0" onClick={handleAdd} disabled={!newText.trim()}>
          {t('todoAddBtn', lang)}
        </button>
        <button className="btn shrink-0" onClick={onClose}>×</button>
      </div>
      {todoError && <p className="error-text-sm">{todoError}</p>}
      <div className="form-options-row">
        <label className="form-label-inline">
          {t('todoSortPriority', lang)}:
          <select
            className="input input-sm input-sm-compact"
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as '' | 'high' | 'medium' | 'low')}
          >
            <option value="">{t('todoPriorityNone', lang)}</option>
            <option value="high">{t('todoPriorityHigh', lang)}</option>
            <option value="medium">{t('todoPriorityMedium', lang)}</option>
            <option value="low">{t('todoPriorityLow', lang)}</option>
          </select>
        </label>
        <label className="form-label-inline">
          {t('todoDueDate', lang)}:
          <input
            className="input input-sm input-sm-compact"
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
});
