/**
 * Sample data seeded on first launch to help new users understand Lore.
 */
import { addLog, addProject, saveMasterNote, addTodosFromLogWithMeta } from './storage';
import type { LogEntry, MasterNote } from './types';
import type { Lang } from './i18n';

const SAMPLE_SEEDED_KEY = 'threadlog_sample_seeded';

export function isSampleSeeded(): boolean {
  return localStorage.getItem(SAMPLE_SEEDED_KEY) === '1';
}

function markSampleSeeded(): void {
  try { localStorage.setItem(SAMPLE_SEEDED_KEY, '1'); } catch { /* ignore */ }
}

// ── Localized content ──────────────────────────────────────────

interface SampleContent {
  projectName: string;
  log1Title: string;
  log1Tags: string[];
  log1CurrentStatus: string[];
  log1Completed: string[];
  log1NextActions: string[];
  log1NextActionItems: { action: string; whyImportant: string; priorityReason: string }[];
  log1Constraints: string[];
  log1Decisions: { decision: string; rationale: string }[];
  log1ResumeContext: string[];
  log1ResumeChecklist: { action: string; whyNow: string; ifSkipped: string }[];
  log1Meta: { sessionFocus: string; whyThisSession: string; timePressure: string };
  log2Title: string;
  log2Tags: string[];
  log2CurrentStatus: string[];
  log2Completed: string[];
  log2NextActions: string[];
  log2NextActionItems: { action: string; whyImportant: string; priorityReason: string }[];
  log2ActionBacklog: { action: string; whyImportant: string; priorityReason: string }[];
  log2Blockers: string[];
  log2Constraints: string[];
  log2Decisions: { decision: string; rationale: string }[];
  log2ResumeContext: string[];
  log2ResumeChecklist: { action: string; whyNow: string; ifSkipped: string }[];
  log2Meta: { sessionFocus: string; whyThisSession: string; timePressure: string };
  todos: { title: string; priority: 'high' | 'medium' | 'low' }[];
  masterOverview: string;
  masterDecisions: string[];
  masterOpenIssues: string[];
  masterNextActions: string[];
}

