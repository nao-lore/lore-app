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
  fr: {
    projectName: 'Mon Projet IA',
    log1Title: 'Mise en place du projet et architecture de base',
    log1Tags: ['configuration', 'architecture', 'React', 'TypeScript'],
    log1CurrentStatus: [
      'Structure du projet terminée avec React + TypeScript',
      'Schéma de base de données conçu et tables créées',
      'Arborescence de dossiers de base établie',
    ],
    log1Completed: [
      'Mise en place du projet Vite + React-TS',
      'Conception du schéma de base de données (users, tasks, projects)',
      'Configuration d\'ESLint et du mode strict TypeScript',
    ],
    log1NextActions: ['Construire l\'interface du tableau de bord principal', 'Implémenter l\'authentification des utilisateurs'],
    log1NextActionItems: [
      { action: 'Construire l\'interface du tableau de bord principal', whyImportant: 'Fonctionnalité principale côté utilisateur', priorityReason: 'Nécessaire avant tout autre travail d\'interface' },
      { action: 'Implémenter l\'authentification des utilisateurs', whyImportant: 'Requis pour le support multi-utilisateurs', priorityReason: 'Bloque les routes protégées' },
    ],
    log1Constraints: ['TypeScript strict mode', 'Doit supporter les navigateurs mobiles'],
    log1Decisions: [
      { decision: 'Utiliser Vite au lieu de Next.js', rationale: 'Une SPA suffit, pas besoin de SSR' },
      { decision: 'PostgreSQL pour la base de données', rationale: 'Meilleure base relationnelle pour les données structurées' },
    ],
    log1ResumeContext: ['Vérifier la configuration du projet dans src/', 'Revoir le schéma de base de données'],
    log1ResumeChecklist: [{ action: 'Revoir le schéma de base de données', whyNow: 'Fondation de toutes les fonctionnalités', ifSkipped: 'Risque de construire sur de mauvaises hypothèses' }],
    log1Meta: { sessionFocus: 'Mise en place des fondations du projet', whyThisSession: 'Une base solide est nécessaire avant de développer les fonctionnalités', timePressure: 'Lancement prévu dans 4 semaines' },
    log2Title: 'Interface du tableau de bord et authentification',
    log2Tags: ['UI', 'authentification', 'React', 'tableau de bord'],
    log2CurrentStatus: [
      'La mise en page du tableau de bord est fonctionnelle avec des cartes de tâches',
      'Le flux d\'authentification fonctionne (connexion, inscription, déconnexion)',
      'Les routes protégées sont configurées',
    ],
    log2Completed: [
      'Tableau de bord construit avec liste de tâches et barre latérale',
      'Authentification par email/mot de passe implémentée',
      'Middleware de routes protégées ajouté',
      'Barre de navigation responsive créée',
    ],
    log2NextActions: ['Ajouter le glisser-déposer pour réorganiser les tâches', 'Implémenter les notifications en temps réel', 'Écrire des tests pour le flux d\'authentification'],
    log2NextActionItems: [
      { action: 'Ajouter le glisser-déposer pour réorganiser les tâches', whyImportant: 'Fonctionnalité UX clé attendue par les utilisateurs', priorityReason: 'Fonctionnalité la plus demandée' },
      { action: 'Implémenter les notifications en temps réel', whyImportant: 'Maintient l\'engagement des utilisateurs', priorityReason: 'Important pour la collaboration' },
      { action: 'Écrire des tests pour le flux d\'authentification', whyImportant: 'Les bugs d\'authentification sont critiques', priorityReason: 'Le code sensible nécessite une couverture de tests' },
    ],
    log2ActionBacklog: [{ action: 'Ajouter le support du mode sombre', whyImportant: 'Préférence utilisateur', priorityReason: 'Souhaitable pour le lancement' }],
    log2Blockers: ['Décider entre WebSocket ou SSE pour les mises à jour en temps réel'],
    log2Constraints: ['TypeScript strict mode', 'Doit supporter les navigateurs mobiles'],
    log2Decisions: [
      { decision: 'Utiliser l\'authentification par session plutôt que JWT', rationale: 'Les pages rendues côté serveur fonctionnent mieux avec les cookies' },
      { decision: 'React Query pour l\'état serveur', rationale: 'Gère le cache et le rafraîchissement automatiquement' },
    ],
    log2ResumeContext: ['Récupérer la dernière version depuis main', 'Vérifier les composants du tableau de bord dans src/components/'],
    log2ResumeChecklist: [{ action: 'Revoir le middleware d\'authentification', whyNow: 'Fraîchement implémenté, nécessite vérification', ifSkipped: 'Risque de failles de sécurité' }],
    log2Meta: { sessionFocus: 'Construction du tableau de bord et de l\'authentification', whyThisSession: 'Ce sont les deux fonctionnalités les plus prioritaires', timePressure: 'Lancement dans 3 semaines' },
    todos: [
      { title: 'Ajouter le glisser-déposer pour réorganiser les tâches', priority: 'high' },
      { title: 'Implémenter les notifications en temps réel', priority: 'medium' },
      { title: 'Écrire des tests pour le flux d\'authentification', priority: 'high' },
      { title: 'Ajouter le support du mode sombre', priority: 'low' },
    ],
    masterOverview: 'Une application de gestion de tâches construite avec React et TypeScript. Le projet est en développement actif, l\'architecture de base est terminée et les principales fonctionnalités d\'interface sont en cours d\'implémentation. L\'authentification est fonctionnelle et le tableau de bord prend forme.',
    masterDecisions: [
      'Utiliser Vite au lieu de Next.js — une SPA suffit, pas besoin de SSR',
      'PostgreSQL pour la base de données — meilleure base relationnelle pour les données structurées',
      'Authentification par session plutôt que JWT — fonctionne mieux avec les cookies',
      'React Query pour l\'état serveur — gère le cache et le rafraîchissement automatiquement',
    ],
    masterOpenIssues: ['Décider entre WebSocket ou SSE pour les mises à jour en temps réel'],
    masterNextActions: ['Ajouter le glisser-déposer pour réorganiser les tâches', 'Implémenter les notifications en temps réel', 'Écrire des tests pour le flux d\'authentification'],
  },
  de: {
    projectName: 'Mein KI-Projekt',
    log1Title: 'Projekteinrichtung und Kernarchitektur',
    log1Tags: ['Einrichtung', 'Architektur', 'React', 'TypeScript'],
    log1CurrentStatus: [
      'Projektgerüst mit React + TypeScript fertiggestellt',
      'Datenbankschema entworfen und Tabellen erstellt',
      'Grundlegende Ordnerstruktur eingerichtet',
    ],
    log1Completed: [
      'Vite + React-TS-Projekt eingerichtet',
      'Datenbankschema entworfen (users, tasks, projects)',
      'ESLint und TypeScript Strict Mode konfiguriert',
    ],
    log1NextActions: ['Haupt-Dashboard-Oberfläche erstellen', 'Benutzerauthentifizierung implementieren'],
    log1NextActionItems: [
      { action: 'Haupt-Dashboard-Oberfläche erstellen', whyImportant: 'Zentrale benutzerseitige Funktion', priorityReason: 'Muss vor allen anderen UI-Arbeiten erledigt werden' },
      { action: 'Benutzerauthentifizierung implementieren', whyImportant: 'Erforderlich für Mehrbenutzer-Unterstützung', priorityReason: 'Blockiert geschützte Routen' },
    ],
    log1Constraints: ['TypeScript Strict Mode', 'Muss mobile Browser unterstützen'],
    log1Decisions: [
      { decision: 'Vite statt Next.js verwenden', rationale: 'SPA reicht aus, kein SSR nötig' },
      { decision: 'PostgreSQL als Datenbank', rationale: 'Beste relationale Datenbank für strukturierte Daten' },
    ],
    log1ResumeContext: ['Projekteinrichtung in src/ überprüfen', 'Datenbankschema überprüfen'],
    log1ResumeChecklist: [{ action: 'Datenbankschema überprüfen', whyNow: 'Grundlage aller Funktionen', ifSkipped: 'Könnte auf falschen Annahmen aufbauen' }],
    log1Meta: { sessionFocus: 'Projektfundament einrichten', whyThisSession: 'Solide Basis nötig, bevor Funktionen entwickelt werden', timePressure: 'Launch-Ziel in 4 Wochen' },
    log2Title: 'Dashboard-Oberfläche und Authentifizierung',
    log2Tags: ['UI', 'Authentifizierung', 'React', 'Dashboard'],
    log2CurrentStatus: [
      'Dashboard-Layout mit Aufgabenkarten ist funktionsfähig',
      'Authentifizierungsablauf funktioniert (Anmeldung, Registrierung, Abmeldung)',
      'Geschützte Routen sind konfiguriert',
    ],
    log2Completed: [
      'Dashboard mit Aufgabenliste und Seitenleiste erstellt',
      'E-Mail-/Passwort-Authentifizierung implementiert',
      'Middleware für geschützte Routen hinzugefügt',
      'Responsive Navigationsleiste erstellt',
    ],
    log2NextActions: ['Drag-and-Drop zum Neuordnen von Aufgaben hinzufügen', 'Echtzeit-Benachrichtigungen implementieren', 'Tests für den Authentifizierungsablauf schreiben'],
    log2NextActionItems: [
      { action: 'Drag-and-Drop zum Neuordnen von Aufgaben hinzufügen', whyImportant: 'Wichtige UX-Funktion, die Benutzer erwarten', priorityReason: 'Am häufigsten gewünschte Funktion' },
      { action: 'Echtzeit-Benachrichtigungen implementieren', whyImportant: 'Hält Benutzer engagiert', priorityReason: 'Wichtig für die Zusammenarbeit' },
      { action: 'Tests für den Authentifizierungsablauf schreiben', whyImportant: 'Authentifizierungsfehler sind kritisch', priorityReason: 'Sicherheitsrelevanter Code braucht Testabdeckung' },
    ],
    log2ActionBacklog: [{ action: 'Dark-Mode-Unterstützung hinzufügen', whyImportant: 'Benutzerpräferenz', priorityReason: 'Wünschenswert für den Launch' }],
    log2Blockers: ['Entscheidung zwischen WebSocket oder SSE für Echtzeit-Updates nötig'],
    log2Constraints: ['TypeScript Strict Mode', 'Muss mobile Browser unterstützen'],
    log2Decisions: [
      { decision: 'Sitzungsbasierte Authentifizierung statt JWT', rationale: 'Serverseitig gerenderte Seiten funktionieren besser mit Cookies' },
      { decision: 'React Query für den Server-State', rationale: 'Verwaltet Caching und Neuladen automatisch' },
    ],
    log2ResumeContext: ['Neuesten Stand von main pullen', 'Dashboard-Komponenten in src/components/ überprüfen'],
    log2ResumeChecklist: [{ action: 'Authentifizierungs-Middleware überprüfen', whyNow: 'Gerade implementiert, muss verifiziert werden', ifSkipped: 'Könnte Sicherheitslücken haben' }],
    log2Meta: { sessionFocus: 'Dashboard und Authentifizierung erstellen', whyThisSession: 'Die zwei Funktionen mit höchster Priorität', timePressure: 'Launch in 3 Wochen' },
    todos: [
      { title: 'Drag-and-Drop zum Neuordnen von Aufgaben hinzufügen', priority: 'high' },
      { title: 'Echtzeit-Benachrichtigungen implementieren', priority: 'medium' },
      { title: 'Tests für den Authentifizierungsablauf schreiben', priority: 'high' },
      { title: 'Dark-Mode-Unterstützung hinzufügen', priority: 'low' },
    ],
    masterOverview: 'Eine Aufgabenverwaltungsanwendung, erstellt mit React und TypeScript. Das Projekt befindet sich in aktiver Entwicklung, die Kernarchitektur ist fertig und die wichtigsten UI-Funktionen werden implementiert. Die Authentifizierung ist funktionsfähig und das Dashboard nimmt Gestalt an.',
    masterDecisions: [
      'Vite statt Next.js — SPA reicht aus, kein SSR nötig',
      'PostgreSQL als Datenbank — beste relationale DB für strukturierte Daten',
      'Sitzungsbasierte Authentifizierung statt JWT — funktioniert besser mit Cookies',
      'React Query für Server-State — verwaltet Caching und Neuladen automatisch',
    ],
    masterOpenIssues: ['Entscheidung zwischen WebSocket oder SSE für Echtzeit-Updates nötig'],
    masterNextActions: ['Drag-and-Drop zum Neuordnen von Aufgaben hinzufügen', 'Echtzeit-Benachrichtigungen implementieren', 'Tests für den Authentifizierungsablauf schreiben'],
  },
  zh: {
    projectName: '我的AI项目',
    log1Title: '项目搭建与核心架构',
    log1Tags: ['搭建', '架构', 'React', 'TypeScript'],
    log1CurrentStatus: [
      '使用 React + TypeScript 完成项目脚手架',
      '数据库模式已设计，表已创建',
      '基本文件夹结构已建立',
    ],
    log1Completed: [
      '搭建 Vite + React-TS 项目',
      '设计数据库模式（users、tasks、projects）',
      '配置 ESLint 和 TypeScript strict mode',
    ],
    log1NextActions: ['构建主仪表盘界面', '实现用户认证'],
    log1NextActionItems: [
      { action: '构建主仪表盘界面', whyImportant: '面向用户的核心功能', priorityReason: '在其他界面工作之前必须完成' },
      { action: '实现用户认证', whyImportant: '多用户支持的必要条件', priorityReason: '阻塞受保护路由' },
    ],
    log1Constraints: ['TypeScript strict mode', '必须支持移动端浏览器'],
    log1Decisions: [
      { decision: '使用 Vite 而非 Next.js', rationale: 'SPA 已够用，无需 SSR' },
      { decision: '数据库选用 PostgreSQL', rationale: '结构化数据的最佳关系型数据库' },
    ],
    log1ResumeContext: ['检查 src/ 中的项目配置', '审查数据库模式'],
    log1ResumeChecklist: [{ action: '审查数据库模式', whyNow: '所有功能的基础', ifSkipped: '可能基于错误的假设进行开发' }],
    log1Meta: { sessionFocus: '搭建项目基础', whyThisSession: '在开发功能之前需要牢固的基础', timePressure: '4周后发布' },
    log2Title: '仪表盘界面与认证',
    log2Tags: ['UI', '认证', 'React', '仪表盘'],
    log2CurrentStatus: [
      '仪表盘布局已可用，包含任务卡片',
      '认证流程正常运行（登录、注册、登出）',
      '受保护路由已配置',
    ],
    log2Completed: [
      '构建了包含任务列表和侧边栏的仪表盘',
      '实现了邮箱/密码认证',
      '添加了受保护路由中间件',
      '创建了响应式导航栏',
    ],
    log2NextActions: ['添加拖拽排序任务功能', '实现实时通知', '为认证流程编写测试'],
    log2NextActionItems: [
      { action: '添加拖拽排序任务功能', whyImportant: '用户期望的关键体验功能', priorityReason: '需求最多的功能' },
      { action: '实现实时通知', whyImportant: '保持用户参与度', priorityReason: '对协作很重要' },
      { action: '为认证流程编写测试', whyImportant: '认证漏洞至关重要', priorityReason: '安全相关代码需要测试覆盖' },
    ],
    log2ActionBacklog: [{ action: '添加深色模式支持', whyImportant: '用户偏好', priorityReason: '发布时锦上添花' }],
    log2Blockers: ['需要决定实时更新使用 WebSocket 还是 SSE'],
    log2Constraints: ['TypeScript strict mode', '必须支持移动端浏览器'],
    log2Decisions: [
      { decision: '使用基于会话的认证而非 JWT', rationale: '服务端渲染页面配合 Cookie 效果更好' },
      { decision: '使用 React Query 管理服务端状态', rationale: '自动处理缓存和重新获取' },
    ],
    log2ResumeContext: ['从 main 拉取最新代码', '检查 src/components/ 中的仪表盘组件'],
    log2ResumeChecklist: [{ action: '审查认证中间件', whyNow: '刚实现，需要验证', ifSkipped: '可能存在安全隐患' }],
    log2Meta: { sessionFocus: '构建仪表盘和认证', whyThisSession: '这是优先级最高的两个功能', timePressure: '3周后发布' },
    todos: [
      { title: '添加拖拽排序任务功能', priority: 'high' },
      { title: '实现实时通知', priority: 'medium' },
      { title: '为认证流程编写测试', priority: 'high' },
      { title: '添加深色模式支持', priority: 'low' },
    ],
    masterOverview: '一个使用 React 和 TypeScript 构建的任务管理应用。项目正在积极开发中，核心架构已完成，主要界面功能正在实现。认证功能已可用，仪表盘逐渐成形。',
    masterDecisions: [
      '使用 Vite 而非 Next.js — SPA 已够用，无需 SSR',
      '数据库选用 PostgreSQL — 结构化数据的最佳关系型数据库',
      '基于会话的认证而非 JWT — 配合 Cookie 效果更好',
      'React Query 管理服务端状态 — 自动处理缓存和重新获取',
    ],
    masterOpenIssues: ['需要决定实时更新使用 WebSocket 还是 SSE'],
    masterNextActions: ['添加拖拽排序任务功能', '实现实时通知', '为认证流程编写测试'],
  },
  ko: {
    projectName: '나의 AI 프로젝트',
    log1Title: '프로젝트 설정 및 핵심 아키텍처',
    log1Tags: ['설정', '아키텍처', 'React', 'TypeScript'],
    log1CurrentStatus: [
      'React + TypeScript로 프로젝트 골격 완성',
      '데이터베이스 스키마 설계 및 테이블 생성 완료',
      '기본 폴더 구조 수립',
    ],
    log1Completed: [
      'Vite + React-TS 프로젝트 설정',
      '데이터베이스 스키마 설계 (users, tasks, projects)',
      'ESLint 및 TypeScript strict mode 설정',
    ],
    log1NextActions: ['메인 대시보드 UI 구축', '사용자 인증 구현'],
    log1NextActionItems: [
      { action: '메인 대시보드 UI 구축', whyImportant: '핵심 사용자 대면 기능', priorityReason: '다른 UI 작업 전에 필요' },
      { action: '사용자 인증 구현', whyImportant: '다중 사용자 지원에 필수', priorityReason: '보호된 라우트를 차단함' },
    ],
    log1Constraints: ['TypeScript strict mode', '모바일 브라우저 지원 필수'],
    log1Decisions: [
      { decision: 'Next.js 대신 Vite 사용', rationale: 'SPA로 충분하며 SSR 불필요' },
      { decision: '데이터베이스로 PostgreSQL 채택', rationale: '구조화된 데이터에 최적의 관계형 DB' },
    ],
    log1ResumeContext: ['src/의 프로젝트 설정 확인', '데이터베이스 스키마 검토'],
    log1ResumeChecklist: [{ action: '데이터베이스 스키마 검토', whyNow: '모든 기능의 기반', ifSkipped: '잘못된 가정 위에 구축할 위험' }],
    log1Meta: { sessionFocus: '프로젝트 기반 구축', whyThisSession: '기능 개발 전에 탄탄한 기반이 필요', timePressure: '출시 목표까지 4주' },
    log2Title: '대시보드 UI 및 인증',
    log2Tags: ['UI', '인증', 'React', '대시보드'],
    log2CurrentStatus: [
      '작업 카드가 포함된 대시보드 레이아웃 작동 중',
      '인증 흐름 정상 작동 (로그인, 회원가입, 로그아웃)',
      '보호된 라우트 설정 완료',
    ],
    log2Completed: [
      '작업 목록과 사이드바가 포함된 대시보드 구축',
      '이메일/비밀번호 인증 구현',
      '보호된 라우트 미들웨어 추가',
      '반응형 내비게이션 바 생성',
    ],
    log2NextActions: ['작업 재정렬을 위한 드래그 앤 드롭 추가', '실시간 알림 구현', '인증 흐름 테스트 작성'],
    log2NextActionItems: [
      { action: '작업 재정렬을 위한 드래그 앤 드롭 추가', whyImportant: '사용자가 기대하는 핵심 UX 기능', priorityReason: '가장 많이 요청된 기능' },
      { action: '실시간 알림 구현', whyImportant: '사용자 참여도 유지', priorityReason: '협업에 중요' },
      { action: '인증 흐름 테스트 작성', whyImportant: '인증 버그는 치명적', priorityReason: '보안 관련 코드에는 테스트 커버리지 필요' },
    ],
    log2ActionBacklog: [{ action: '다크 모드 지원 추가', whyImportant: '사용자 선호', priorityReason: '출시 시 있으면 좋음' }],
    log2Blockers: ['실시간 업데이트에 WebSocket과 SSE 중 선택 필요'],
    log2Constraints: ['TypeScript strict mode', '모바일 브라우저 지원 필수'],
    log2Decisions: [
      { decision: 'JWT 대신 세션 기반 인증 사용', rationale: '서버 렌더링 페이지는 Cookie와 더 잘 작동' },
      { decision: '서버 상태 관리에 React Query 사용', rationale: '캐싱과 재요청을 자동 처리' },
    ],
    log2ResumeContext: ['main에서 최신 코드 pull', 'src/components/의 대시보드 컴포넌트 확인'],
    log2ResumeChecklist: [{ action: '인증 미들웨어 검토', whyNow: '방금 구현되어 검증 필요', ifSkipped: '보안 취약점 발생 가능' }],
    log2Meta: { sessionFocus: '대시보드 및 인증 구축', whyThisSession: '가장 우선순위가 높은 두 기능', timePressure: '출시까지 3주' },
    todos: [
      { title: '작업 재정렬을 위한 드래그 앤 드롭 추가', priority: 'high' },
      { title: '실시간 알림 구현', priority: 'medium' },
      { title: '인증 흐름 테스트 작성', priority: 'high' },
      { title: '다크 모드 지원 추가', priority: 'low' },
    ],
    masterOverview: 'React와 TypeScript로 구축된 작업 관리 애플리케이션. 프로젝트는 활발히 개발 중이며 핵심 아키텍처가 완성되고 주요 UI 기능이 구현되고 있습니다. 인증이 작동하며 대시보드가 형태를 갖추고 있습니다.',
    masterDecisions: [
      'Next.js 대신 Vite 사용 — SPA로 충분하며 SSR 불필요',
      '데이터베이스로 PostgreSQL 채택 — 구조화된 데이터에 최적의 관계형 DB',
      'JWT 대신 세션 기반 인증 — Cookie와 더 잘 작동',
      '서버 상태 관리에 React Query — 캐싱과 재요청을 자동 처리',
    ],
    masterOpenIssues: ['실시간 업데이트에 WebSocket과 SSE 중 선택 필요'],
    masterNextActions: ['작업 재정렬을 위한 드래그 앤 드롭 추가', '실시간 알림 구현', '인증 흐름 테스트 작성'],
  },
  pt: {
    projectName: 'Meu Projeto de IA',
    log1Title: 'Configuração do Projeto e Arquitetura Base',
    log1Tags: ['configuração', 'arquitetura', 'React', 'TypeScript'],
    log1CurrentStatus: [
      'Estrutura do projeto completa com React + TypeScript',
      'Esquema do banco de dados projetado e tabelas criadas',
      'Estrutura básica de pastas estabelecida',
    ],
    log1Completed: [
      'Configuração do projeto Vite + React-TS',
      'Projeto do esquema do banco de dados (users, tasks, projects)',
      'Configuração do ESLint e TypeScript strict mode',
    ],
    log1NextActions: ['Construir a interface principal do painel', 'Implementar autenticação de usuários'],
    log1NextActionItems: [
      { action: 'Construir a interface principal do painel', whyImportant: 'Funcionalidade principal voltada ao usuário', priorityReason: 'Necessário antes de qualquer outro trabalho de interface' },
      { action: 'Implementar autenticação de usuários', whyImportant: 'Necessário para suporte multiusuário', priorityReason: 'Bloqueia rotas protegidas' },
    ],
    log1Constraints: ['TypeScript strict mode', 'Deve suportar navegadores móveis'],
    log1Decisions: [
      { decision: 'Usar Vite em vez de Next.js', rationale: 'SPA é suficiente, SSR não é necessário' },
      { decision: 'PostgreSQL para o banco de dados', rationale: 'Melhor banco relacional para dados estruturados' },
    ],
    log1ResumeContext: ['Verificar a configuração do projeto em src/', 'Revisar o esquema do banco de dados'],
    log1ResumeChecklist: [{ action: 'Revisar o esquema do banco de dados', whyNow: 'Base para todas as funcionalidades', ifSkipped: 'Pode construir sobre suposições incorretas' }],
    log1Meta: { sessionFocus: 'Estabelecer a base do projeto', whyThisSession: 'Uma base sólida é necessária antes de desenvolver funcionalidades', timePressure: 'Lançamento em 4 semanas' },
    log2Title: 'Interface do Painel e Autenticação',
    log2Tags: ['UI', 'autenticação', 'React', 'painel'],
    log2CurrentStatus: [
      'O layout do painel está funcional com cartões de tarefas',
      'O fluxo de autenticação funciona (login, cadastro, logout)',
      'As rotas protegidas estão configuradas',
    ],
    log2Completed: [
      'Painel construído com lista de tarefas e barra lateral',
      'Autenticação por email/senha implementada',
      'Middleware de rotas protegidas adicionado',
      'Barra de navegação responsiva criada',
    ],
    log2NextActions: ['Adicionar arrastar e soltar para reordenar tarefas', 'Implementar notificações em tempo real', 'Escrever testes para o fluxo de autenticação'],
    log2NextActionItems: [
      { action: 'Adicionar arrastar e soltar para reordenar tarefas', whyImportant: 'Recurso UX essencial esperado pelos usuários', priorityReason: 'Recurso mais solicitado' },
      { action: 'Implementar notificações em tempo real', whyImportant: 'Mantém os usuários engajados', priorityReason: 'Importante para a colaboração' },
      { action: 'Escrever testes para o fluxo de autenticação', whyImportant: 'Bugs de autenticação são críticos', priorityReason: 'Código sensível precisa de cobertura de testes' },
    ],
    log2ActionBacklog: [{ action: 'Adicionar suporte ao modo escuro', whyImportant: 'Preferência do usuário', priorityReason: 'Desejável para o lançamento' }],
    log2Blockers: ['Decidir entre WebSocket ou SSE para atualizações em tempo real'],
    log2Constraints: ['TypeScript strict mode', 'Deve suportar navegadores móveis'],
    log2Decisions: [
      { decision: 'Usar autenticação baseada em sessão em vez de JWT', rationale: 'Páginas renderizadas no servidor funcionam melhor com cookies' },
      { decision: 'React Query para o estado do servidor', rationale: 'Gerencia cache e recarregamento automaticamente' },
    ],
    log2ResumeContext: ['Puxar o código mais recente de main', 'Verificar os componentes do painel em src/components/'],
    log2ResumeChecklist: [{ action: 'Revisar o middleware de autenticação', whyNow: 'Recém-implementado, precisa de verificação', ifSkipped: 'Pode ter falhas de segurança' }],
    log2Meta: { sessionFocus: 'Construir o painel e a autenticação', whyThisSession: 'São as duas funcionalidades de maior prioridade', timePressure: 'Lançamento em 3 semanas' },
    todos: [
      { title: 'Adicionar arrastar e soltar para reordenar tarefas', priority: 'high' },
      { title: 'Implementar notificações em tempo real', priority: 'medium' },
      { title: 'Escrever testes para o fluxo de autenticação', priority: 'high' },
      { title: 'Adicionar suporte ao modo escuro', priority: 'low' },
    ],
    masterOverview: 'Uma aplicação de gerenciamento de tarefas construída com React e TypeScript. O projeto está em desenvolvimento ativo com a arquitetura base completa e as principais funcionalidades de interface sendo implementadas. A autenticação está funcional e o painel está tomando forma.',
    masterDecisions: [
      'Usar Vite em vez de Next.js — SPA é suficiente, SSR não é necessário',
      'PostgreSQL para o banco de dados — melhor banco relacional para dados estruturados',
      'Autenticação baseada em sessão em vez de JWT — funciona melhor com cookies',
      'React Query para o estado do servidor — gerencia cache e recarregamento automaticamente',
    ],
    masterOpenIssues: ['Decidir entre WebSocket ou SSE para atualizações em tempo real'],
    masterNextActions: ['Adicionar arrastar e soltar para reordenar tarefas', 'Implementar notificações em tempo real', 'Escrever testes para o fluxo de autenticação'],
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

  // ── Project 3: Marketer / Business persona ──────────────────
  const isJa3 = lang === 'ja';
  const project3 = addProject(isJa3 ? 'プロダクトローンチ戦略' : 'Product Launch Campaign');
  project3.icon = '📊';
  // pinned defaults to false — leave it unpinned
  const projects3 = JSON.parse(localStorage.getItem('threadlog_projects') || '[]');
  const idx3 = projects3.findIndex((p: { id: string }) => p.id === project3.id);
  if (idx3 >= 0) { projects3[idx3] = project3; localStorage.setItem('threadlog_projects', JSON.stringify(projects3)); }

  const logId3_1 = crypto.randomUUID();

  const log3_1: LogEntry = {
    id: logId3_1,
    createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
    title: isJa3 ? 'AI活用マーケティング戦略の策定' : 'AI-Assisted Marketing Strategy Session',
    projectId: project3.id,
    outputMode: 'handoff',
    today: [],
    decisions: [],
    todo: [],
    relatedProjects: [],
    tags: isJa3
      ? ['マーケティング', 'AI活用', '広告', 'ファネル']
      : ['marketing', 'AI', 'ad-copy', 'funnel'],
    currentStatus: isJa3
      ? [
          'ターゲットオーディエンスのペルソナ3パターンをAIで生成・検証済み',
          'Facebook/Instagram広告コピーのA/Bテスト案を5パターン作成',
          'ランディングページのファネル設計が初稿完了',
        ]
      : [
          'Generated and validated 3 target audience personas using AI',
          'Created 5 A/B test variations of Facebook/Instagram ad copy',
          'First draft of landing page funnel design is complete',
        ],
    completed: isJa3
      ? [
          'Claude を使って競合分析レポートを作成',
          'ペルソナごとの訴求軸とメッセージングフレームワークを整理',
          '広告コピー5案の生成とトーン調整',
        ]
      : [
          'Built competitive analysis report using Claude',
          'Organized messaging framework and appeal axes per persona',
          'Generated 5 ad copy drafts and adjusted tone for each',
        ],
    nextActions: isJa3
      ? ['ファネル各ステップのメールシーケンス設計', 'LP のワイヤーフレーム確定']
      : ['Design email sequence for each funnel step', 'Finalize landing page wireframe'],
    nextActionItems: isJa3
      ? [
          { action: 'ファネル各ステップのメールシーケンス設計', whyImportant: 'リード育成の自動化に必須', priorityReason: 'ローンチ日までに配信設定が必要' },
          { action: 'LP のワイヤーフレーム確定', whyImportant: '広告の遷移先がないとテスト開始できない', priorityReason: '広告出稿のブロッカー' },
        ]
      : [
          { action: 'Design email sequence for each funnel step', whyImportant: 'Essential for automated lead nurturing', priorityReason: 'Must be configured before launch day' },
          { action: 'Finalize landing page wireframe', whyImportant: 'Ads need a destination to start testing', priorityReason: 'Blocks ad deployment' },
        ],
    actionBacklog: [],
    blockers: [],
    constraints: isJa3
      ? ['広告予算は月50万円以内', 'ローンチまで2週間']
      : ['Monthly ad budget capped at $5,000', 'Two weeks until launch'],
    decisionRationales: isJa3
      ? [
          { decision: 'まず Facebook/Instagram 広告に集中', rationale: 'ターゲット層（30-45歳ビジネスパーソン）のリーチが最も高い' },
          { decision: 'AI で広告コピーを大量生成しA/Bテストで絞る', rationale: '少予算で最大効果を出すにはデータドリブンが不可欠' },
        ]
      : [
          { decision: 'Focus on Facebook/Instagram ads first', rationale: 'Highest reach for target demographic (30-45 business professionals)' },
          { decision: 'Use AI to bulk-generate ad copy and narrow down via A/B testing', rationale: 'Data-driven approach is essential to maximize ROI on a limited budget' },
        ],
    resumeContext: isJa3
      ? ['ペルソナ定義は docs/personas.md を参照', '広告コピー案は Spreadsheet の「Ad Copy v2」シートにまとめ済み']
      : ['See docs/personas.md for persona definitions', 'Ad copy drafts are in the "Ad Copy v2" tab of the shared spreadsheet'],
    resumeChecklist: isJa3
      ? [{ action: '広告コピー案のレビュー', whyNow: 'A/Bテスト開始前に最終チェック', ifSkipped: 'ブランドトーンと合わない広告が配信されるリスク' }]
      : [{ action: 'Review ad copy drafts', whyNow: 'Final check needed before A/B test launch', ifSkipped: 'Risk of running ads that don\'t match brand tone' }],
    handoffMeta: isJa3
      ? { sessionFocus: 'AIを活用した広告戦略とファネル設計', whyThisSession: 'ローンチ2週間前、広告とLPの方向性を固める必要あり', timePressure: 'ローンチまで2週間' }
      : { sessionFocus: 'AI-powered ad strategy and funnel design', whyThisSession: 'Two weeks before launch — need to lock down ad and LP direction', timePressure: 'Launch in 2 weeks' },
  };

  addLog(log3_1);

  // ── Project 4: YouTuber / Content Creator persona ──────────
  const isJa4 = lang === 'ja';
  const project4 = addProject(isJa4 ? 'YouTube チャンネル運営' : 'YouTube Channel Growth');
  project4.pinned = true;
  project4.icon = '🎬';
  const projects4 = JSON.parse(localStorage.getItem('threadlog_projects') || '[]');
  const idx4 = projects4.findIndex((p: { id: string }) => p.id === project4.id);
  if (idx4 >= 0) { projects4[idx4] = project4; localStorage.setItem('threadlog_projects', JSON.stringify(projects4)); }

  const logId4_1 = crypto.randomUUID();

  const log4_1: LogEntry = {
    id: logId4_1,
    createdAt: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
    title: isJa4 ? '動画企画 & AI活用プロダクション' : 'Video Planning & AI-Assisted Production',
    projectId: project4.id,
    outputMode: 'handoff',
    today: [],
    decisions: [],
    todo: [],
    relatedProjects: [],
    tags: isJa4
      ? ['YouTube', 'AI', '台本作成', 'SEO']
      : ['YouTube', 'AI', 'scripting', 'SEO'],
    currentStatus: isJa4
      ? [
          'AIと5つの動画トピックをブレストし、上位2つに絞り込み',
          '「使ってないAIツール」動画の台本ドラフトが80%完成',
          'AI画像生成プロンプトでサムネイルのコンセプトスケッチを作成',
        ]
      : [
          'Brainstormed 5 video topics with AI and narrowed down to top 2',
          'Draft script for "AI Tools You\'re Not Using" video is 80% done',
          'Thumbnail concept sketches generated using AI image prompts',
        ],
    completed: isJa4
      ? [
          'AIを使い次の3本分のキーワードリサーチを実施（検索ボリューム、競合度）',
          'AIとのコラボでフック・本編・CTAセクションを含むフル台本アウトラインを作成',
          'AIで4パターンのサムネイルを生成し、A/Bテスト用に2つを選定',
          'AIが提案したSEOキーワードでタイトルと説明文を最適化',
        ]
      : [
          'Generated keyword research for next 3 videos using AI (search volume, competition)',
          'Wrote full script outline with hook, body, and CTA sections via AI collaboration',
          'Created 4 thumbnail variations with AI — picked 2 finalists for A/B testing',
          'Optimized title and description with SEO keywords suggested by AI',
        ],
    nextActions: isJa4
      ? ['ドラフト台本のナレーション収録', 'コミュニティタブで2つのサムネイル候補をA/Bテスト', 'ショート動画転用のためトレンド音源をリサーチ']
      : ['Record voiceover for the drafted script', 'A/B test the two thumbnail finalists on Community tab', 'Research trending audio clips for Shorts repurposing'],
    nextActionItems: isJa4
      ? [
          { action: 'ドラフト台本のナレーション収録', whyImportant: '台本は完成済み、収録がボトルネック', priorityReason: '編集作業すべてのブロッカー' },
          { action: 'コミュニティタブでサムネイルA/Bテスト', whyImportant: 'サムネイルはクリック率の最重要要素', priorityReason: 'アップロード前に決定が必要' },
        ]
      : [
          { action: 'Record voiceover for the drafted script', whyImportant: 'Script is ready, recording is the bottleneck', priorityReason: 'Blocks all editing work' },
          { action: 'A/B test thumbnails via Community tab poll', whyImportant: 'Thumbnail is the #1 driver of click-through rate', priorityReason: 'Must decide before upload' },
        ],
    actionBacklog: isJa4
      ? [{ action: '定番動画フォーマット用のプロンプトテンプレート集を作成', whyImportant: '今後の台本作成セッションの時短', priorityReason: '効率化だが緊急ではない' }]
      : [{ action: 'Build a prompt template library for recurring video formats', whyImportant: 'Saves time on future scripting sessions', priorityReason: 'Efficiency gain but not urgent' }],
    blockers: isJa4
      ? ['新しいマイクの配達待ちで収録できない']
      : ['Waiting for new microphone delivery before recording'],
    constraints: isJa4
      ? ['視聴維持率のため動画は15分以内', 'アルゴリズム対策のためアップロード期限は土曜日']
      : ['Video must be under 15 minutes for optimal retention', 'Upload deadline is Saturday for algorithm consistency'],
    decisionRationales: isJa4
      ? [
          { decision: 'AIはフル台本ではなくアウトライン作成に使う', rationale: 'AIドラフトは無個性になりがち — アウトライン＋自分でリライトが自然' },
          { decision: 'トレンドよりSEO重視のトピック選び', rationale: 'エバーグリーンコンテンツは長期的に再生数が積み上がる' },
        ]
      : [
          { decision: 'Use AI for script outlines, not full scripts', rationale: 'AI drafts feel generic — outline + personal rewrite keeps authenticity' },
          { decision: 'Focus on SEO-driven topics over trending topics', rationale: 'Evergreen content compounds views over time vs. short spikes' },
        ],
    resumeContext: isJa4
      ? [
          '台本ドラフトはGoogleドキュメント「AIツール動画」ファイルにある',
          'サムネイル候補はCanvaプロジェクトフォルダに保存済み',
          'キーワードリサーチのスプレッドシートに次3本分のSEOデータあり',
        ]
      : [
          'Script draft is in Google Docs "AI Tools Video" file',
          'Thumbnail finalists saved in Canva project folder',
          'Keyword research spreadsheet has the SEO data for next 3 videos',
        ],
    resumeChecklist: isJa4
      ? [{ action: '台本ドラフトの個性と流れをレビュー', whyNow: 'AI生成アウトラインに自分の声を入れてから収録', ifSkipped: '動画がロボット的になり視聴者の信頼を損なう' }]
      : [{ action: 'Review the script draft for personality and flow', whyNow: 'AI-generated outline needs personal voice before recording', ifSkipped: 'Video will sound robotic and hurt audience trust' }],
    handoffMeta: isJa4
      ? { sessionFocus: 'AIを活用した次の動画企画', whyThisSession: '週末収録に向けて台本とサムネイルを準備', timePressure: 'アップロード目標は来週土曜日' }
      : { sessionFocus: 'Planning next video with AI assistance', whyThisSession: 'Need script and thumbnails ready before weekend recording', timePressure: 'Upload target is next Saturday' },
  };

  addLog(log4_1);

  markSampleSeeded();
}
