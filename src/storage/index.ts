// ─── Re-export everything from domain modules ───
// All existing `import { ... } from './storage'` will resolve to this barrel.

export { safeGetItem, safeSetItem, safeRemoveItem, invalidateLogsCache, invalidateProjectsCache, invalidateTodosCache, invalidateMasterNotesCache, incrementSnapshotCounter, getTotalSnapshots } from './core';

export { saveLogs, loadLogs, loadTrashedLogs, addLog, getLog, trashLog, restoreLog, deleteLog, updateLog, duplicateLog, linkLogs, unlinkLogs, loadLogSummaries, saveLogSummary, getLogSummary } from './logs';

export { loadProjects, loadTrashedProjects, saveProjects, addProject, trashProject, restoreProject, deleteProject, renameProject, updateProject, loadWeeklyReports, saveWeeklyReport, getWeeklyReport, deleteWeeklyReport, loadKnowledgeBases, getKnowledgeBase, saveKnowledgeBase, deleteKnowledgeBase, getAiContext, saveAiContext, deleteAiContext } from './projects';

export { loadTodos, loadArchivedTodos, loadTrashedTodos, saveTodos, addTodosFromLog, addTodosFromLogWithMeta, addManualTodo, trashTodo, trashCompletedTodos, restoreTodo, deleteTodo, updateTodo, archiveTodo, unarchiveTodo, bulkUpdateTodos, bulkTrashTodos, reorderTodos, snoozeTodo, deleteTodosForLog, MAX_COMPLETED } from './todos';

export { loadMasterNotes, getMasterNote, saveMasterNote, deleteMasterNote, getMasterNoteHistory, deleteMasterNoteHistory, restoreMasterNoteSnapshot } from './masterNotes';

export { getApiKey, setApiKey, getLang, setLang, getUiLang, setUiLang, getTheme, setTheme, isDemoMode, setDemoMode, getFeatureEnabled, setFeatureEnabled, getAutoReportSetting, setAutoReportSetting, getLastReportDate, setLastReportDate, recordActivity, getStreak, exportAllData, validateBackup, importData, getDataUsage, formatBytes, purgeExpiredTrash } from './settings';

export type { ThemePref, LoreBackup, ImportResult, DataUsage } from './settings';