const content: Record<string, SampleContent> = {
  en: {
    projectName: 'My AI Project',
    log1Title: 'Project Setup & Core Architecture',
    log1Tags: ['setup', 'architecture', 'React', 'TypeScript'],
    log1CurrentStatus: [
      'Project scaffolding complete with React + TypeScript',
      'Database schema designed and tables created',
      'Basic folder structure established',
    ],
    log1Completed: [
      'Set up Vite + React-TS project',
      'Designed database schema (users, tasks, projects)',
      'Configured ESLint and TypeScript strict mode',
    ],
    log1NextActions: ['Build the main dashboard UI', 'Implement user authentication'],
    log1NextActionItems: [
      { action: 'Build the main dashboard UI', whyImportant: 'Core user-facing feature', priorityReason: 'Needed before any other UI work' },
      { action: 'Implement user authentication', whyImportant: 'Required for multi-user support', priorityReason: 'Blocks protected routes' },
    ],
    log1Constraints: ['TypeScript strict mode', 'Must support mobile browsers'],
    log1Decisions: [
      { decision: 'Use Vite instead of Next.js', rationale: 'SPA is sufficient, no SSR needed' },
      { decision: 'PostgreSQL for the database', rationale: 'Best relational DB for structured data' },
    ],
    log1ResumeContext: ['Check the project setup in src/', 'Review database schema'],
    log1ResumeChecklist: [{ action: 'Review database schema', whyNow: 'Foundation for all features', ifSkipped: 'May build on wrong assumptions' }],
    log1Meta: { sessionFocus: 'Setting up the project foundation', whyThisSession: 'Need a solid base before building features', timePressure: 'Launch target in 4 weeks' },
    log2Title: 'Dashboard UI & Authentication',
    log2Tags: ['UI', 'authentication', 'React', 'dashboard'],
    log2CurrentStatus: [
      'Dashboard layout is functional with task cards',
      'Authentication flow works (login, signup, logout)',
      'Protected routes are configured',
    ],
    log2Completed: [
      'Built dashboard with task list and sidebar',
      'Implemented email/password authentication',
      'Added protected route middleware',
      'Created responsive navigation bar',
    ],
    log2NextActions: ['Add drag-and-drop for task reordering', 'Implement real-time notifications', 'Write tests for auth flow'],
    log2NextActionItems: [
      { action: 'Add drag-and-drop for task reordering', whyImportant: 'Key UX feature users expect', priorityReason: 'Most requested feature' },
      { action: 'Implement real-time notifications', whyImportant: 'Keeps users engaged', priorityReason: 'Important for collaboration' },
      { action: 'Write tests for auth flow', whyImportant: 'Auth bugs are critical', priorityReason: 'Security-sensitive code needs coverage' },
    ],
    log2ActionBacklog: [{ action: 'Add dark mode support', whyImportant: 'User preference', priorityReason: 'Nice-to-have for launch' }],
    log2Blockers: ['Need to decide on WebSocket vs SSE for real-time updates'],
    log2Constraints: ['TypeScript strict mode', 'Must support mobile browsers'],
    log2Decisions: [
      { decision: 'Use session-based auth over JWT', rationale: 'Server-rendered pages work better with cookies' },
      { decision: 'React Query for server state', rationale: 'Handles caching and refetching automatically' },
    ],
    log2ResumeContext: ['Pull latest from main', 'Check dashboard components in src/components/'],
    log2ResumeChecklist: [{ action: 'Review the auth middleware', whyNow: 'Just implemented, needs verification', ifSkipped: 'Could have security gaps' }],
    log2Meta: { sessionFocus: 'Building the dashboard and authentication', whyThisSession: 'These are the two highest-priority features', timePressure: 'Launch in 3 weeks' },
    todos: [
      { title: 'Add drag-and-drop for task reordering', priority: 'high' },
      { title: 'Implement real-time notifications', priority: 'medium' },
      { title: 'Write tests for auth flow', priority: 'high' },
      { title: 'Add dark mode support', priority: 'low' },
    ],
    masterOverview: 'A task management application built with React and TypeScript. The project is in active development with core architecture complete and main UI features being implemented. Authentication is functional and the dashboard is taking shape.',
    masterDecisions: [
      'Use Vite instead of Next.js — SPA is sufficient, no SSR needed',
      'PostgreSQL for the database — best relational DB for structured data',
      'Session-based auth over JWT — server-rendered pages work better with cookies',
      'React Query for server state — handles caching and refetching automatically',
    ],
    masterOpenIssues: ['Need to decide on WebSocket vs SSE for real-time updates'],
    masterNextActions: ['Add drag-and-drop for task reordering', 'Implement real-time notifications', 'Write tests for auth flow'],
  },
  ja: {
    projectName: 'AIプロジェクト',
    log1Title: 'プロジェクトセットアップとコアアーキテクチャ',
    log1Tags: ['セットアップ', 'アーキテクチャ', 'React', 'TypeScript'],
    log1CurrentStatus: [
      'React + TypeScriptでプロジェクトの雛形が完成',
      'データベーススキーマを設計し、テーブルを作成済み',
      '基本的なフォルダ構成を確立',
    ],
    log1Completed: [
      'Vite + React-TSプロジェクトのセットアップ',
      'データベーススキーマの設計（users, tasks, projects）',
      'ESLintとTypeScript strict modeの設定',
    ],
    log1NextActions: ['メインダッシュボードUIの構築', 'ユーザー認証の実装'],
    log1NextActionItems: [
      { action: 'メインダッシュボードUIの構築', whyImportant: 'ユーザー向けの中核機能', priorityReason: '他のUI作業の前に必要' },
      { action: 'ユーザー認証の実装', whyImportant: 'マルチユーザー対応に必須', priorityReason: '保護ルートのブロッカー' },
    ],
    log1Constraints: ['TypeScript strictモード', 'モバイルブラウザ対応必須'],
    log1Decisions: [
      { decision: 'Next.jsの代わりにViteを使用', rationale: 'SPAで十分、SSR不要' },
      { decision: 'データベースにPostgreSQLを採用', rationale: '構造化データに最適なリレーショナルDB' },
    ],
    log1ResumeContext: ['src/のプロジェクトセットアップを確認', 'データベーススキーマをレビュー'],
    log1ResumeChecklist: [{ action: 'データベーススキーマのレビュー', whyNow: '全機能の基盤', ifSkipped: '誤った前提で構築するリスク' }],
    log1Meta: { sessionFocus: 'プロジェクト基盤の構築', whyThisSession: '機能開発の前に堅固な基盤が必要', timePressure: 'ローンチ目標まで4週間' },
    log2Title: 'ダッシュボードUIと認証',
    log2Tags: ['UI', '認証', 'React', 'ダッシュボード'],
    log2CurrentStatus: [
      'タスクカード付きのダッシュボードレイアウトが動作中',
      '認証フロー（ログイン、サインアップ、ログアウト）が動作',
      '保護ルートの設定完了',
    ],
    log2Completed: [
      'タスクリストとサイドバー付きダッシュボードの構築',
      'メール/パスワード認証の実装',
      '保護ルートミドルウェアの追加',
      'レスポンシブナビゲーションバーの作成',
    ],
    log2NextActions: ['タスク並べ替えのドラッグ&ドロップ追加', 'リアルタイム通知の実装', '認証フローのテスト作成'],
    log2NextActionItems: [
      { action: 'タスク並べ替えのドラッグ&ドロップ追加', whyImportant: 'ユーザーが期待するUX機能', priorityReason: '最もリクエストの多い機能' },
      { action: 'リアルタイム通知の実装', whyImportant: 'ユーザーのエンゲージメント維持', priorityReason: 'コラボレーションに重要' },
      { action: '認証フローのテスト作成', whyImportant: '認証バグはクリティカル', priorityReason: 'セキュリティ関連コードにはカバレッジが必要' },
    ],
    log2ActionBacklog: [{ action: 'ダークモード対応', whyImportant: 'ユーザーの好み', priorityReason: 'ローンチ時にはあると良い' }],
    log2Blockers: ['リアルタイム更新にWebSocketかSSEか決定が必要'],
    log2Constraints: ['TypeScript strictモード', 'モバイルブラウザ対応必須'],
    log2Decisions: [
      { decision: 'JWTではなくセッションベース認証を採用', rationale: 'サーバーレンダリングページはCookieとの相性が良い' },
      { decision: 'サーバー状態管理にReact Queryを採用', rationale: 'キャッシュと再フェッチを自動処理' },
    ],
    log2ResumeContext: ['mainから最新をpull', 'src/components/のダッシュボードコンポーネントを確認'],
    log2ResumeChecklist: [{ action: '認証ミドルウェアのレビュー', whyNow: '実装直後、検証が必要', ifSkipped: 'セキュリティギャップのリスク' }],
    log2Meta: { sessionFocus: 'ダッシュボードと認証の構築', whyThisSession: '最も優先度の高い2機能', timePressure: 'ローンチまで3週間' },
    todos: [
      { title: 'タスク並べ替えのドラッグ&ドロップ追加', priority: 'high' },
      { title: 'リアルタイム通知の実装', priority: 'medium' },
      { title: '認証フローのテスト作成', priority: 'high' },
      { title: 'ダークモード対応', priority: 'low' },
    ],
    masterOverview: 'ReactとTypeScriptで構築されたタスク管理アプリケーション。コアアーキテクチャが完成し、メインUI機能の実装が進行中。認証は動作しており、ダッシュボードも形になってきている。',
    masterDecisions: [
      'Next.jsの代わりにViteを使用 — SPAで十分、SSR不要',
      'データベースにPostgreSQLを採用 — 構造化データに最適なリレーショナルDB',
      'JWTではなくセッションベース認証 — サーバーレンダリングページはCookieとの相性が良い',
      'サーバー状態管理にReact Query — キャッシュと再フェッチを自動処理',
    ],
    masterOpenIssues: ['リアルタイム更新にWebSocketかSSEか決定が必要'],
    masterNextActions: ['タスク並べ替えのドラッグ&ドロップ追加', 'リアルタイム通知の実装', '認証フローのテスト作成'],
  },
  es: {
    projectName: 'Mi Proyecto de IA',
    log1Title: 'Configuración del Proyecto y Arquitectura Base',
    log1Tags: ['configuración', 'arquitectura', 'React', 'TypeScript'],
    log1CurrentStatus: ['Estructura del proyecto completa con React + TypeScript', 'Esquema de base de datos diseñado y tablas creadas', 'Estructura básica de carpetas establecida'],
    log1Completed: ['Configuración del proyecto Vite + React-TS', 'Diseño del esquema de base de datos (users, tasks, projects)', 'Configuración de ESLint y TypeScript strict mode'],
    log1NextActions: ['Construir la UI principal del dashboard', 'Implementar autenticación de usuarios'],
    log1NextActionItems: [
      { action: 'Construir la UI principal del dashboard', whyImportant: 'Funcionalidad principal para el usuario', priorityReason: 'Necesario antes de cualquier otro trabajo de UI' },
      { action: 'Implementar autenticación de usuarios', whyImportant: 'Requerido para soporte multiusuario', priorityReason: 'Bloquea rutas protegidas' },
    ],
    log1Constraints: ['TypeScript strict mode', 'Debe soportar navegadores móviles'],
    log1Decisions: [{ decision: 'Usar Vite en lugar de Next.js', rationale: 'SPA es suficiente, no se necesita SSR' }, { decision: 'PostgreSQL para la base de datos', rationale: 'Mejor DB relacional para datos estructurados' }],
    log1ResumeContext: ['Revisar la configuración del proyecto en src/', 'Revisar esquema de base de datos'],
    log1ResumeChecklist: [{ action: 'Revisar esquema de base de datos', whyNow: 'Base para todas las funcionalidades', ifSkipped: 'Se podría construir sobre suposiciones incorrectas' }],
    log1Meta: { sessionFocus: 'Establecer la base del proyecto', whyThisSession: 'Se necesita una base sólida antes de construir funcionalidades', timePressure: 'Lanzamiento en 4 semanas' },
    log2Title: 'Dashboard UI y Autenticación',
    log2Tags: ['UI', 'autenticación', 'React', 'dashboard'],
    log2CurrentStatus: ['El diseño del dashboard es funcional con tarjetas de tareas', 'El flujo de autenticación funciona (login, registro, logout)', 'Las rutas protegidas están configuradas'],
    log2Completed: ['Dashboard construido con lista de tareas y barra lateral', 'Autenticación por email/contraseña implementada', 'Middleware de rutas protegidas añadido', 'Barra de navegación responsive creada'],
    log2NextActions: ['Añadir drag-and-drop para reordenar tareas', 'Implementar notificaciones en tiempo real', 'Escribir tests para el flujo de autenticación'],
    log2NextActionItems: [
      { action: 'Añadir drag-and-drop para reordenar tareas', whyImportant: 'Función UX clave que los usuarios esperan', priorityReason: 'Función más solicitada' },
      { action: 'Implementar notificaciones en tiempo real', whyImportant: 'Mantiene a los usuarios comprometidos', priorityReason: 'Importante para la colaboración' },
      { action: 'Escribir tests para el flujo de autenticación', whyImportant: 'Los bugs de autenticación son críticos', priorityReason: 'El código sensible necesita cobertura' },
    ],
    log2ActionBacklog: [{ action: 'Añadir soporte para modo oscuro', whyImportant: 'Preferencia del usuario', priorityReason: 'Deseable para el lanzamiento' }],
    log2Blockers: ['Decidir entre WebSocket o SSE para actualizaciones en tiempo real'],
    log2Constraints: ['TypeScript strict mode', 'Debe soportar navegadores móviles'],
    log2Decisions: [{ decision: 'Usar autenticación basada en sesiones en lugar de JWT', rationale: 'Las páginas renderizadas en servidor funcionan mejor con cookies' }, { decision: 'React Query para el estado del servidor', rationale: 'Maneja caché y refetching automáticamente' }],
    log2ResumeContext: ['Pull del último código de main', 'Revisar componentes del dashboard en src/components/'],
    log2ResumeChecklist: [{ action: 'Revisar el middleware de autenticación', whyNow: 'Recién implementado, necesita verificación', ifSkipped: 'Podría tener brechas de seguridad' }],
    log2Meta: { sessionFocus: 'Construir el dashboard y la autenticación', whyThisSession: 'Son las dos funcionalidades de mayor prioridad', timePressure: 'Lanzamiento en 3 semanas' },
    todos: [{ title: 'Añadir drag-and-drop para reordenar tareas', priority: 'high' }, { title: 'Implementar notificaciones en tiempo real', priority: 'medium' }, { title: 'Escribir tests para el flujo de autenticación', priority: 'high' }, { title: 'Añadir soporte para modo oscuro', priority: 'low' }],
    masterOverview: 'Una aplicación de gestión de tareas construida con React y TypeScript. El proyecto está en desarrollo activo con la arquitectura base completa y las principales funcionalidades de UI en implementación.',
    masterDecisions: ['Usar Vite en lugar de Next.js — SPA es suficiente', 'PostgreSQL para la base de datos — mejor DB relacional', 'Autenticación basada en sesiones — mejor con cookies', 'React Query para estado del servidor — caché automático'],
    masterOpenIssues: ['Decidir entre WebSocket o SSE para actualizaciones en tiempo real'],
    masterNextActions: ['Añadir drag-and-drop para reordenar tareas', 'Implementar notificaciones en tiempo real', 'Escribir tests para el flujo de autenticación'],
  },
};

