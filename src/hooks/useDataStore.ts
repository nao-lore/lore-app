import { useState, useCallback, useMemo } from 'react';
import { loadLogs, loadProjects, loadTodos, loadMasterNotes } from '../storage';

/** Central data store hook — loads logs, projects, todos, masterNotes with cache-friendly refresh */
export function useDataStore() {
  const [logsVersion, setLogsVersion] = useState(0);

  const logs = useMemo(() => { void logsVersion; return loadLogs(); }, [logsVersion]);
  const projects = useMemo(() => { void logsVersion; return loadProjects(); }, [logsVersion]);
  const todos = useMemo(() => { void logsVersion; return loadTodos(); }, [logsVersion]);
  const masterNotes = useMemo(() => { void logsVersion; return loadMasterNotes(); }, [logsVersion]);

  const pendingTodosCount = useMemo(() => todos.filter((td) => !td.done && !td.archivedAt).length, [todos]);
  const lastLogCreatedAt = useMemo(() => logs.length > 0 ? logs[logs.length - 1].createdAt : null, [logs]);
  const pendingCount = useMemo(() => todos.filter((td) => !td.done).length, [todos]);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const overdueTodos = useMemo(() => {
    return todos.filter((td) => !td.done && !td.archivedAt && td.dueDate && td.dueDate < todayKey);
  }, [todos, todayKey]);

  const refreshLogs = useCallback(() => setLogsVersion((v) => v + 1), []);

  return {
    logsVersion, setLogsVersion,
    logs, projects, todos, masterNotes,
    pendingTodosCount, lastLogCreatedAt,
    pendingCount,
    todayKey, overdueTodos,
    refreshLogs,
  };
}
