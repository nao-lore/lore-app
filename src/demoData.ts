/**
 * Pre-generated transform results for Demo Mode.
 * Used when no API key is set — lets users experience the full app flow.
 */
import type { HandoffResult, TransformResult, BothResult } from './types';
import type { TodoOnlyResult, TodoOnlyItem } from './transform';
import type { Lang } from './i18n';

// ── Demo conversation (shown pre-filled in textarea) ──

const DEMO_CONVERSATIONS: Partial<Record<Lang, string>> = {
  en: `User: I want to build a task management app with React and TypeScript.
Assistant: Great choice! Should we start with the project setup?
User: Yes, let's use Vite. I decided to go with Vite instead of Next.js since we don't need SSR.
Assistant: Makes sense for an SPA. I'll set up the project structure.
User: I've finished the initial setup. ESLint and TypeScript strict mode are configured.
User: Next I need to design the database schema. I'll use PostgreSQL.
Assistant: Here's a suggested schema with users, tasks, and projects tables.
User: Looks good. I created the tables. The schema is done.
User: Tomorrow I'll start building the dashboard UI. That's the highest priority.
User: I also need to implement auth eventually, but dashboard first.`,
  ja: `User: ReactとTypeScriptでタスク管理アプリを作りたい。
Assistant: いい選択ですね！プロジェクトのセットアップから始めましょうか？
User: うん、Viteを使おう。SSR不要だからNext.jsじゃなくてViteでいく。
Assistant: SPAには合理的ですね。プロジェクト構成を作りましょう。
User: 初期セットアップ完了した。ESLintとTypeScript strictモードも設定済み。
User: 次はデータベーススキーマの設計が必要。PostgreSQLを使う。
Assistant: users、tasks、projectsテーブルを含むスキーマを提案します。
User: いいね。テーブル作成した。スキーマは完成。
User: 明日からダッシュボードUIの構築に入る。最優先。
User: 認証もそのうち実装するけど、ダッシュボードが先。`,
};

export function getDemoConversation(lang: Lang): string {
  return DEMO_CONVERSATIONS[lang] || DEMO_CONVERSATIONS.en!;
}

// ── Demo results ──

interface DemoResults {
  handoff: HandoffResult;
  worklog: TransformResult;
  todos: TodoOnlyItem[];
}

