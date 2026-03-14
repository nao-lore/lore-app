export type Lang = 'ja' | 'en';
export type OutputLang = Lang | 'es' | 'fr' | 'de' | 'zh' | 'ko' | 'pt';
export const OUTPUT_LANGS: { code: OutputLang; label: string; flag: string }[] = [
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
];

const labels = {
  // App
  appName: { ja: 'Lore', en: 'Lore' },

  // Sidebar
  newLog: { ja: '+ Create Log', en: '+ Create Log' },
  searchLogs: { ja: 'ログを検索...', en: 'Search logs...' },
  goToLogs: { ja: 'ログを見る', en: 'View Logs' },
  navLogs: { ja: 'ログ', en: 'Logs' },
  navProjects: { ja: 'プロジェクト', en: 'Projects' },
  navTodo: { ja: 'TODO', en: 'TODO' },
  navTimeline: { ja: 'Timeline', en: 'Timeline' },
  recentLogs: { ja: '最近のログ', en: 'Recent Logs' },
  settings: { ja: '設定', en: 'Settings' },
  noMatches: { ja: '該当なし', en: 'No matches' },
  noLogsYet: { ja: 'ログがありません', en: 'No logs yet' },
  noLogsYetDesc: { ja: 'AIとの会話を貼り付けて、最初のワークログを作成しましょう。', en: 'Paste an AI conversation to create your first worklog.' },
  hideSidebar: { ja: 'サイドバーを隠す', en: 'Hide sidebar' },
  showSidebar: { ja: 'サイドバーを表示', en: 'Show sidebar' },
  navHome: { ja: 'ホーム', en: 'Home' },
  navHomeTitle: { ja: 'ホーム — ログを作成', en: 'Home — Create a Log' },
  navDashboard: { ja: 'ダッシュボード', en: 'Dashboard' },
  navDashboardTitle: { ja: 'プロジェクト概況・タスク', en: 'Project Overview & Tasks' },
  navTodoTitle: { ja: '会話から抽出されたTODOの管理', en: 'Manage TODOs extracted from conversations' },
  navTimelineTitle: { ja: 'ログ・TODO・サマリーを時系列で俯瞰', en: "Bird's-eye view of logs, TODOs, and summaries over time" },
  navWeeklyReportTitle: { ja: 'その週の活動をAIが自動でまとめる', en: 'AI-generated weekly activity summary' },
  navWorkflow: { ja: 'ワークフロー', en: 'Workflow' },
  navLogsTitle: { ja: '全てのログを時系列で表示', en: 'View all logs in chronological order' },
  navProjectsTitle: { ja: 'ログをプロジェクトに整理', en: 'Organize logs into projects' },
  navProjectSummaryTitle: { ja: 'AIがログからプロジェクトの全体像を自動生成', en: 'AI generates project overviews from your logs' },
  ctxChangeProjectPrompt: { ja: '番号を入力:', en: 'Enter number:' },

  // Command palette
  searchPlaceholder: { ja: 'ログ・プロジェクト・TODOを検索...', en: 'Search logs, projects, todos...' },
  searchNoResults: { ja: '結果なし', en: 'No results' },
  searchHint: { ja: '⌘K で検索', en: '⌘K to search' },

  // Input view
  newLogTitle: { ja: 'Create Log', en: 'Create Log' },
  inputDesc: { ja: 'テキスト貼り付け、ファイルインポート、またはドラッグ&ドロップで作業ログを抽出します。', en: 'Paste text, import files, or drag & drop to extract your work log.' },
  inputPlaceholder: { ja: 'AIとの会話を貼り付け、またはファイルをドロップ', en: 'Paste an AI conversation, or drop a file' },
  importFiles: { ja: 'Import File', en: 'Import File' },
  addMoreFiles: { ja: '+ ファイルを追加', en: '+ Add More Files' },
  clearAllFiles: { ja: 'すべてクリア', en: 'Clear All Files' },
  chars: { ja: '文字', en: 'chars' },
  longTextMode: { ja: '長文モード', en: 'Long text mode' },
  longTextModeDesc: (n: number) => ({
    ja: `入力を約${n}件に分けて順番に処理し、最後にまとめます。途中結果は自動保存されます。`,
    en: `Input will be split into ~${n} parts, processed in order, then combined. Progress is auto-saved.`,
  }),
  resumableSession: (done: number, total: number) => ({
    ja: `途中結果が保存されています (${done}/${total} 件完了)。変換ボタンで再開できます。`,
    en: `Saved progress found (${done}/${total} done). Click Transform to resume.`,
  }),
  longInputWarn: (n: string) => ({
    ja: `長い入力 (${n}文字)。非常に長いテキストでは抽出品質が低下する可能性があります。`,
    en: `Long input (${n} chars). Extraction quality decreases with very long inputs.`,
  }),
  inputOverLimit: (n: string, limit: string) => ({
    ja: `入力が大きすぎます (${n}文字)。現在のサポート上限は${limit}文字です。入力を分割して、複数回に分けて処理してください。`,
    en: `Input is too large (${n} chars). The current supported limit is ${limit} chars. Please split your input into smaller batches and process them separately.`,
  }),

  largeInputNotice: { ja: '大きな入力を検出しました。長文モードで処理します。', en: 'Large input detected. Processing in long-text mode.' },
  overLimitBlock: { ja: '入力がサポート上限（500,000文字）を超えています。ログを分割してください。', en: 'Input exceeds the maximum supported size (500,000 characters). Please split the log into smaller parts.' },

  // Transform buttons
  transformWorklog: { ja: 'ワークログに変換', en: 'Transform to Worklog' },
  transformHandoff: { ja: '引き継ぎメモに変換', en: 'Transform to Handoff' },
  transformLongWorklog: { ja: 'ワークログに変換 (長文)', en: 'Transform to Worklog (long text)' },
  transformLongHandoff: { ja: '引き継ぎメモに変換 (長文)', en: 'Transform to Handoff (long text)' },
  transformMulti: (n: number) => ({
    ja: `ワークログに変換 (${n}ファイル)`,
    en: `Transform to Worklog (${n} files)`,
  }),
  resumeTransform: (done: number, total: number) => ({
    ja: `変換を再開 (${done}/${total} 完了)`,
    en: `Resume Transform (${done}/${total} done)`,
  }),
  transforming: { ja: '変換中...', en: 'Transforming...' },

  // Output mode
  outputModeWorklog: { ja: 'ログ', en: 'Log' },
  outputModeHandoff: { ja: '引き継ぎ', en: 'Handoff' },
  createBoth: { ja: 'ログ + ハンドオフを作成', en: 'Create Log + Handoff' },
  createHandoffOnly: { ja: 'ハンドオフのみ作成', en: 'Create Handoff Only' },
  createWorklogOnly: { ja: 'ログのみ作成', en: 'Create Log Only' },
  createBtnBoth: { ja: '両方を作成', en: 'Create Both' },
  createBtnHandoff: { ja: 'Handoffを作成', en: 'Create Handoff' },
  createBtnWorklog: { ja: 'Worklogを作成', en: 'Create Worklog' },
  modeIndicator: { ja: '生成モード', en: 'Mode' },
  modeLabelBoth: { ja: 'Worklog＋Handoff', en: 'Worklog + Handoff' },
  modeLabelWorklog: { ja: 'Worklog', en: 'Worklog' },
  modeLabelHandoff: { ja: 'Handoff', en: 'Handoff' },
  worklogDesc: { ja: '作業履歴を保存し、TODOを自動抽出します', en: 'Saves work history and auto-extracts TODOs' },
  handoffDesc: { ja: '次のAIがすぐ作業を再開できる要約', en: 'A summary so the next AI can resume immediately' },
  modeLabelTodoOnly: { ja: 'TODO抽出', en: 'TODO Only' },
  modeLabelHandoffTodo: { ja: 'Handoff＋TODO抽出', en: 'Handoff + TODO' },
  modeLabelWorklogHandoff: { ja: 'Worklog＋Handoff', en: 'Worklog + Handoff' },
  createBtnTodoOnly: { ja: 'TODOを抽出', en: 'Extract TODOs' },
  createBtnHandoffTodo: { ja: 'Handoff＋TODOを作成', en: 'Create Handoff + TODO' },
  createBtnWorklogHandoff: { ja: '両方を作成', en: 'Create Both' },
  advancedModes: { ja: '▼ 詳細設定', en: '▼ Advanced' },
  advancedModesClose: { ja: '▲ 詳細設定', en: '▲ Advanced' },

  // Both-mode phase labels
  bothPhaseHandoff: { ja: 'Step 1/2 — ハンドオフを生成中', en: 'Step 1/2 — Generating Handoff' },
  bothPhaseWorklog: { ja: 'Step 2/2 — ログを生成中', en: 'Step 2/2 — Generating Log' },

  // Progress
  preparing: { ja: '準備中...', en: 'Preparing...' },
  processing: (cur: number, total: number) => ({
    ja: `${cur} / ${total} 件目を処理中`,
    en: `Processing part ${cur} of ${total}`,
  }),
  combiningResults: { ja: '結果をまとめています...', en: 'Merging results...' },
  waitingForApi: (sec: number) => ({
    ja: `APIの制限待ち（残り${sec}秒）`,
    en: `Waiting for API rate limit reset (${sec}s)`,
  }),
  waitingRetry: (sec: number, attempt: number, max: number) => ({
    ja: `リクエストを再試行します ${attempt}/${max}（${sec}秒後）`,
    en: `Retrying request ${attempt} of ${max} (${sec}s)`,
  }),
  phaseCooldown: (sec: number) => ({
    ja: `次のステップの準備中（${sec}秒）`,
    en: `Preparing next step (${sec}s)`,
  }),
  paused: { ja: '一時停止中', en: 'Paused' },
  autoPaused: { ja: '処理を一時停止しました', en: 'Processing paused' },
  autoPausedDesc: { ja: '途中まで処理済みです。時間をおいて再開してください。', en: 'Progress has been saved. Please wait a moment and resume.' },
  sendingToApi: { ja: 'AIに送信中...', en: 'Sending to AI...' },
  restoringProgress: { ja: '保存された途中結果を復元中...', en: 'Restoring saved progress...' },
  itemsSaved: (n: number) => ({
    ja: `${n}件 完了`,
    en: `${n} completed`,
  }),
  remaining: (n: number) => ({
    ja: `残り${n}件`,
    en: `${n} remaining`,
  }),
  lastItem: { ja: '最後のパートを処理中...', en: 'Processing last part...' },
  estimatedTime: (min: number) => ({
    ja: `推定あと約${min}分`,
    en: `~${min} min remaining`,
  }),
  combiningGroups: (cur: number, total: number) => ({
    ja: `結果をまとめています（${cur}/${total}）`,
    en: `Merging results (${cur} of ${total})`,
  }),
  retryAttempt: (cur: number, max: number) => ({
    ja: `再試行 ${cur}/${max}`,
    en: `Retry ${cur} of ${max}`,
  }),
  clickResumeHint: { ja: '「再開」で続きを処理できます', en: 'Press "Resume" to continue' },
  btnResume: { ja: '▶ 再開', en: '▶ Resume' },
  btnPause: { ja: '⏸ 一時停止', en: '⏸ Pause' },
  btnCancel: { ja: 'キャンセル', en: 'Cancel' },

  // Progress steps
  stepAnalyzing: { ja: 'ログを分析中...', en: 'Analyzing log...' },
  stepExtracting: { ja: '重要項目を抽出中...', en: 'Extracting key items...' },
  stepOrganizing: { ja: '内容を整理中...', en: 'Organizing content...' },
  stepFinalizing: { ja: '仕上げ中...', en: 'Finalizing...' },
  stepCollecting: { ja: 'ログを収集中...', en: 'Collecting logs...' },
  stepAnalyzingLogs: { ja: 'ログを分析中...', en: 'Analyzing logs...' },
  stepMergingSummary: { ja: 'Summary を統合中...', en: 'Merging summaries...' },

  // Result
  savedToLogs: { ja: 'ログに保存しました。', en: 'Saved to logs' },
  openSavedLog: { ja: '保存したログを開く', en: 'Open Saved Log' },
  copyMarkdown: { ja: 'Markdownをコピー', en: 'Copy Markdown' },
  copied: { ja: 'コピーしました!', en: 'Copied!' },

  // Detail view
  back: { ja: '戻る', en: 'Back' },
  backToLogs: { ja: 'ログに戻る', en: 'Back to Logs' },
  delete: { ja: '削除', en: 'Delete' },
  deleteConfirm: { ja: 'このログを削除しますか？', en: 'Delete this log?' },
  deleteConfirmDesc: { ja: 'ゴミ箱に移動されます。', en: 'It will be moved to trash.' },
  deleteProjectConfirm: { ja: 'このプロジェクトを削除しますか？', en: 'Delete this project?' },
  deleteProjectConfirmDesc: { ja: 'プロジェクトはゴミ箱に移動されます。紐付けられたログは残ります。', en: 'The project will be moved to trash. Associated logs will remain.' },
  confirmDeleteBtn: { ja: '削除する', en: 'Delete' },
  cancel: { ja: 'キャンセル', en: 'Cancel' },
  logNotFound: { ja: 'ログが見つかりません。', en: 'Log not found.' },
  sourceText: { ja: 'ソーステキスト', en: 'Source Text' },
  editProject: { ja: 'プロジェクトを変更', en: 'Edit project' },
  export: { ja: 'エクスポート', en: 'Export' },

  // Section titles — Worklog
  sectionToday: { ja: '今日の作業', en: 'Today' },
  sectionDecisions: { ja: '決定事項', en: 'Decisions' },
  sectionTodo: { ja: 'TODO', en: 'TODO' },
  sectionRelatedProjects: { ja: '関連プロジェクト', en: 'Related Projects' },

  // Section titles — Handoff
  sectionCurrentStatus: { ja: '今どこ？', en: 'Current Status' },
  sectionNextActions: { ja: '次何やる？', en: 'Next Actions' },
  sectionCompleted: { ja: '終わったこと', en: 'Completed' },
  sectionBlockers: { ja: '注意・リスク', en: 'Cautions & Risks' },
  sectionConstraints: { ja: '前提・制約', en: 'Constraints & Scope' },
  sectionResumeContext: { ja: '再開入力', en: 'Resume Checklist' },
  // Legacy (for old logs that still have inProgress/resumePoint)
  sectionInProgress: { ja: '進行中', en: 'In Progress' },

  // Log list view
  logs: { ja: 'ログ', en: 'Logs' },
  logCount: (n: number) => ({
    ja: `${n}件`,
    en: `${n} log${n !== 1 ? 's' : ''}`,
  }),
  noMatchingLogs: { ja: '該当するログがありません。', en: 'No matching logs' },
  filterAll: { ja: 'すべて', en: 'All' },
  filterPinned: { ja: 'ピン留め', en: 'Pinned' },
  filterWorklog: { ja: 'ログ', en: 'Log' },
  filterHandoff: { ja: 'ハンドオフ', en: 'Handoff' },

  // Settings
  settingsTitle: { ja: '設定', en: 'Settings' },
  providerLabel: { ja: 'AI プロバイダ', en: 'AI Provider' },
  providerDesc: { ja: '使用するAIサービスを選択してください。', en: 'Choose which AI service to use.' },
  apiKeyLabel: { ja: 'API キー', en: 'API Key' },
  apiKeyDesc: { ja: 'キーはこのブラウザのlocalStorageにのみ保存されます。', en: 'Your key is stored only in this browser.' },
  apiKeyPlaceholder: { ja: 'sk-ant-...', en: 'sk-ant-...' },
  saveKey: { ja: 'キーを保存', en: 'Save Key' },
  saved: { ja: '保存しました!', en: 'Saved!' },
  providerKeyConfigured: { ja: '設定済み', en: 'Configured' },
  providerKeyNotSet: { ja: '未設定', en: 'Not set' },
  providerRecommended: { ja: '推奨・安定', en: 'Recommended & Stable' },
  providerDescGemini: { ja: '現在唯一の安定動作プロバイダ', en: 'Most stable and reliable option' },
  providerDescAnthropic: { ja: '高品質だがレート制限あり', en: 'High quality but rate-limited' },
  providerDescOpenai: { ja: '安定・中速', en: 'Stable & moderate speed' },
  providerClaudeWarning: { ja: '429エラー（レート制限超過）が頻発する場合があります', en: 'May frequently encounter 429 errors (rate limit exceeded)' },
  providerOtherProviders: { ja: 'その他のプロバイダ', en: 'Other Providers' },
  providerGetKeyAt: { ja: 'APIキーの取得先', en: 'Get your API key at' },
  uiLanguageLabel: { ja: 'UI Language', en: 'UI Language' },
  uiLanguageDesc: { ja: 'ナビゲーション・ボタン・ラベルなどの表示言語を変更します。', en: 'Change the display language for navigation, buttons, and labels.' },
  outputLanguageLabel: { ja: 'Output Language', en: 'Output Language' },
  outputLanguageDesc: { ja: 'AIが生成するログ・Worklog・Handoffの文章言語を設定します。UIには影響しません。', en: 'Set the language for AI-generated logs, worklogs, and handoffs. Does not affect UI.' },
  languageLabel: { ja: '出力言語', en: 'Output Language' },
  languageDesc: { ja: 'ログ抽出の出力言語を設定します。', en: 'Set the output language for log extraction.' },
  langJa: { ja: '日本語', en: 'Japanese' },
  langEn: { ja: '英語', en: 'English' },
  langAuto: { ja: '自動検出', en: 'Auto-detect' },

  // Theme
  themeLabel: { ja: 'テーマ', en: 'Theme' },
  themeDesc: { ja: 'アプリの表示テーマを設定します。', en: 'Set the app appearance.' },
  themeLight: { ja: 'ライト', en: 'Light' },
  themeDark: { ja: 'ダーク', en: 'Dark' },
  themeSystem: { ja: 'システム', en: 'System' },

  // Projects
  projects: { ja: 'プロジェクト', en: 'Projects' },
  newProject: { ja: 'プロジェクト追加', en: 'Add Project' },
  projectNamePlaceholder: { ja: 'プロジェクト名', en: 'Project name' },
  allLogs: { ja: 'すべてのログ', en: 'All Logs' },
  projectLabel: { ja: 'プロジェクト', en: 'Project' },
  noProject: { ja: 'プロジェクトなし', en: 'No project' },
  renameProject: { ja: '名前を変更', en: 'Rename' },
  pinnedProjects: { ja: 'ピン留めプロジェクト', en: 'Pinned Projects' },
  pinnedLogs: { ja: 'ピン留めログ', en: 'Pinned Logs' },
  pinned: { ja: 'ピン留め', en: 'Pinned' },
  pinProject: { ja: 'ピン留め', en: 'Pin' },
  unpinProject: { ja: 'ピン解除', en: 'Unpin' },
  noProjects: { ja: 'プロジェクトがありません', en: 'No projects yet' },
  noProjectsDesc: { ja: 'プロジェクトを作成してログを整理しましょう。', en: 'Create a project to organize your logs.' },
  addToProject: { ja: 'プロジェクトに追加', en: 'Add to Project' },
  removeFromProject: { ja: 'プロジェクトから外す', en: 'Remove from Project' },
  projectEditAppearance: { ja: '色・アイコンを変更', en: 'Change Color & Icon' },
  projectColorLabel: { ja: 'カラー', en: 'Color' },
  projectIconLabel: { ja: 'アイコン', en: 'Icon' },
  projectNoColor: { ja: 'なし', en: 'None' },
  projectRemoveIcon: { ja: 'アイコンを削除', en: 'Remove icon' },
  projectCount: (n: number) => ({
    ja: `${n}件`,
    en: `${n} project${n !== 1 ? 's' : ''}`,
  }),

  // Project Summary (formerly Master Note)
  masterNote: { ja: 'Project Summary', en: 'Project Summary' },
  navProjectSummary: { ja: 'Project Summary', en: 'Project Summary' },
  projectSummaryListTitle: { ja: 'Project Summary', en: 'Project Summary' },
  projectSummaryListDesc: { ja: 'プロジェクトごとの要約を確認・生成できます。', en: 'View and generate summaries for each project.' },
  projectSummaryExists: { ja: '作成済み', en: 'Created' },
  projectSummaryNotYet: { ja: '未作成', en: 'Not created' },
  projectSummaryCreate: { ja: 'Summary を作成', en: 'Create Summary' },
  projectSummaryNew: { ja: '+ Create Summary', en: '+ Create Summary' },
  projectSummarySelectProject: { ja: 'プロジェクトを選択', en: 'Select a project' },
  projectSummaryNoSummaries: { ja: '作成済みの Summary はまだありません。', en: 'No summaries created yet' },
  projectSummaryNoSummariesDesc: { ja: '「+ Create Summary」からプロジェクトを選んで生成しましょう。', en: 'Choose a project and generate one with "+ Create Summary".' },
  projectSummaryOpen: { ja: 'Summary を開く', en: 'Open Summary' },
  projectSummaryUpdate: { ja: 'Summary を更新', en: 'Update Summary' },
  mnOverview: { ja: '概要', en: 'Overview' },
  mnCurrentStatus: { ja: '現在の状態', en: 'Current Status' },
  mnDecisions: { ja: '決定事項', en: 'Decisions' },
  mnOpenIssues: { ja: '未解決の課題', en: 'Open Issues' },
  mnNextActions: { ja: '次のアクション', en: 'Next Actions' },
  mnRelatedLogs: { ja: '関連ログ', en: 'Related Logs' },
  mnGenerate: { ja: 'Project Summary を生成', en: 'Generate Project Summary' },
  mnRegenerate: { ja: 'Project Summary を再生成', en: 'Regenerate Project Summary' },
  mnGenerating: { ja: '生成中...', en: 'Generating...' },
  mnExtracting: (cur: number, total: number) => ({
    ja: `ログを分析中 (${cur}/${total})`,
    en: `Analyzing logs (${cur}/${total})`,
  }),
  mnMerging: { ja: '統合中...', en: 'Merging...' },
  mnSourceCount: (n: number) => ({
    ja: `${n}件のログ`,
    en: `${n} log${n !== 1 ? 's' : ''}`,
  }),
  mnPreviewTitle: { ja: 'AI生成サマリー', en: 'AI-Generated Summary' },
  mnAccept: { ja: '保存', en: 'Save' },
  mnDiscard: { ja: '破棄', en: 'Discard' },
  mnRefine: { ja: 'AIに修正依頼', en: 'Refine with AI' },
  mnRefineInstruction: { ja: '修正内容を入力...', en: 'Describe what to change...' },
  mnRefineSend: { ja: '送信', en: 'Send' },
  mnRefineCancel: { ja: 'キャンセル', en: 'Cancel' },
  mnRefining: { ja: 'AIが修正中...', en: 'AI is refining...' },
  mnEdited: { ja: '編集済み', en: 'Edited' },
  mnEdit: { ja: '編集', en: 'Edit' },
  mnEditMode: { ja: '編集中', en: 'Editing' },
  mnEditCancel: { ja: 'キャンセル', en: 'Cancel' },
  mnAddItem: { ja: '+ 項目を追加', en: '+ Add item' },
  mnRemoveItem: { ja: '削除', en: 'Remove' },
  mnExport: { ja: 'エクスポート', en: 'Export' },
  mnCopy: { ja: 'コピー', en: 'Copy' },
  mnCopied: { ja: 'コピーしました', en: 'Copied!' },
  mnDownloadMd: { ja: '.md をダウンロード', en: 'Download .md' },
  mnDownloadJson: { ja: '.json をダウンロード', en: 'Download .json' },
  mnEmpty: { ja: 'このプロジェクトの Project Summary はまだありません。', en: 'No Project Summary for this project yet' },
  mnNoLogs: { ja: 'ログがないため生成できません。', en: 'Cannot generate — no logs in this project.' },
  mnUpdatedAt: (date: string) => ({
    ja: `最終更新: ${date}`,
    en: `Last updated: ${date}`,
  }),
  mnLogCount: (n: number) => ({
    ja: `${n}件のログから生成`,
    en: `Generated from ${n} log${n !== 1 ? 's' : ''}`,
  }),

  // AI Context
  aiContextTitle: { ja: 'AI Context', en: 'AI Context' },
  aiContextEmpty: { ja: 'AI Context が未生成です。Project Summary を保存すると自動生成されます。', en: 'AI Context not generated yet. It will be auto-generated when you save a Project Summary.' },
  aiContextSave: { ja: '保存', en: 'Save' },
  aiContextSaved: { ja: 'AI Context を保存しました', en: 'AI Context saved' },
  aiContextRegenerate: { ja: '再生成', en: 'Regenerate' },
  aiContextRegenerating: { ja: 'AI Context を生成中...', en: 'Generating AI Context...' },
  aiContextGenerated: { ja: 'AI Context を生成しました', en: 'AI Context generated' },
  aiContextNeeded: { ja: 'Project Summary から AI Context を生成してください', en: 'Please generate AI Context from Project Summary' },
  addToProjectFirst: { ja: '先にプロジェクトに追加してください', en: 'Add to a project first' },
  updateSummaryPrompt: { ja: 'Project Summary を更新しますか？', en: 'Update Project Summary?' },
  updateSummaryStale: { ja: '⚠️ Project Summaryが7日以上未更新です。更新しますか？', en: 'Project Summary hasn\'t been updated in 7+ days. Update?' },
  updateSummaryAction: { ja: '更新する', en: 'Update' },
  unreflectedHandoffs: (n: number) => ({
    ja: `${n}件の未反映ハンドオフがあります`,
    en: `${n} unsynced handoff${n !== 1 ? 's' : ''}`,
  }),
  updateNow: { ja: '今すぐ更新する', en: 'Update now' },
  summaryUpdateBadgeTooltip: { ja: 'Project Summaryの更新をおすすめします', en: 'Project Summary update recommended' },

  // Classification
  suggestedProject: { ja: 'プロジェクトに追加しますか？', en: 'Add to project?' },
  classifyAccept: { ja: '追加する', en: 'Add' },
  classifyPickOther: { ja: '別のプロジェクトを選ぶ', en: 'Choose other' },
  classifyDismiss: { ja: 'スキップ', en: 'Skip' },
  classifying: { ja: 'プロジェクトを推定中...', en: 'Classifying project...' },
  autoAssigned: { ja: 'プロジェクトに自動割り当てしました', en: 'Auto-assigned to project' },

  // Todos
  todos: { ja: 'TODO', en: 'TODO' },
  noTodos: { ja: 'TODOがありません', en: 'No todos yet' },
  noTodosDesc: { ja: '手動で追加するか、Worklogを変換すると自動で抽出されます。', en: 'Add manually or transform a worklog to auto-extract TODOs' },
  todoCompleted: { ja: '完了済み', en: 'Completed' },
  todoDeleteCompleted: { ja: '完了済みを削除', en: 'Delete completed' },
  todoDeleteCompletedConfirm: { ja: '完了済みのTODOをすべて削除しますか？', en: 'Delete all completed TODOs?' },
  todoPending: { ja: '未完了', en: 'Pending' },
  todoFromLog: { ja: '元のログ', en: 'From log' },
  todoAdd: { ja: '+ TODO追加', en: '+ Add TODO' },
  todoAddPlaceholder: { ja: 'TODOを入力...', en: 'Enter a TODO...' },
  todoManual: { ja: '手動', en: 'Manual' },
  todoSortLabel: { ja: '並べ替え', en: 'Sort' },
  todoSortCreated: { ja: '作成日', en: 'Created' },
  todoSortTitle: { ja: 'タイトル', en: 'Title' },
  todoSortPriority: { ja: '優先度', en: 'Priority' },
  todoSortDue: { ja: '期限', en: 'Due Date' },
  todoGroupLabel: { ja: 'グループ', en: 'Group' },
  todoGroupNone: { ja: 'なし', en: 'None' },
  todoGroupDate: { ja: '日付', en: 'Date' },
  todoGroupPriority: { ja: '優先度', en: 'Priority' },
  todoGroupSource: { ja: 'ソース', en: 'Source' },
  todoPriorityHigh: { ja: '高', en: 'High' },
  todoPriorityMedium: { ja: '中', en: 'Medium' },
  todoPriorityLow: { ja: '低', en: 'Low' },
  todoPriorityNone: { ja: '未設定', en: 'None' },
  todoDeleteConfirm: { ja: 'このTODOを削除しますか？', en: 'Delete this TODO?' },
  todoDueDate: { ja: '期限', en: 'Due' },
  todoDueSet: { ja: '設定', en: 'Set' },
  todoDueRemove: { ja: '期限を削除', en: 'Remove due date' },
  todoAddBtn: { ja: '追加', en: 'Add' },
  todoInputRequired: { ja: 'TODOの内容を入力してください', en: 'Please enter TODO content' },
  todoToday: { ja: '今日', en: 'Today' },
  todoOverdue: { ja: '期限切れ', en: 'Overdue' },
  todoEdit: { ja: '編集', en: 'Edit' },
  todoEditPrompt: { ja: '内容を編集', en: 'Edit text' },
  todoPin: { ja: 'ピン留め', en: 'Pin' },
  todoUnpin: { ja: 'ピン解除', en: 'Unpin' },
  todoChangePriority: { ja: '優先度を変更', en: 'Change Priority' },
  todoChangeDue: { ja: '期限を変更', en: 'Change Due Date' },
  todoOpenSourceLog: { ja: '元ログを開く', en: 'Open Source Log' },
  todoMarkDone: { ja: '完了にする', en: 'Mark Done' },
  todoMarkUndone: { ja: '未完了に戻す', en: 'Mark Incomplete' },

  // Log picker
  addLogsToProject: { ja: '+ ログを追加', en: '+ Add Logs' },
  addLogsTitle: { ja: 'プロジェクトにログを追加', en: 'Add Logs to Project' },
  addLogsSearchPlaceholder: { ja: 'ログを検索...', en: 'Search logs...' },
  addLogsNoResults: { ja: '該当するログがありません', en: 'No matching logs' },
  addLogsNoUnassigned: { ja: '追加可能なログがありません', en: 'No available logs to add' },
  addLogsConfirm: (n: number) => ({
    ja: `${n}件を追加`,
    en: `Add ${n} log${n !== 1 ? 's' : ''}`,
  }),
  addLogsCancel: { ja: 'キャンセル', en: 'Cancel' },
  addLogsMoveConfirm: (n: number) => ({
    ja: `${n}件は別のプロジェクトに所属しています。移動しますか？`,
    en: `${n} log${n !== 1 ? 's are' : ' is'} in another project. Move ${n !== 1 ? 'them' : 'it'}?`,
  }),
  addLogsEmptyHint: { ja: '既存のログをこのプロジェクトに追加しましょう', en: 'Add existing logs to this project' },

  // Context menu
  ctxStar: { ja: 'スター', en: 'Star' },
  ctxUnstar: { ja: 'スター解除', en: 'Unstar' },
  ctxPin: { ja: 'ピン留め', en: 'Pin' },
  ctxUnpin: { ja: 'ピン解除', en: 'Unpin' },
  ctxRename: { ja: '名前を変更', en: 'Rename' },
  ctxChangeProject: { ja: 'プロジェクトを変更', en: 'Change Project' },
  ctxRemoveFromProject: { ja: 'プロジェクトから削除', en: 'Remove from Project' },
  ctxDelete: { ja: '削除', en: 'Delete' },
  ctxRenamePrompt: { ja: '新しい名前を入力してください', en: 'Enter a new name' },

  // List toolbar shared
  sortLabel: { ja: '並べ替え', en: 'Sort' },
  groupLabel: { ja: 'グループ', en: 'Group' },
  sortCreated: { ja: '作成日', en: 'Created' },
  sortName: { ja: '名前', en: 'Name' },
  sortLogCount: { ja: 'ログ数', en: 'Log Count' },
  sortTitle: { ja: 'タイトル', en: 'Title' },
  sortType: { ja: '種類', en: 'Type' },
  groupNone: { ja: 'なし', en: 'None' },
  groupDate: { ja: '日付', en: 'Date' },
  groupType: { ja: '種類', en: 'Type' },
  groupProject: { ja: 'プロジェクト', en: 'Project' },
  groupPinned: { ja: 'ピン留め', en: 'Pinned' },
  groupPinnedLabel: { ja: 'ピン留め', en: 'Pinned' },
  groupUnpinnedLabel: { ja: 'その他', en: 'Others' },
  groupNoProject: { ja: 'プロジェクトなし', en: 'No Project' },

  // Project action sheet
  projectOpenLogs: { ja: 'ログを表示', en: 'View Logs' },
  projectAddLogs: { ja: 'ログを追加', en: 'Add Logs' },
  projectOpenMasterNote: { ja: 'Project Summary を開く', en: 'Open Project Summary' },

  // Log action sheet
  logCopyMarkdown: { ja: 'Markdownをコピー', en: 'Copy Markdown' },
  logCopied: { ja: 'コピー済み', en: 'Copied!' },
  logDownloadMd: { ja: '.md をダウンロード', en: 'Download .md' },
  logDownloadJson: { ja: '.json をダウンロード', en: 'Download .json' },

  // Source reference
  sourceRefTitle: { ja: '元ソース', en: 'Source' },

  // Trash
  navTrash: { ja: 'ゴミ箱', en: 'Trash' },
  trashTitle: { ja: 'ゴミ箱', en: 'Trash' },
  trashEmpty: { ja: 'ゴミ箱は空です', en: 'Trash is empty.' },
  trashEmptyDesc: { ja: '削除したアイテムはここに30日間保持されます。', en: 'Deleted items are kept here for 30 days.' },
  trashRestore: { ja: '復元', en: 'Restore' },
  trashDeletePermanent: { ja: '完全に削除', en: 'Delete Permanently' },
  trashDeleteConfirm: { ja: 'このアイテムを完全に削除しますか？この操作は取り消せません。', en: 'Permanently delete this item? This cannot be undone.' },
  trashDaysLeft: (n: number) => ({
    ja: `残り${n}日`,
    en: `${n} day${n !== 1 ? 's' : ''} left`,
  }),
  trashMoveConfirm: { ja: 'ゴミ箱に移動しますか？', en: 'Move to trash?' },
  trashEmptyAll: { ja: 'ゴミ箱を空にする', en: 'Empty Trash' },
  trashEmptyAllConfirm: { ja: 'ゴミ箱を空にしますか？この操作は取り消せません。', en: 'Empty trash? This cannot be undone.' },
  trashFilterAll: { ja: 'すべて', en: 'All' },
  trashFilterLogs: { ja: 'ログ', en: 'Logs' },
  trashFilterProjects: { ja: 'プロジェクト', en: 'Projects' },
  trashFilterTodos: { ja: 'TODO', en: 'TODOs' },
  moveToTrash: { ja: 'ゴミ箱へ移動', en: 'Move to Trash' },
  trashTypeLog: { ja: 'ログ', en: 'Log' },
  trashTypeProject: { ja: 'プロジェクト', en: 'Project' },
  trashTypeTodo: { ja: 'TODO', en: 'TODO' },

  // Account menu
  accountMenuSettings: { ja: '設定', en: 'Settings' },
  accountMenuTrash: { ja: 'ゴミ箱', en: 'Trash' },
  accountMenuHelp: { ja: 'ヘルプ', en: 'Help' },
  accountMenuLogout: { ja: 'ログアウト', en: 'Log out' },
  accountMenuUser: { ja: 'ユーザー', en: 'User' },
  accountMenuPlan: { ja: 'Free', en: 'Free' },

  // File dates
  fileModified: { ja: '更新日', en: 'Modified' },

  // Related logs
  relatedLogs: { ja: '関連ログ', en: 'Related Logs' },

  // MasterNote History
  mnHistory: { ja: '履歴', en: 'History' },
  mnHistoryTitle: { ja: 'Summary 履歴', en: 'Summary History' },
  mnHistoryEmpty: { ja: '履歴がありません', en: 'No history yet' },
  mnHistoryRestore: { ja: 'このバージョンを復元', en: 'Restore this version' },
  mnHistoryRestoreConfirm: { ja: 'このバージョンを復元しますか？現在の内容は履歴に保存されます。', en: 'Restore this version? Current content will be saved to history.' },
  mnHistoryCurrent: { ja: '現在のバージョン', en: 'Current version' },
  mnHistoryRestored: { ja: '復元しました', en: 'Restored' },
  mnRefineComplete: { ja: '修正完了', en: 'Refinement complete' },
  mnSaved: { ja: '保存しました', en: 'Saved' },
  mnLastUpdated: { ja: '最終更新', en: 'Last updated' },

  // Timeline
  timelineTitle: { ja: 'Timeline', en: 'Timeline' },
  timelineDesc: { ja: '活動の時系列記録', en: 'Activity history' },
  timelineEmpty: { ja: 'まだ活動がありません', en: 'No activity yet' },
  timelineEmptyHint: { ja: 'ログを作成するとここに表示されます', en: 'Activity will appear here as you create logs' },
  timelineYesterday: { ja: '昨日', en: 'Yesterday' },
  timelineDateLabel: (y: number, m: number, d: number) => ({
    ja: `${y}年${m}月${d}日`,
    en: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}, ${y}`,
  }),
  timelineProjectCreated: { ja: 'プロジェクト作成', en: 'Project created' },
  timelineSummaryUpdated: { ja: 'Summary更新', en: 'Summary updated' },
  timelineTodoAdded: { ja: 'TODO追加', en: 'TODO added' },
  timelineTodoDone: { ja: 'TODO完了', en: 'TODO done' },
  timelineTodoDeleted: { ja: 'TODO削除', en: 'TODO deleted' },
  timelineTodoBatch: (n: number) => ({
    ja: `TODO ${n}件追加`,
    en: `${n} TODOs added`,
  }),
  timelineFilterAll: { ja: 'すべて', en: 'All' },
  timelinePrevDay: { ja: '前の日', en: 'Previous day' },
  timelineNextDay: { ja: '次の日', en: 'Next day' },

  // Log detail
  titleUpdated: { ja: 'タイトルを更新しました', en: 'Title updated' },
  memoSection: { ja: 'メモ', en: 'Notes' },
  memoPlaceholder: { ja: 'メモを追加...', en: 'Add a note...' },
  memoSave: { ja: '保存', en: 'Save' },
  memoEdit: { ja: '編集', en: 'Edit' },
  memoSaved: { ja: 'メモを保存しました', en: 'Note saved' },
  tagFilter: { ja: 'タグで絞り込み中', en: 'Filtering by tag' },
  logCreatedAt: { ja: '作成', en: 'Created' },
  logUpdatedAt: { ja: '更新', en: 'Updated' },

  // Pin limit
  pinLimitReached: { ja: 'ピン留めは最大5件までです', en: 'Pin limit reached — maximum 5' },

  // Keyboard shortcuts
  shortcutsTitle: { ja: 'キーボードショートカット', en: 'Keyboard Shortcuts' },
  shortcutNewLog: { ja: 'Create Logを開く', en: 'Open Create Log' },
  shortcutSearch: { ja: '検索バーを開く', en: 'Open search bar' },
  shortcutSettings: { ja: '設定を開く', en: 'Open Settings' },
  shortcutShortcuts: { ja: 'ショートカット一覧', en: 'Show shortcuts' },
  shortcutEscape: { ja: '戻る / 閉じる', en: 'Go back / Close' },

  // Stats
  statsTitle: { ja: '統計', en: 'Stats' },
  statsTotalLogs: { ja: 'ログ', en: 'Logs' },
  statsWorklogs: { ja: 'Worklog', en: 'Worklog' },
  statsHandoffs: { ja: 'Handoff', en: 'Handoff' },
  statsProjects: { ja: 'プロジェクト', en: 'Projects' },
  statsTodos: { ja: 'TODO', en: 'TODO' },
  statsTodoPending: { ja: '未完了', en: 'Pending' },
  statsTodoDone: { ja: '完了', en: 'Done' },
  statsTotalChars: { ja: '総文字数', en: 'Total chars' },

  // Timeline date nav
  timelineNoActivity: { ja: 'この日の記録はありません', en: 'No activity on this day' },
  timelineToday: { ja: '今日', en: 'Today' },
  bulkAssignedToast: (n: number, name: string) => ({
    ja: `${n}件のログを「${name}」に追加しました`,
    en: `Added ${n} log${n !== 1 ? 's' : ''} to "${name}"`,
  }),

  // Date range filter
  dateFilterBtn: { ja: '日付', en: 'Date' },
  dateFilterFrom: { ja: '開始', en: 'From' },
  dateFilterTo: { ja: '終了', en: 'To' },
  dateFilterToday: { ja: '今日', en: 'Today' },
  dateFilterThisWeek: { ja: '今週', en: 'This week' },
  dateFilterThisMonth: { ja: '今月', en: 'This month' },
  dateFilterCustom: { ja: 'カスタム', en: 'Custom' },
  dateFilterClear: { ja: 'クリア', en: 'Clear' },

  // Duplicate
  duplicateLog: { ja: '複製', en: 'Duplicate' },
  duplicateLogSuffix: { ja: ' (コピー)', en: ' (Copy)' },
  duplicateLogDone: { ja: 'ログを複製しました', en: 'Log duplicated' },

  // Bulk operations
  todoBulkSelect: { ja: '選択', en: 'Select' },
  todoBulkDone: { ja: '一括完了', en: 'Mark Done' },
  todoBulkDelete: { ja: '一括削除', en: 'Delete' },
  todoBulkSelectAll: { ja: '全選択', en: 'Select All' },
  todoBulkDeselectAll: { ja: '全解除', en: 'Deselect All' },
  todoBulkDeleteConfirm: (n: number) => ({
    ja: `${n}件のTODOを削除しますか？`,
    en: `Delete ${n} TODO${n !== 1 ? 's' : ''}?`,
  }),
  todoBulkDeleteConfirmDesc: { ja: 'ゴミ箱に移動されます。', en: 'They will be moved to trash.' },
  todoBulkCancel: { ja: '選択解除', en: 'Deselect' },
  todoBulkCopy: { ja: 'コピー', en: 'Copy' },
  todoBulkCopied: (n: number) => ({
    ja: `${n}件のTODOをコピーしました`,
    en: `Copied ${n} TODO${n !== 1 ? 's' : ''}`,
  }),

  // Archive
  todoArchive: { ja: 'アーカイブ', en: 'Archive' },
  todoUnarchive: { ja: 'アーカイブ解除', en: 'Unarchive' },
  todoArchived: { ja: 'アーカイブ済み', en: 'Archived' },
  todoNoArchived: { ja: 'アーカイブ済みのTODOはありません', en: 'No archived TODOs' },
  todoNoArchivedDesc: { ja: 'TODOの「…」メニューからアーカイブできます。', en: 'Archive TODOs from their "…" menu.' },

  // Weekly Report
  navWeeklyReport: { ja: '週次レポート', en: 'Weekly Report' },
  weeklyReportTitle: { ja: '週次レポート', en: 'Weekly Report' },
  weeklyReportDesc: { ja: '指定した週のログからレポートを自動生成します', en: 'Auto-generate a report from logs of a selected week' },
  weeklyReportGenerate: { ja: 'レポートを生成', en: 'Generate Report' },
  weeklyReportRegenerate: { ja: 'レポートを再生成', en: 'Regenerate Report' },
  weeklyReportGenerating: { ja: '生成中...', en: 'Generating...' },
  weeklyReportPreparing: { ja: 'ログを収集中...', en: 'Collecting logs...' },
  weeklyReportNoLogs: { ja: 'この週のログはありません', en: 'No logs for this week' },
  weeklyReportSaved: { ja: 'レポートを保存しました', en: 'Report saved' },
  weeklyReportCopied: { ja: 'コピーしました', en: 'Copied!' },
  weeklyReportOverwrite: { ja: 'この週のレポートは既に存在します。上書きしますか？', en: 'A report for this week already exists. Overwrite?' },
  weeklyReportOverwriteBtn: { ja: '上書き生成', en: 'Overwrite' },
  weeklyReportAllProjects: { ja: 'すべてのプロジェクト', en: 'All Projects' },
  weeklyReportSavedReports: { ja: '保存済みレポート', en: 'Saved Reports' },
  weeklyReportNoSaved: { ja: '保存済みレポートはありません', en: 'No saved reports yet' },
  weeklyReportNoSavedDesc: { ja: '週を選んでレポートを生成してください', en: 'Select a week and generate a report' },
  weeklyReportSummary: { ja: '今週のサマリー', en: 'Summary' },
  weeklyReportAchievements: { ja: '主な成果', en: 'Achievements' },
  weeklyReportDecisions: { ja: '決定事項', en: 'Decisions' },
  weeklyReportOpenItems: { ja: '未解決・持ち越し事項', en: 'Open Items' },
  weeklyReportCompletedTodos: { ja: '完了したTODO', en: 'Completed TODOs' },
  weeklyReportPendingTodos: { ja: '未完了のTODO', en: 'Pending TODOs' },
  weeklyReportNextWeek: { ja: '来週に向けて', en: 'Next Week' },
  weeklyReportStats: { ja: '活動統計', en: 'Activity Stats' },
  weeklyReportPrint: { ja: '印刷 / PDF', en: 'Print / PDF' },
  weeklyReportDelete: { ja: '削除', en: 'Delete' },
  weeklyReportDeleteConfirm: { ja: 'このレポートを削除しますか？', en: 'Delete this report?' },

  // View mode toggle
  viewCard: { ja: 'カード', en: 'Card' },
  viewList: { ja: 'リスト', en: 'List' },

  // Font size
  fontSizeLabel: { ja: '表示サイズ', en: 'Display Size' },
  fontSizeDesc: { ja: 'アプリ全体のフォントサイズを変更します。', en: 'Change the font size for the entire app.' },
  fontSizeSmall: { ja: '小', en: 'Small' },
  fontSizeMedium: { ja: '中', en: 'Medium' },
  fontSizeLarge: { ja: '大', en: 'Large' },

  // Log navigation
  prevLog: { ja: '← 前のログ', en: '← Previous' },
  nextLog: { ja: '次のログ →', en: 'Next →' },

  // Handoff copy
  copyHandoff: { ja: 'Handoffをコピー', en: 'Copy Handoff' },
  copyHandoffDone: { ja: 'コピーしました ✓', en: 'Copied ✓' },

  // Stale TODO
  staleTodoBanner: (n: number) => ({
    ja: `3日以上放置されているTODOが${n}件あります`,
    en: `${n} TODO${n !== 1 ? 's' : ''} inactive for 3+ days`,
  }),
  todoFilterStale: { ja: '放置中（3日以上）', en: 'Inactive (3+ days)' },
  todoDueAll: { ja: 'すべて', en: 'All' },
  todoDueToday: { ja: '今日期限', en: 'Due today' },
  todoDueThisWeek: { ja: '今週期限', en: 'Due this week' },
  todoDueOverdue: { ja: '期限切れ', en: 'Overdue' },

  // Keywords
  topKeywords: { ja: 'よく使うキーワード', en: 'Top Keywords' },

  // Workload
  workloadLevel: { ja: '負荷レベル', en: 'Workload' },
  workloadHigh: { ja: '高負荷', en: 'High' },
  workloadMedium: { ja: '中負荷', en: 'Medium' },
  workloadLow: { ja: '低負荷', en: 'Low' },
  workloadAnalyze: { ja: '負荷を分析', en: 'Analyze' },
  workloadAnalyzing: { ja: '分析中...', en: 'Analyzing...' },
  weeklyReportAvgWorkload: { ja: '今週の平均負荷', en: 'Avg. Workload' },

  // Notion integration
  notionLabel: { ja: 'Notion 連携', en: 'Notion Integration' },
  notionDesc: { ja: 'ログをNotionのデータベースに送信できます。', en: 'Send logs to a Notion database.' },
  notionApiKey: { ja: 'Notion API キー (Integration Token)', en: 'Notion API Key (Integration Token)' },
  notionApiKeyPlaceholder: { ja: 'ntn_...', en: 'ntn_...' },
  notionDatabaseId: { ja: 'データベース ID', en: 'Database ID' },
  notionDatabaseIdPlaceholder: { ja: '32桁のデータベースID', en: '32-character database ID' },
  notionSend: { ja: 'Notionに送る', en: 'Send to Notion' },
  notionSending: { ja: 'Notionに送信中...', en: 'Sending to Notion...' },
  notionSent: { ja: 'Notionに送りました', en: 'Sent to Notion' },
  notionNotConfigured: { ja: 'Notion連携が未設定です。設定画面から設定してください。', en: 'Notion not configured. Set up in Settings.' },

  // Slack integration
  slackLabel: { ja: 'Slack 連携', en: 'Slack Integration' },
  slackDesc: { ja: 'ログや週次レポートをSlackに投稿できます。', en: 'Post logs and weekly reports to Slack.' },
  slackWebhookUrl: { ja: 'Webhook URL', en: 'Webhook URL' },
  slackWebhookPlaceholder: { ja: 'https://hooks.slack.com/services/...', en: 'https://hooks.slack.com/services/...' },
  slackSend: { ja: 'Slackに送る', en: 'Send to Slack' },
  slackPost: { ja: 'Slackに投稿', en: 'Post to Slack' },
  slackSending: { ja: 'Slackに送信中...', en: 'Sending to Slack...' },
  slackSent: { ja: 'Slackに送りました', en: 'Sent to Slack' },
  slackNotConfigured: { ja: 'Slack連携が未設定です。設定画面から設定してください。', en: 'Slack not configured. Set up in Settings.' },

  // Knowledge Base
  kbTitle: { ja: 'ナレッジベース', en: 'Knowledge Base' },
  kbDesc: { ja: 'このプロジェクトでよく起きる問題と解決策', en: 'Recurring problems and solutions in this project' },
  kbGenerate: { ja: 'ナレッジベースを生成', en: 'Generate Knowledge Base' },
  kbRegenerate: { ja: 'ナレッジベースを再生成', en: 'Regenerate Knowledge Base' },
  kbGenerating: { ja: '生成中...', en: 'Generating...' },
  kbExtracting: (cur: number, total: number) => ({
    ja: `ログを分析中 (${cur}/${total})`,
    en: `Analyzing logs (${cur}/${total})`,
  }),
  kbAnalyzing: { ja: 'パターンを分析中...', en: 'Analyzing patterns...' },
  kbPatterns: { ja: 'よく起きる問題と解決策', en: 'Recurring Problems & Solutions' },
  kbProblem: { ja: '問題', en: 'Problem' },
  kbSolution: { ja: '解決策', en: 'Solution' },
  kbFrequency: (n: number) => ({
    ja: `${n}件のログで出現`,
    en: `Found in ${n} log${n !== 1 ? 's' : ''}`,
  }),
  kbBestPractices: { ja: 'ベストプラクティス', en: 'Best Practices' },
  kbCommonDecisions: { ja: '繰り返される決定事項', en: 'Recurring Decisions' },
  kbEmpty: { ja: 'ナレッジベースはまだありません', en: 'No knowledge base yet' },
  kbEmptyDesc: { ja: 'プロジェクトのログからAIが繰り返し出てくるパターンを抽出します。', en: 'AI will extract recurring patterns from project logs.' },
  kbNoLogs: { ja: 'ログがないため生成できません', en: 'Cannot generate — no logs in this project' },
  kbUpdatedAt: (date: string) => ({
    ja: `最終更新: ${date}`,
    en: `Last updated: ${date}`,
  }),
  kbLogCount: (n: number) => ({
    ja: `${n}件のログから分析`,
    en: `Analyzed from ${n} log${n !== 1 ? 's' : ''}`,
  }),
  kbBack: { ja: '← プロジェクトに戻る', en: '← Back to Project' },

  // Activity heatmap
  heatmapTitle: { ja: '作業時間のヒートマップ', en: 'Activity Heatmap' },
  heatmapTooltip: (n: number) => ({
    ja: `この時間帯のログ：${n}件`,
    en: `Logs in this slot: ${n}`,
  }),

  // Project activity chart
  projectChartTitle: { ja: 'プロジェクト別活動量', en: 'Project Activity' },
  projectChartPeriodWeek: { ja: '今週', en: 'This Week' },
  projectChartPeriodMonth: { ja: '今月', en: 'This Month' },
  projectChartPeriodAll: { ja: '全期間', en: 'All Time' },
  projectChartLogs: { ja: 'ログ数', en: 'Logs' },

  // Todo completion trend
  todoTrendTitle: { ja: 'TODO完了率トレンド', en: 'TODO Completion Trend' },
  todoTrendWeek: (n: number) => ({
    ja: `${n}週前`,
    en: `${n}w ago`,
  }),
  todoTrendThisWeek: { ja: '今週', en: 'This week' },
  todoTrendRate: { ja: '完了率', en: 'Completion Rate' },
  todoTrendImproved: (pct: number) => ({
    ja: `先週より+${pct}%改善しています`,
    en: `+${pct}% improvement over last week`,
  }),
  todoTrendDeclined: (pct: number) => ({
    ja: `先週より${pct}%低下しています`,
    en: `${pct}% decrease from last week`,
  }),

  // Data management
  dataLabel: { ja: 'データ管理', en: 'Data Management' },
  dataStorageNotice: { ja: 'データはこのブラウザのLocalStorageに保存されています。ブラウザを変えると引き継がれません。', en: 'Data is stored in this browser\'s localStorage. It will not carry over if you switch browsers.' },
  dataExport: { ja: 'データをエクスポート', en: 'Export Data' },
  dataExportDesc: { ja: '全データ（ログ・プロジェクト・Project Summary・TODO）をJSON形式でダウンロードします。', en: 'Download all data (logs, projects, summaries, TODOs) as JSON.' },
  dataImport: { ja: 'データをインポート', en: 'Import Data' },
  dataImportDesc: { ja: 'エクスポートしたJSONファイルを読み込んでデータを復元します。', en: 'Restore data from an exported JSON file.' },
  dataImportMerge: { ja: '現在のデータに追加（マージ）', en: 'Merge with current data' },
  dataImportOverwrite: { ja: '現在のデータを上書き', en: 'Overwrite current data' },
  dataImportSuccess: (logs: number, projects: number, todos: number) => ({
    ja: `インポートしました（ログ ${logs}件、プロジェクト ${projects}件、TODO ${todos}件）`,
    en: `Imported (${logs} logs, ${projects} projects, ${todos} TODOs)`,
  }),
  dataExportSuccess: { ja: 'エクスポートしました', en: 'Exported successfully' },
  dataUsageLabel: { ja: 'データ使用量', en: 'Data Usage' },
  dataUsageWarning: { ja: 'エクスポートしてデータを整理することを推奨します。', en: 'We recommend exporting your data and cleaning up.' },
  dataImportError: { ja: 'JSONファイルの形式が不正です。エクスポートしたファイルを使用してください。', en: 'Invalid JSON format. Please use an exported file.' },
  dataImportConfirmMerge: { ja: '現在のデータに追加します。重複するIDは上書きされます。', en: 'Data will be merged. Duplicate IDs will be overwritten.' },
  dataImportConfirmOverwrite: { ja: '現在のデータをすべて置き換えます。この操作は取り消せません。', en: 'All current data will be replaced. This cannot be undone.' },

  // Clipboard
  copyFailed: { ja: 'コピーに失敗しました', en: 'Failed to copy' },
  copiedToClipboard: { ja: 'コピーしました', en: 'Copied' },

  // Pagination
  loadMore: (remaining: number) => ({
    ja: `さらに表示（残り${remaining}件）`,
    en: `Load more (${remaining} remaining)`,
  }),

  // Aria labels
  ariaPin: { ja: 'ピン留め', en: 'Pin' },
  ariaUnpin: { ja: 'ピン留め解除', en: 'Unpin' },
  ariaMenu: { ja: 'メニューを開く', en: 'Open menu' },
  ariaClose: { ja: '閉じる', en: 'Close' },
  ariaDelete: { ja: '削除', en: 'Delete' },
  ariaMasterNote: { ja: 'マスターノートを開く', en: 'Open master note' },
  ariaShowSidebar: { ja: 'サイドバーを表示', en: 'Show sidebar' },
  ariaHideSidebar: { ja: 'サイドバーを隠す', en: 'Hide sidebar' },
  ariaCardView: { ja: 'カード表示', en: 'Card view' },
  ariaListView: { ja: 'リスト表示', en: 'List view' },

  // Overdue TODO banner
  overdueBanner: (n: number) => ({
    ja: `期限切れのTODOが${n}件あります`,
    en: `${n} overdue TODO${n !== 1 ? 's' : ''}`,
  }),
  overdueBannerLink: { ja: '→ TODOを確認する', en: '→ View TODOs' },

  // Unsaved input confirm dialog
  unsavedInputTitle: { ja: '入力中の内容が消えます', en: 'Unsaved input will be lost' },
  unsavedInputDesc: { ja: 'このまま移動しますか？', en: 'Are you sure you want to navigate away?' },
  unsavedInputConfirm: { ja: 'このまま移動', en: 'Leave' },

  // Streaming / transform progress
  streamReceiving: { ja: 'AIが応答中', en: 'Receiving' },
  todoExtractionTitle: { ja: 'TODO抽出', en: 'TODO Extraction' },
  toastHandoffSaved: { ja: '🔁 ハンドオフを保存しました', en: '🔁 Handoff saved' },
  toastTodosExtracted: (n: number) => ({
    ja: `✔ ${n}件のTODOを抽出しました`,
    en: `✔ ${n} TODOs extracted`,
  }),
  toastNoTodosFound: { ja: 'TODOが見つかりませんでした', en: 'No TODOs found' },
  toastLogSaved: { ja: '📝 ログを保存しました', en: '📝 Log saved' },
  toastTodosAdded: (n: number) => ({
    ja: `✔ ${n}件のTODOを追加しました`,
    en: `✔ ${n} TODOs added`,
  }),

  // Error messages
  errorApiKey: { ja: 'APIキーが正しくありません。設定画面で確認してください。', en: 'Invalid or missing API key. Please check your key in Settings.' },
  errorRateLimit: { ja: 'APIのレート制限に達しました。しばらく時間をおいてから再度お試しください。', en: 'API rate limit was hit. Please wait a few minutes and try again.' },
  errorTruncated: { ja: 'レスポンスが長すぎて途中で切れました。入力を短くして再試行してください。', en: 'Response was truncated. Try shorter input.' },
  errorParseResponse: { ja: 'AIの応答を正しく読み取れませんでした。もう一度お試しください。', en: 'Could not read the AI response. Please try again.' },
  errorTooLong: { ja: '入力がAPIの上限を超えています。入力を分割して処理してください。', en: 'Input exceeds the API size limit. Please split your input.' },
  errorNetwork: { ja: '通信に失敗しました。ネットワーク接続を確認して再試行してください。', en: 'Network error. Please check your connection and try again.' },
  errorEmptyResponse: { ja: 'AIから空の応答が返されました。もう一度お試しください。', en: 'Received an empty response from the AI. Please try again.' },
  errorApiGeneric: { ja: 'APIエラーが発生しました。しばらくしてからもう一度お試しください。', en: 'An API error occurred. Please try again in a moment.' },
  errorGeneric: { ja: 'エラーが発生しました。再試行してください。', en: 'An error occurred. Please try again.' },

  // Progress phases
  phaseCollectingCompleted: { ja: '完了項目を収集中…', en: 'Collecting completed items…' },
  phaseConsistencyCheck: { ja: '整合性チェック中…', en: 'Checking consistency…' },
  phaseCollectingCompletedDetail: { ja: 'チャットログ全体から完了項目を収集しています', en: 'Collecting completed items from full chat log' },
  phaseConsistencyCheckDetail: { ja: 'マージ結果の整合性を確認しています', en: 'Verifying merged results for consistency' },

  // Input view inline
  pasteFeedback: (n: string) => ({
    ja: `テキストを検出しました（${n}文字）`,
    en: `Text detected (${n} characters)`,
  }),
  longInputHint: { ja: '（長い入力のため処理に少し時間がかかる場合があります）', en: ' (long input — processing may take a moment)' },
  selectProject: { ja: 'プロジェクトを選択', en: 'Select project' },
  capturedFrom: (source: string) => ({
    ja: `${source}から取り込みました`,
    en: `Captured from ${source}`,
  }),
  captureTransformHint: { ja: 'ボタンを押して変換してください', en: 'Press the button to transform' },
  retryBtn: { ja: '再試行', en: 'Retry' },

  // Result view buttons
  viewHandoff: { ja: 'ハンドオフを見る', en: 'View Handoff' },
  viewLog: { ja: 'ログを見る', en: 'View Log' },

  // Detail view
  viewProjectSummary: { ja: 'プロジェクトサマリーを表示', en: 'View Project Summary' },
  clickToReanalyze: { ja: 'クリックで再分析', en: 'Click to re-analyze' },
  copyAiContextTitle: { ja: '次のAIセッションに貼り付けるコンテキストをコピー', en: 'Copy context to paste into your next AI session' },
  copyAiContext: { ja: 'AI Context + Handoff をコピー', en: 'Copy AI Context + Handoff' },
  copyWithContext: { ja: 'AI Context付きコピー', en: 'Copy with Context' },

  // Misc UI
  close: { ja: '閉じる', en: 'Close' },
  deleted: { ja: '削除しました', en: 'Deleted' },
  failed: { ja: '失敗しました', en: 'Failed' },
  extensionReceived: { ja: 'Extension から会話を受信しました', en: 'Received conversation from extension' },
  bulkDeletedToast: (n: number) => ({
    ja: `${n}件を削除しました`,
    en: `${n} deleted`,
  }),
  addedToProject: (name: string) => ({
    ja: `「${name}」に追加しました`,
    en: `Added to "${name}"`,
  }),
  bulkAddedToast: (n: number) => ({
    ja: `${n}件追加しました`,
    en: `${n} added`,
  }),
  projectCreated: { ja: 'プロジェクトを作成しました', en: 'Project created' },
  renamed: { ja: '名前を変更しました', en: 'Renamed' },

  // HistoryView
  bulkTrashConfirm: (n: number) => ({
    ja: `${n}件のログをゴミ箱に移動しますか？`,
    en: `Move ${n} log${n !== 1 ? 's' : ''} to trash?`,
  }),
  selectBtn: { ja: '選択', en: 'Select' },
  selectedCount: (n: number) => ({
    ja: `${n}件選択中`,
    en: `${n} selected`,
  }),
  selectItems: { ja: '選択してください', en: 'Select items' },
  unassignedLogsHint: (n: number) => ({
    ja: `${n}件のログがプロジェクト未割当です。プロジェクトに整理するとサマリーを生成できます。`,
    en: `${n} log${n !== 1 ? 's are' : ' is'} not assigned to a project. Organize them to generate summaries.`,
  }),
  organizeBtn: { ja: '整理する', en: 'Organize' },
  paginationPrev: { ja: '← 前へ', en: '← Prev' },
  paginationNext: { ja: '次へ →', en: 'Next →' },
  paginationPage: (cur: number, total: number) => ({
    ja: `${cur} / ${total}ページ`,
    en: `${cur} / ${total}`,
  }),
  viewSummaryLink: { ja: 'サマリーを見る →', en: 'View Summary →' },

  // ProjectsView
  projectNameRequired: { ja: 'プロジェクト名を入力してください', en: 'Please enter a project name' },
  searchProjects: { ja: 'プロジェクトを検索...', en: 'Search projects...' },
  hideEmptyProjects: { ja: '空のプロジェクトを非表示', en: 'Hide empty projects' },
  addBtn: { ja: '追加', en: 'Add' },

  // ProjectSummaryListView
  sortUpdatedDesc: { ja: '更新日（新しい順）', en: 'Updated (newest)' },
  sortUpdatedAsc: { ja: '更新日（古い順）', en: 'Updated (oldest)' },
  sortProjectName: { ja: 'プロジェクト名', en: 'Project name' },
  allProjectsHaveSummaries: { ja: '未作成のプロジェクトはありません', en: 'All projects have summaries' },
  hasUnreflectedHandoffs: { ja: '未反映ハンドオフあり', en: 'Has unreflected handoffs' },
  daysAgo: (n: number) => ({
    ja: `${n}日前`,
    en: `${n}d ago`,
  }),
  unreflectedHandoffWarning: (n: number) => ({
    ja: `未反映のHandoff ${n}件 — 更新推奨`,
    en: `${n} unreflected handoff${n > 1 ? 's' : ''} — update recommended`,
  }),
  openBtn: { ja: '開く', en: 'Open' },
  updateBtn: { ja: '更新する', en: 'Update' },

  // SettingsPanel
  providerUnstableWarning: { ja: '⚠️ 現在、Claude・OpenAIは動作が不安定です。Geminiの使用を強く推奨します。', en: '⚠️ Claude and OpenAI are currently unstable. We strongly recommend using Gemini.' },
  providerActive: { ja: '使用中', en: 'Active' },
  apiKeyErrorGemini: { ja: 'Gemini APIキーの形式が正しくありません（AIzaで始まる必要があります）', en: 'Invalid Gemini API key format (must start with AIza)' },
  apiKeyErrorAnthropic: { ja: 'Claude APIキーの形式が正しくありません', en: 'Invalid Claude API key format' },
  apiKeyErrorOpenai: { ja: 'OpenAI APIキーの形式が正しくありません', en: 'Invalid OpenAI API key format' },
  notionApiKeyError: { ja: 'Notion APIキーの形式が正しくありません', en: 'Invalid Notion API key format' },
  slackWebhookError: { ja: 'Slack Webhook URLの形式が正しくありません', en: 'Invalid Slack Webhook URL format' },
  showOnboardingAgain: { ja: 'オンボーディングをもう一度見る', en: 'Show onboarding again' },

  // Weekly Report extras
  weeklyReportTodoCompletionRate: { ja: 'TODO 完了率', en: 'TODO Done' },
  weeklyReportGeneratedAt: { ja: '生成日時', en: 'Generated' },
  weeklyReportLogCountInline: (n: number) => ({
    ja: `${n}件のログ`,
    en: `${n} log${n !== 1 ? 's' : ''}`,
  }),
  weeklyReportNoLogsHint: { ja: 'ログを作成するとレポートを生成できます', en: 'Create logs to generate a report' },
  weeklyReportViewSaved: { ja: 'この週の保存済みレポートを表示', en: 'View saved report for this week' },

  // Trash extras
  trashItemCount: (n: number) => ({
    ja: `${n}件のアイテム`,
    en: `${n} item${n !== 1 ? 's' : ''}`,
  }),
  ariaDeletePermanently: { ja: '完全に削除', en: 'Delete permanently' },
  trashCannotUndo: { ja: 'この操作は取り消せません。', en: 'This cannot be undone.' },
  trashEmptyAllDesc: { ja: 'すべてのアイテムを完全に削除します。この操作は取り消せません。', en: 'All items will be permanently deleted. This cannot be undone.' },

  // ProjectAppearanceModal extras
  previewLabel: { ja: 'プレビュー', en: 'Preview' },

  // ProjectHomeView extras
  projectSummaryAutoGenHint: (n: number) => ({
    ja: `${n}件のログからAIがプロジェクトの全体像を自動生成します`,
    en: `AI will generate a project overview from your ${n} logs`,
  }),
  projectSummaryGenerateLink: { ja: '→ サマリーを生成する', en: '→ Generate Summary' },

  // Dashboard extras
  dashboardWelcome: { ja: 'Loreへようこそ', en: 'Welcome to Lore' },
  dashboardWelcomeDesc: { ja: 'AIとの会話を貼り付けてHandoffを作成しましょう', en: 'Paste an AI conversation and create a Handoff' },
  dashboardCreateFirstHandoff: { ja: '最初のHandoffを作成', en: 'Create your first Handoff' },
  dashboardCreateFirstLog: { ja: '最初のログを作成', en: 'Create Your First Log' },
  dashboardRecentProjects: { ja: '最近のプロジェクト', en: 'Recent projects' },
  ariaCreateNewLog: { ja: '新しいログを作成', en: 'Create new log' },
  dashboardNew: { ja: '新規', en: 'New' },
  ariaDismissNotification: { ja: '通知を閉じる', en: 'Dismiss notification' },
  dashboardTodayFocus: { ja: '今日のフォーカス', en: "Today's Focus" },
  dashboardMoreTasks: (n: number) => ({
    ja: `他 ${n} 件`,
    en: `${n} more`,
  }),
  dashboardDone: { ja: '完了', en: 'Done' },
  dashboardBlockers: { ja: 'ブロッカー', en: 'Blockers' },
  nudgeOverdue: (n: number) => ({
    ja: `期限切れ ${n}件`,
    en: `${n} overdue`,
  }),
  nudgeStaleCount: (n: number) => ({
    ja: `更新推奨 ${n}件`,
    en: `${n} to update`,
  }),
  nudgeStaleSub: { ja: 'サマリー', en: 'Summary' },
  nudgeUnassigned: (n: number) => ({
    ja: `未割当 ${n}件`,
    en: `${n} unassigned`,
  }),

  // ProgressPanel
  processingFallback: { ja: '処理中...', en: 'Processing...' },

  // TodoView
  todoSelectedCount: (selected: number, total: number) => ({
    ja: `${selected}/${total}件選択中`,
    en: `${selected}/${total} selected`,
  }),

  // ErrorBoundary
  errorTitle: { ja: 'エラーが発生しました', en: 'Something went wrong' },
  errorDesc: { ja: 'このビューでエラーが発生しました。リロードするか、サイドバーから別のビューに移動してください。', en: 'An error occurred in this view. Try reloading the page or navigating to a different view from the sidebar.' },
  errorReload: { ja: 'リロード', en: 'Reload' },
  errorShowDetails: { ja: '詳細を表示', en: 'Show details' },
  errorHideDetails: { ja: '詳細を隠す', en: 'Hide details' },

  // HelpView
  helpTitle: { ja: 'ヘルプ', en: 'Help' },
  helpWhatIsLoreTitle: { ja: 'Loreとは', en: 'What is Lore?' },
  helpWhatIsLoreDesc: { ja: 'AIとの会話を貼り付けるだけで、Worklog（作業ログ）やHandoff（引き継ぎメモ）に自動変換するツールです。', en: 'Lore automatically transforms your AI conversations into structured Worklogs and Handoff notes — just paste and go.' },
  helpWhatIsLoreAudience: { ja: '対象ユーザー：ChatGPT・Claude・GeminiなどのAIを仕事で使っている方', en: 'For anyone who uses AI tools like ChatGPT, Claude, or Gemini in their work.' },
  helpGettingStartedTitle: { ja: '基本的な使い方', en: 'Getting Started' },
  helpStep1: { ja: '「+ Create Log」を押す', en: 'Click "+ Create Log"' },
  helpStep2: { ja: 'AIとの会話をテキストエリアに貼り付ける（またはファイルをドロップ）', en: 'Paste your AI conversation into the text area (or drop a file)' },
  helpStep3: { ja: '生成モードを選ぶ（Handoff / Handoff+TODO抽出 / TODO抽出）', en: 'Choose a generation mode (Handoff / Handoff+TODO / TODO only)' },
  helpStep4: { ja: '変換ボタンを押す', en: 'Click the transform button' },
  helpStep5: { ja: '生成されたログを確認・保存する', en: 'Review and save the generated log' },
  helpFeaturesTitle: { ja: '各機能の説明', en: 'Features' },
  helpFeatureWorklog: { ja: 'その日やったことをAIが整理して作業ログにします。決定事項やTODOも自動抽出されます。', en: 'AI organizes what you did into a structured work log, automatically extracting decisions and TODOs.' },
  helpFeatureHandoff: { ja: '次のAIや未来の自分がすぐ作業を再開できる引き継ぎメモを生成します。', en: 'Generates a handoff memo so the next AI (or future you) can resume work immediately.' },
  helpFeatureProject: { ja: 'ログをプロジェクト単位で整理できます。ログの分類やフィルタリングに便利です。', en: 'Organize logs by project for easy categorization and filtering.' },
  helpFeatureProjectSummary: { ja: 'プロジェクトに紐づくログをまとめてAIが要約します。進捗の全体像を把握できます。', en: 'AI summarizes all logs in a project, giving you a high-level view of progress.' },
  helpFeatureTodo: { ja: 'ログから自動抽出されたタスクを管理できます。手動追加や優先度・期限の設定も可能です。', en: 'Manage tasks auto-extracted from logs. You can also add tasks manually with priority and due dates.' },
  helpFeatureTimeline: { ja: 'すべての活動（ログ作成・TODO追加・プロジェクト作成など）を時系列で確認できます。', en: 'View all activity (log creation, TODOs, projects, etc.) in chronological order.' },
  helpKeyboardTitle: { ja: 'キーボードショートカット', en: 'Keyboard Shortcuts' },
  helpShortcutCreate: { ja: 'Create Logを開く', en: 'Open Create Log' },
  helpShortcutSearch: { ja: '検索バーを開く', en: 'Open search bar' },
  helpShortcutSettings: { ja: '設定を開く', en: 'Open Settings' },
  helpShortcutList: { ja: 'ショートカット一覧を表示', en: 'Show keyboard shortcuts' },
  helpShortcutEsc: { ja: '戻る / モーダルを閉じる', en: 'Go back / Close modal' },
  helpApiKeysTitle: { ja: 'APIキーについて', en: 'About API Keys' },
  helpApiKeysDesc: { ja: '設定画面からClaude・Gemini・OpenAIのAPIキーを登録できます。キーはこのブラウザのLocalStorageにのみ保存され、外部には送信されません。', en: "You can register API keys for Claude, Gemini, and OpenAI in Settings. Keys are stored only in this browser's localStorage and are never sent externally." },
  helpDataNoticeTitle: { ja: 'データについての注意', en: 'Data Notice' },
  helpDataNotice1: { ja: 'データはこのブラウザのLocalStorageに保存されています。', en: "Data is stored in this browser's localStorage." },
  helpDataNotice2: { ja: 'ブラウザを変えるとデータは引き継がれません。', en: 'Data will not carry over if you switch browsers.' },
  helpDataNotice3: { ja: '定期的に設定画面の「データをエクスポート」でバックアップすることを推奨します。', en: 'We recommend regularly backing up your data using "Export Data" in Settings.' },
  helpFaqTitle: { ja: 'よくある質問', en: 'FAQ' },
  helpFaqTransformQ: { ja: '変換がうまくいかない', en: 'Transform is not working' },
  helpFaqTransformA: { ja: 'APIキーが正しく設定されているか確認してください。設定画面で各プロバイダのキーのステータスを確認できます。', en: "Make sure your API key is correctly configured. You can check each provider's key status in Settings." },
  helpFaqDataLostQ: { ja: 'データが消えた', en: 'My data disappeared' },
  helpFaqDataLostA: { ja: '別のブラウザやシークレットウィンドウで開いていないか確認してください。データはブラウザごとに独立しています。', en: 'Check if you are using a different browser or incognito window. Data is stored per browser.' },
  helpFaqLongInputQ: { ja: 'ログが長すぎてエラーになる', en: 'Error due to long input' },
  helpFaqLongInputA: { ja: '入力が長い場合は自動的に長文モードに切り替わります。それでもエラーになる場合は、入力を分割してください。', en: 'Long inputs are automatically handled in long-text mode. If errors persist, try splitting your input.' },
  helpFaqContextVsSummaryQ: { ja: 'AI ContextとProject Summaryの違いは何ですか？', en: 'What is the difference between AI Context and Project Summary?' },
  helpFaqContextVsSummaryA: { ja: 'Project Summaryは人間が読むためのプロジェクト全体の記録です。AI Contextはそれを圧縮してAIに渡すための背景情報です。ハンドオフをコピーすると自動でAI Contextが付与されます。', en: 'Project Summary is a human-readable record of the entire project. AI Context is a compressed version designed to be passed to AI assistants. When you copy a handoff, AI Context is automatically included.' },
  helpFaqHandoffToAiQ: { ja: 'ハンドオフをAIに渡すにはどうすればいいですか？', en: 'How do I pass a handoff to AI?' },
  helpFaqHandoffToAiA: { ja: 'ハンドオフ詳細画面の「Handoffをコピー」ボタンを押してください。プロジェクトに紐づいている場合、AI Contextが自動で先頭に付与された状態でコピーされます。そのままChatGPT・Claude・Geminiに貼り付けてください。', en: 'Click the "Copy Handoff" button on the handoff detail screen. If the log is linked to a project, AI Context is automatically prepended. Just paste it into ChatGPT, Claude, or Gemini.' },
  helpFaqUpdateSummaryQ: { ja: 'Project Summaryはいつ更新すればいいですか？', en: 'When should I update the Project Summary?' },
  helpFaqUpdateSummaryA: { ja: '新しいHandoffをプロジェクトに追加したタイミングで更新することをおすすめします。サイドバーのプロジェクト名横にオレンジのバッジが表示されたら更新のサインです。', en: "We recommend updating it whenever you add a new Handoff to the project. An orange badge next to the project name in the sidebar indicates it's time to update." },
  helpFaqWorklogVsHandoffQ: { ja: 'WorklogとHandoffの違いは何ですか？', en: 'What is the difference between Worklog and Handoff?' },
  helpFaqWorklogVsHandoffA: { ja: 'Worklogはその日の作業内容を整理した「日報」です。Handoffは次のAIセッションに渡すための「引き継ぎメモ」で、現状・次のアクション・注意点がまとめられます。通常はHandoffを使うことをおすすめします。', en: 'Worklog is a "daily report" summarizing your work. Handoff is a "handover memo" for the next AI session, covering current status, next actions, and caveats. We recommend using Handoff in most cases.' },
  helpFaqKnowledgeBaseQ: { ja: 'ナレッジベースは何に使いますか？', en: 'What is the Knowledge Base for?' },
  helpFaqKnowledgeBaseA: { ja: 'プロジェクト内のログからAIが繰り返し登場するパターン・用語・ルールを抽出します。プロジェクトの「型」が見えてきます。ログが5件以上たまったら生成してみてください。', en: "AI extracts recurring patterns, terms, and rules from your project logs. It reveals the \"shape\" of your project. Try generating one once you have 5+ logs." },
  helpFaqTooManyLogsQ: { ja: 'ログが増えすぎたらどうすればいいですか？', en: 'What should I do when I have too many logs?' },
  helpFaqTooManyLogsA: { ja: 'ログ一覧画面から個別に削除できます。削除したログはゴミ箱に移動し、30日後に自動削除されます。プロジェクトに紐づけて整理することもおすすめです。', en: 'You can delete logs individually from the log list. Deleted logs go to Trash and are auto-deleted after 30 days. Organizing them into projects is also recommended.' },
  helpFaqExtensionQ: { ja: 'Chrome拡張が動かない場合は？', en: 'Chrome extension not working?' },
  helpFaqExtensionA: { ja: '拡張機能のアイコンをクリックし、「Loreのタブで開く」を押してください。それでも動かない場合は、拡張機能を一度オフにしてから再度オンにしてみてください。', en: "Click the extension icon and press \"Open in Lore tab\". If it still doesn't work, try disabling and re-enabling the extension." },
  helpFaqDataStorageQ: { ja: 'データはどこに保存されていますか？', en: 'Where is my data stored?' },
  helpFaqDataStorageA: { ja: 'このブラウザのLocalStorageに保存されています。別のブラウザやシークレットウィンドウでは表示されません。設定画面の「データをエクスポート」で定期的にバックアップすることをおすすめします。', en: "Data is stored in this browser's localStorage. It won't appear in other browsers or incognito windows. We recommend regular backups using \"Export Data\" in Settings." },
  helpShowOnboarding: { ja: 'オンボーディングをもう一度見る', en: 'Show onboarding again' },

  // Onboarding
  onboardingWelcomeTitle: { ja: 'Loreへようこそ', en: 'Welcome to Lore' },
  onboardingWelcomeDesc: { ja: 'AIとの会話を貼り付けるだけで、作業ログ・引き継ぎメモを自動生成します。', en: 'Automatically generate work logs and handoff notes — just paste your AI conversations.' },
  onboardingApiKeyTitle: { ja: 'まずAPIキーを設定しましょう', en: 'Set up your API key' },
  onboardingApiKeyDesc: { ja: 'Gemini（推奨）のAPIキーを設定しましょう。\n無料で取得できます。\n\n→ aistudio.google.com でAPIキーを取得\n\u3000Claude・OpenAIにも対応しています。', en: "Set up a Gemini (recommended) API key.\nIt's free to get started.\n\n→ aistudio.google.com to get an API key\n  Claude and OpenAI are also supported." },
  onboardingApiKeyAction: { ja: '設定画面を開く', en: 'Open Settings' },
  onboardingPasteTitle: { ja: 'AIとの会話を貼り付けてみましょう', en: 'Paste an AI conversation' },
  onboardingPasteDesc: { ja: 'ChatGPTやClaudeとの会話をコピーして貼り付けるだけでOKです。ファイルのドロップにも対応しています。', en: 'Just copy and paste a conversation from ChatGPT or Claude. You can also drop files.' },
  onboardingPasteAction: { ja: 'やってみる', en: 'Try it now' },
  onboardingExtensionTitle: { ja: 'Chrome拡張でもっと便利に', en: 'Even easier with the Chrome extension' },
  onboardingExtensionDesc: { ja: 'ChatGPTやClaudeのページに\n「Loreに送る」ボタンが追加されます。\n\n会話が終わったらワンクリックで\nLoreに送れます。', en: 'Adds a "Send to Lore" button\non ChatGPT and Claude pages.\n\nSend conversations to Lore\nwith one click.' },
  onboardingExtensionAction: { ja: 'スキップ', en: 'Skip for now' },
  onboardingAssetTitle: { ja: 'AIとの会話が資産になる', en: 'Your AI chats become assets' },
  onboardingAssetDesc: { ja: '1. AIで仕事する\n2. チャット履歴をLoreに貼る\n3. Handoffに自動変換される\n4. プロジェクトに追加してProject Summaryを生成\n5. 次回のAIにHandoffをコピペ → 即座に文脈共有', en: '1. Work with AI\n2. Paste the chat into Lore\n3. Auto-converted to Handoff\n4. Add to a project and generate a Project Summary\n5. Copy-paste Handoff to next AI → instant context sharing' },
  onboardingReadyTitle: { ja: '準備完了です', en: "You're all set!" },
  onboardingReadyDesc: { ja: '困ったときはサイドバーのヘルプをご確認ください。', en: 'If you need help, check the Help section in the sidebar.' },
  onboardingBack: { ja: '戻る', en: 'Back' },
  onboardingSkip: { ja: 'スキップ', en: 'Skip' },
  onboardingGetStarted: { ja: 'はじめる', en: 'Get Started' },
  onboardingNext: { ja: '次へ', en: 'Next' },

  aiThinking: { ja: 'AIが考え中...', en: 'AI is thinking...' },

  todoProgress: { ja: '完了', en: 'done' },
  todoDueToday2: { ja: '今日期限', en: 'Due today' },
  todoOverdue2: { ja: '期限超過', en: 'Overdue' },
  snooze: { ja: 'スヌーズ', en: 'Snooze' },
  snooze1Day: { ja: '明日まで', en: 'For 1 day' },
  snooze3Days: { ja: '3日後まで', en: 'For 3 days' },
  snooze1Week: { ja: '1週間後まで', en: 'For 1 week' },
  snoozed: { ja: 'スヌーズ中', en: 'Snoozed' },
  showSnoozed: { ja: 'スヌーズ中を表示', en: 'Show snoozed' },

  selectMode: { ja: '選択', en: 'Select' },
  selectAll: { ja: '全選択', en: 'Select all' },
  deselectAll: { ja: '選択解除', en: 'Deselect all' },
  bulkTrash: { ja: 'まとめてゴミ箱へ', en: 'Trash selected' },
  bulkAssignProject: { ja: 'プロジェクトに割当', en: 'Assign to project' },

  switchProject: { ja: 'プロジェクト切替', en: 'Switch project' },

  autoWeeklyReport: { ja: '週次レポート自動生成', en: 'Auto weekly report' },
  autoWeeklyReportDesc: { ja: 'アプリ起動時、前回から1週間経過していたらリマインド', en: 'Remind on app launch if a week has passed since last report' },
  weeklyReportReminder: { ja: '前回の週次レポートから1週間経ちました', en: 'A week has passed since your last report' },
  generateNow: { ja: '今すぐ生成', en: 'Generate now' },

  // Trends
  trends: { ja: 'トレンド', en: 'Trends' },
  thisWeek: { ja: '今週', en: 'This week' },
  lastWeek: { ja: '先週', en: 'Last week' },
  avgPerWeek: { ja: '週平均', en: 'Avg/week' },
  vsLastWeek: { ja: '先週比', en: 'vs last week' },
  completionRate: { ja: '完了率', en: 'Completion rate' },
  logsCount: (n: number) => ({
    ja: `${n}件`,
    en: `${n} logs`,
  }),

  // Related logs / backlinks
  linkLog: { ja: 'ログをリンク', en: 'Link log' },
  unlink: { ja: 'リンク解除', en: 'Unlink' },

  // Bottom navigation (mobile)
  more: { ja: 'その他', en: 'More' },

  // Offline indicator
  offline: { ja: 'オフライン — 変更はローカルに保存されます', en: 'Offline — changes saved locally' },
  backOnline: { ja: 'オンラインに復帰しました', en: 'Back online' },

  // Post-generation preview panel
  copyFullContext: { ja: 'プロジェクトコンテキストをコピー', en: 'Copy Full Context' },
  copyFullContextDesc: { ja: 'プロジェクト全体像と最新セッションを合成したAI向けコンテキスト', en: 'Combined project overview and latest session context for AI' },
  logSaved: { ja: 'ログを保存しました', en: 'Log saved' },
  startNewLog: { ja: '新しいログ', en: 'New Log' },

  // Accept/Reject flow
  pendingUpdate: { ja: '更新プレビュー', en: 'Update Preview' },
  accept: { ja: '反映する', en: 'Accept' },
  reject: { ja: '破棄する', en: 'Reject' },
  current: { ja: '現在', en: 'Current' },
  proposed: { ja: '更新案', en: 'Proposed' },
  masterNoteUpdated: { ja: 'マスターノートを更新しました', en: 'Master note updated' },
  empty: { ja: '（なし）', en: '(empty)' },

  // Error handling UX
  somethingWentWrong: { ja: '問題が発生しました', en: 'Something went wrong' },
  tryAgain: { ja: '再試行', en: 'Try again' },
  reloadPage: { ja: 'ページを再読み込み', en: 'Reload page' },
  offlineAiUnavailable: { ja: 'オフラインです。AI機能にはインターネット接続が必要です。', en: "You're offline. AI features require an internet connection." },
  networkError: { ja: 'ネットワークエラーが発生しました', en: 'A network error occurred' },
  errorDetails: { ja: 'エラー詳細', en: 'Error details' },

} as const;

/** Exported for testing — do not use in application code. */
export const _labels = labels;

type LabelKey = keyof typeof labels;
type LabelValue = (typeof labels)[LabelKey];

// Simple label (not a function)
type SimpleLabel = { ja: string; en: string };

export function t(key: LabelKey, lang: Lang): string {
  const val = labels[key] as LabelValue;
  if (typeof val === 'function') return ''; // Use tf() for function labels
  return (val as SimpleLabel)[lang];
}

// Function label — caller invokes the function, then picks language
export function tf<Args extends unknown[]>(
  key: LabelKey,
  lang: Lang,
  ...args: Args
): string {
  const val = labels[key] as unknown;
  if (typeof val === 'function') {
    const result = (val as (...a: Args) => SimpleLabel)(...args);
    return result[lang];
  }
  return (val as SimpleLabel)[lang];
}
