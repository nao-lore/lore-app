export type OutputMode = 'worklog' | 'handoff';

export interface Trashable {
  trashedAt?: number;    // timestamp when moved to trash
}

export interface Project extends Trashable {
  id: string;
  name: string;
  createdAt: number;
  pinned?: boolean;
  color?: string;   // preset color key
  icon?: string;    // emoji icon
}

export interface SourceReference {
  fileName?: string;          // original file name(s)
  sourceType?: string;        // txt, md, docx, json, paste
  importedAt?: string;        // ISO timestamp
  originalDate?: string;      // file lastModified as ISO date
  charCount?: number;         // original input character count
}

export interface LogEntry extends Trashable {
  id: string;
  createdAt: string;
  updatedAt?: string;
  importedAt?: string;
  title: string;
  projectId?: string;
  pinned?: boolean;
  suggestedProjectId?: string;
  classificationConfidence?: number;
  /** @deprecated No longer saved for new logs. Read-only for backward compatibility. */
  sourceText?: string;
  sourceReference?: SourceReference;
  outputMode?: OutputMode;
  // Worklog fields
  today: string[];
  decisions: string[];
  /**
   * Structured decisions with rationale. Preferred over `decisions` for new logs.
   * - New saves: write both decisionRationales and decisions (backward compat)
   * - Reads: use decisionRationales if present, fall back to decisions
   */
  decisionRationales?: DecisionWithRationale[];
  todo: string[];
  relatedProjects: string[];
  tags: string[];
  // Handoff fields (only when outputMode === 'handoff')
  currentStatus?: string[];   // current state + what's working/not
  nextActions?: string[];     // what to do next
  nextActionItems?: NextActionItem[];  // immediate only, max 4
  actionBacklog?: NextActionItem[];   // deferred items, max 7
  completed?: string[];       // what's done
  blockers?: string[];        // open issues / warnings
  constraints?: string[];     // assumptions / constraints
  resumeContext?: string[];   // derived from resumeChecklist
  resumeChecklist?: ResumeChecklistItem[];  // structured resume, max 3
  handoffMeta?: HandoffMeta;  // session-level context
  checkedActions?: number[];  // checked nextActions indices
  // Explicitly linked logs (bidirectional backlinks)
  relatedLogIds?: string[];
  // User-added memo (separate from AI-generated content)
  memo?: string;
  // Workload level (AI-analyzed)
  workloadLevel?: 'high' | 'medium' | 'low';
  // Legacy fields (kept for backward compat with old logs)
  /** @deprecated Use currentStatus instead. Read-only for backward compatibility. */
  inProgress?: string[];
  /** @deprecated Use resumeContext instead. Read-only for backward compatibility. */
  resumePoint?: string;
}

export interface SourcedItem {
  text: string;
  sourceLogIds: string[];
}

export interface MasterNote {
  id: string;
  projectId: string;
  overview: string;
  currentStatus: string;
  decisions: SourcedItem[];
  openIssues: SourcedItem[];
  nextActions: SourcedItem[];
  relatedLogIds: string[];
  updatedAt: number;
}

export interface MasterNoteSnapshot {
  version: number;
  note: MasterNote;
  savedAt: number;
}

export interface MasterNoteHistory {
  projectId: string;
  snapshots: MasterNoteSnapshot[];
}

export interface LogSummary {
  logId: string;
  summary: string;
  decisions: string[];
  issues: string[];
  actions: string[];
  cachedAt: number;
}

export interface Todo extends Trashable {
  id: string;
  text: string;
  done: boolean;
  logId: string;       // empty string for manual todos
  createdAt: number;
  dueDate?: string;    // ISO date string (YYYY-MM-DD)
  priority?: 'high' | 'medium' | 'low';
  tag?: string;
  pinned?: boolean;
  archivedAt?: number; // timestamp when archived
  sortOrder?: number;  // manual sort order (lower = higher)
  snoozedUntil?: number; // timestamp until which the todo is snoozed
}

export interface WeeklyReport {
  id: string;
  weekStart: string;         // ISO date (Monday)
  weekEnd: string;           // ISO date (Sunday)
  projectId?: string;        // optional project filter
  summary: string;
  achievements: string[];
  decisions: string[];
  openItems: string[];
  completedTodos: string[];
  pendingTodos: string[];
  nextWeek: string[];
  stats: {
    logCount: number;
    worklogCount: number;
    handoffCount: number;
    todoCompletionRate: number;   // 0–100
    averageWorkload?: string;     // 'high' | 'medium' | 'low' | undefined
  };
  generatedAt: number;        // timestamp
}

export interface KnowledgeEntry {
  problem: string;
  solution: string;
  sourceLogIds: string[];
  frequency: number;          // how many logs mentioned this pattern
}

export interface KnowledgeBase {
  id: string;
  projectId: string;
  patterns: KnowledgeEntry[];     // recurring problems & solutions
  bestPractices: string[];        // distilled best practices
  commonDecisions: SourcedItem[]; // recurring decisions
  generatedAt: number;
  logCount: number;               // how many logs were analyzed
}

export interface TransformResult {
  title: string;
  today: string[];
  decisions: string[];
  todo: string[];
  relatedProjects: string[];
  tags: string[];
}

export interface DecisionWithRationale {
  decision: string;
  rationale: string | null;
}

export interface NextActionItem {
  action: string;
  whyImportant?: string | null;
  priorityReason?: string | null;
  dueBy?: string | null;
  dependsOn?: string[] | null;
}

export interface ResumeChecklistItem {
  action: string;
  whyNow: string | null;
  ifSkipped: string | null;
}

export interface HandoffMeta {
  sessionFocus: string | null;      // 1文: 今回何を前に進めるべきか
  whyThisSession: string | null;    // 1文: なぜ今この作業が重要か
  timePressure: string | null;      // 1文: フェーズ的な時間圧 (dueByとは別)
}

export interface HandoffResult {
  title: string;
  currentStatus: string[];    // 今どこ？
  nextActions: string[];      // 次何やる？ (immediate only, max 4) — derived from nextActionItems
  nextActionItems?: NextActionItem[];  // immediate only, max 4
  actionBacklog?: NextActionItem[];    // そのうちやるもの, max 7
  completed: string[];        // 終わったこと
  blockers: string[];         // 注意点・未解決
  decisions: string[];        // 決定事項 (legacy string[] for backward compat)
  decisionRationales?: DecisionWithRationale[];  // active decisions + 理由, max 6
  totalDecisionsBeforeCap?: number;  // total decisions before capping at 6 (for UI notification)
  constraints: string[];      // 前提・制約
  resumeContext: string[];    // 再開入力 — derived from resumeChecklist
  resumeChecklist?: ResumeChecklistItem[];  // structured resume, max 3
  handoffMeta?: HandoffMeta;  // session-level context
  tags: string[];
}

export interface BothResult {
  worklog: TransformResult;
  handoff: HandoffResult;
  classification?: { projectId: string | null; confidence: number };
}

export interface ProjectContext {
  projectId: string;
  projectName: string;
  overview: string;
  currentState: string[];
  keyDecisions: DecisionWithRationale[];
  constraints: string[];
  openIssues: string[];
  nextActions: string[];
  sourceLogIds: string[];
  generatedAt: number;
  lastReviewedAt?: number;
}

export type FontSize = 'small' | 'medium' | 'large';