const DEMO_RESULTS: Partial<Record<Lang, DemoResults>> = {
  en: {
    handoff: {
      title: 'Task App Setup & DB Schema',
      handoffMeta: {
        sessionFocus: 'Setting up the project foundation and database',
        whyThisSession: 'Need a solid architecture before building features',
        timePressure: 'Dashboard UI is the highest priority for next session',
      },
      currentStatus: [
        'Vite + React-TS project scaffolding is complete',
        'PostgreSQL database schema is designed and tables are created',
        'ESLint and TypeScript strict mode are configured',
        'Dashboard UI is not yet started',
      ],
      resumeChecklist: [
        { action: 'Verify database tables are correctly created', whyNow: 'Foundation for dashboard data fetching', ifSkipped: 'Dashboard may fail to load data' },
        { action: 'Review project folder structure', whyNow: 'Need to know where to add dashboard components', ifSkipped: 'May create files in wrong locations' },
      ],
      resumeContext: ['Verify database tables are correctly created', 'Review project folder structure'],
      nextActions: ['Build the main dashboard UI'],
      nextActionItems: [
        { action: 'Build the main dashboard UI', whyImportant: 'Highest priority user-facing feature', priorityReason: 'Explicitly stated as highest priority', dueBy: 'tomorrow', dependsOn: null },
      ],
      actionBacklog: [
        { action: 'Implement user authentication', whyImportant: 'Required for multi-user support', priorityReason: 'After dashboard is done', dueBy: null, dependsOn: ['Dashboard UI'] },
      ],
      completed: [
        'Set up Vite + React-TS project',
        'Configured ESLint and TypeScript strict mode',
        'Designed and created PostgreSQL database schema (users, tasks, projects)',
      ],
      blockers: [],
      decisions: ['Use Vite instead of Next.js', 'PostgreSQL for database'],
      decisionRationales: [
        { decision: 'Use Vite instead of Next.js', rationale: 'SPA is sufficient, no SSR needed' },
        { decision: 'PostgreSQL for database', rationale: 'Best fit for structured relational data' },
      ],
      constraints: ['TypeScript strict mode'],
      tags: ['setup', 'architecture', 'React', 'TypeScript', 'PostgreSQL'],
    },
    worklog: {
      title: 'Task App Setup & DB Schema',
      today: [
        'Set up Vite + React-TS project',
        'Configured ESLint and TypeScript strict mode',
        'Designed and created PostgreSQL database schema',
      ],
      decisions: ['Use Vite instead of Next.js — SSR not needed', 'PostgreSQL for the database'],
      todo: ['Build the main dashboard UI', 'Implement user authentication'],
      relatedProjects: [],
      tags: ['setup', 'architecture', 'React', 'TypeScript', 'PostgreSQL'],
    },
    todos: [
      { title: 'Build the main dashboard UI', priority: 'high', dueDate: undefined },
      { title: 'Implement user authentication', priority: 'medium', dueDate: undefined },
    ],
  },
  ja: {
    handoff: {
      title: 'タスクアプリ初期構築とDB設計',
      handoffMeta: {
        sessionFocus: 'プロジェクト基盤とデータベースの構築',
        whyThisSession: '機能開発の前に堅固なアーキテクチャが必要',
        timePressure: '次セッションではダッシュボードUIが最優先',
      },
      currentStatus: [
        'Vite + React-TSプロジェクトの雛形が完成',
        'PostgreSQLスキーマ設計済み、テーブル作成完了',
        'ESLintとTypeScript strictモード設定済み',
        'ダッシュボードUIは未着手',
      ],
      resumeChecklist: [
        { action: 'データベーステーブルの作成状況を確認', whyNow: 'ダッシュボードのデータ取得の基盤', ifSkipped: 'ダッシュボードでデータ読み込みが失敗する可能性' },
        { action: 'プロジェクトのフォルダ構成を確認', whyNow: 'ダッシュボードコンポーネントの配置場所を把握', ifSkipped: '間違った場所にファイルを作成するリスク' },
      ],
      resumeContext: ['データベーステーブルの作成状況を確認', 'プロジェクトのフォルダ構成を確認'],
      nextActions: ['メインダッシュボードUIの構築'],
      nextActionItems: [
        { action: 'メインダッシュボードUIの構築', whyImportant: '最優先のユーザー向け機能', priorityReason: '明確に最優先と宣言', dueBy: '明日', dependsOn: null },
      ],
      actionBacklog: [
        { action: 'ユーザー認証の実装', whyImportant: 'マルチユーザー対応に必要', priorityReason: 'ダッシュボード完了後', dueBy: null, dependsOn: ['ダッシュボードUI'] },
      ],
      completed: [
        'Vite + React-TSプロジェクトのセットアップ',
        'ESLintとTypeScript strictモードの設定',
        'PostgreSQLスキーマ設計・テーブル作成（users, tasks, projects）',
      ],
      blockers: [],
      decisions: ['Next.jsの代わりにViteを使用', 'データベースにPostgreSQLを採用'],
      decisionRationales: [
        { decision: 'Next.jsの代わりにViteを使用', rationale: 'SPAで十分、SSR不要' },
        { decision: 'データベースにPostgreSQLを採用', rationale: '構造化データに最適なリレーショナルDB' },
      ],
      constraints: ['TypeScript strictモード'],
      tags: ['セットアップ', 'アーキテクチャ', 'React', 'TypeScript', 'PostgreSQL'],
    },
    worklog: {
      title: 'タスクアプリ初期構築とDB設計',
      today: [
        'Vite + React-TSプロジェクトのセットアップ',
        'ESLintとTypeScript strictモードの設定',
        'PostgreSQLスキーマ設計・テーブル作成',
      ],
      decisions: ['Next.jsの代わりにViteを使用 — SSR不要', 'データベースにPostgreSQLを採用'],
      todo: ['メインダッシュボードUIの構築', 'ユーザー認証の実装'],
      relatedProjects: [],
      tags: ['セットアップ', 'アーキテクチャ', 'React', 'TypeScript', 'PostgreSQL'],
    },
    todos: [
      { title: 'メインダッシュボードUIの構築', priority: 'high', dueDate: undefined },
      { title: 'ユーザー認証の実装', priority: 'medium', dueDate: undefined },
    ],
  },
};

function getDemoResults(lang: Lang): DemoResults {
  return DEMO_RESULTS[lang] || DEMO_RESULTS.en!;
}

/** Simulate API delay for realistic feel */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function demoTransformHandoff(lang: Lang): Promise<HandoffResult> {
  await delay(1200 + Math.random() * 800);
  return { ...getDemoResults(lang).handoff };
}

export async function demoTransformText(lang: Lang): Promise<TransformResult> {
  await delay(1000 + Math.random() * 600);
  return { ...getDemoResults(lang).worklog };
}

export async function demoTransformBoth(lang: Lang): Promise<BothResult> {
  await delay(1500 + Math.random() * 1000);
  const r = getDemoResults(lang);
  return { worklog: { ...r.worklog }, handoff: { ...r.handoff } };
}

export async function demoTransformTodoOnly(lang: Lang): Promise<TodoOnlyResult> {
  await delay(800 + Math.random() * 400);
  return { todos: [...getDemoResults(lang).todos] };
}

export async function demoTransformHandoffTodo(lang: Lang): Promise<{ handoff: HandoffResult; todos: TodoOnlyItem[] }> {
  await delay(1500 + Math.random() * 1000);
  const r = getDemoResults(lang);
  return { handoff: { ...r.handoff }, todos: [...r.todos] };
}