// For languages without full translations, fall back to English
function getContent(lang: Lang): SampleContent {
  return content[lang] || content.en;
}

// ── Seed function ──────────────────────────────────────────────

export function seedSampleData(lang: Lang = 'en'): void {
  if (isSampleSeeded()) return;

  const c = getContent(lang);

  const project = addProject(c.projectName);
  project.pinned = true;
  project.icon = '🚀';
  const projects = JSON.parse(localStorage.getItem('threadlog_projects') || '[]');
  const idx = projects.findIndex((p: { id: string }) => p.id === project.id);
  if (idx >= 0) { projects[idx] = project; localStorage.setItem('threadlog_projects', JSON.stringify(projects)); }

  const now = Date.now();
  const logId1 = crypto.randomUUID();
  const logId2 = crypto.randomUUID();

  const log1: LogEntry = {
    id: logId1,
    createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    title: c.log1Title,
    projectId: project.id,
    outputMode: 'handoff',
    today: [],
    decisions: [],
    todo: [],
    relatedProjects: [],
    tags: c.log1Tags,
    currentStatus: c.log1CurrentStatus,
    completed: c.log1Completed,
    nextActions: c.log1NextActions,
    nextActionItems: c.log1NextActionItems,
    actionBacklog: [],
    blockers: [],
    constraints: c.log1Constraints,
    decisionRationales: c.log1Decisions,
    resumeContext: c.log1ResumeContext,
    resumeChecklist: c.log1ResumeChecklist,
    handoffMeta: c.log1Meta,
  };

  const log2: LogEntry = {
    id: logId2,
    createdAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
    title: c.log2Title,
    projectId: project.id,
    outputMode: 'handoff',
    today: [],
    decisions: [],
    todo: [],
    relatedProjects: [],
    tags: c.log2Tags,
    currentStatus: c.log2CurrentStatus,
    completed: c.log2Completed,
    nextActions: c.log2NextActions,
    nextActionItems: c.log2NextActionItems,
    actionBacklog: c.log2ActionBacklog,
    blockers: c.log2Blockers,
    constraints: c.log2Constraints,
    decisionRationales: c.log2Decisions,
    resumeContext: c.log2ResumeContext,
    resumeChecklist: c.log2ResumeChecklist,
    handoffMeta: c.log2Meta,
  };

  addLog(log1);
  addLog(log2);

  addTodosFromLogWithMeta(logId2, c.todos);

  const masterNote: MasterNote = {
    id: crypto.randomUUID(),
    projectId: project.id,
    overview: c.masterOverview,
    currentStatus: '',
    decisions: c.masterDecisions.map((text, i) => ({ text, sourceLogIds: [i < 2 ? logId1 : logId2] })),
    openIssues: c.masterOpenIssues.map((text) => ({ text, sourceLogIds: [logId2] })),
    nextActions: c.masterNextActions.map((text) => ({ text, sourceLogIds: [logId2] })),
    relatedLogIds: [logId1, logId2],
    updatedAt: now,
  };

  saveMasterNote(masterNote);
  markSampleSeeded();
}
