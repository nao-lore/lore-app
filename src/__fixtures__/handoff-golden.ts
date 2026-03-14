export interface GoldenTestCase {
  name: string;
  description: string;
  input: string; // simulated chat conversation
  expected: {
    currentStatus?: string[];
    decisionRationales?: Array<{ decision: string; rationale: string | null }>;
    decisions?: string[]; // legacy format fallback
    completed?: string[];
    blockers?: string[];
    constraints?: string[];
    nextActions?: string[];
    resumeContext?: string[];
  };
  bad: {
    currentStatus?: string[]; // past-tense items that should NOT appear
    decisions?: string[]; // vague/rationale-less items
    blockers?: string[]; // resolved items that should NOT appear
    resumeContext?: string[]; // nextActions copies, vague items
    constraints?: string[]; // items that are NOT constraints
  };
}

export const GOLDEN_TESTS: GoldenTestCase[] = [
  // =========================================================================
  // Test case 1: Standard dev session with auth implementation
  // =========================================================================
  {
    name: 'Standard dev session with auth implementation',
    description:
      'Implementing session-based auth, choosing between JWT and session cookies, writing middleware, hitting a CORS issue that gets resolved, planning tests next.',
    input: [
      'User: 認証機能を実装したい。JWTとセッションCookieのどっちがいいかな？',
      'Assistant: MPAアーキテクチャならCookieベースのセッション認証が自然です。JWTはSPAやモバイル向けに便利ですが、サーバーサイドレンダリング中心ならCookieが扱いやすいですね。',
      'User: たしかに、うちはExpressでSSRだからセッションベースでいこう。TypeScript strict modeで書いてるから型もちゃんとつけたい。',
      'Assistant: 了解です。express-sessionを使ったミドルウェアの例を示しますね。\n```typescript\nimport session from "express-session";\nexport const authMiddleware = (req: Request, res: Response, next: NextFunction) => {\n  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });\n  next();\n};\n```',
      'User: いいね、auth.tsにこれを実装した。動いてる。',
      'User: あ、CORSエラーが出てる。Access-Control-Allow-Originが設定されてないみたい。',
      'Assistant: server.tsにCORS設定を追加しましょう。\n```typescript\nimport cors from "cors";\napp.use(cors({ origin: "http://localhost:3000", credentials: true }));\n```',
      'User: server.tsにCORS追加して解決した。credentials: trueが必要だったんだね。',
      'User: 次はauth.tsのユニットテストを書きたい。明日やる。',
    ].join('\n'),
    expected: {
      currentStatus: [
        '認証ミドルウェアは実装済みだがテストが未実施',
        'CORS設定はserver.tsに追加済みで正常動作中',
      ],
      decisionRationales: [
        {
          decision: 'セッションベース認証を採用',
          rationale: 'MPAアーキテクチャのためCookieベースが自然',
        },
      ],
      decisions: ['セッションベース認証を採用（JWT不採用）'],
      completed: [
        '認証ミドルウェアをauth.tsに実装',
        'CORS設定をserver.tsに追加',
      ],
      blockers: [],
      constraints: ['TypeScript strict mode', 'Express.js backend'],
      nextActions: ['auth.tsのユニットテストを作成する'],
      resumeContext: [
        'mainブランチをpullして最新にする',
        'auth.tsの実装を確認する',
        'テストファイルauth.test.tsを新規作成する',
      ],
    },
    bad: {
      currentStatus: ['認証ミドルウェアを実装した'], // past tense
      decisions: ['認証を実装'], // no rationale, too vague
      blockers: ['CORSエラーが発生する'], // already resolved
      resumeContext: ['認証ミドルウェアのテストを書く'], // just copying nextActions
    },
  },

  // =========================================================================
  // Test case 2: Blocker resolved mid-session
  // =========================================================================
  {
    name: 'Blocker resolved mid-session',
    description:
      'API timeout issues investigated, retry logic implemented, confirmed working, then moved to rate limiting discussion.',
    input: [
      'User: provider.tsのAPI呼び出しがタイムアウトしまくってる。原因調べたい。',
      'Assistant: タイムアウトの原因として考えられるのは、1) サーバー側の負荷、2) リクエストサイズ、3) ネットワーク遅延です。まずはタイムアウト値の確認をしましょう。',
      'User: デフォルトの30秒じゃ短いみたい。レスポンスに40秒くらいかかってるケースがある。',
      'Assistant: exponential backoffのリトライロジックを入れましょう。最大3回リトライで。',
      'User: それでいく。provider.tsにリトライロジックを実装した。\n```typescript\nasync function callWithRetry(fn: () => Promise<Response>, maxRetries = 3) {\n  for (let i = 0; i < maxRetries; i++) {\n    try { return await fn(); }\n    catch (e) { if (i === maxRetries - 1) throw e; await sleep(1000 * 2 ** i); }\n  }\n}\n```',
      'User: テストしたら安定した。タイムアウト問題は解決。',
      'User: 次はrate limitingの実装も必要だけど、APIの制限値がまだ不明。ドキュメント確認してからにする。',
    ].join('\n'),
    expected: {
      currentStatus: [
        'APIリトライロジックはprovider.tsに実装済みで安定動作中',
        'レート制限の実装は未着手（API制限値が不明）',
      ],
      completed: [
        'provider.tsにexponential backoffリトライロジックを実装',
      ],
      blockers: ['APIのレート制限値が不明（ドキュメント確認が必要）'],
      nextActions: ['APIドキュメントでレート制限値を確認する'],
      decisions: ['リトライはexponential backoff、最大3回に決定'],
    },
    bad: {
      blockers: ['APIがタイムアウトする'], // resolved
      currentStatus: ['タイムアウト問題を調査した'], // past tense
    },
  },

  // =========================================================================
  // Test case 3: Implicit constraints mentioned casually
  // =========================================================================
  {
    name: 'Implicit constraints mentioned casually',
    description:
      'Constraints stated casually in early messages, then feature implementation discussion follows.',
    input: [
      'User: TODOアプリを作りたい。バックエンドはないからlocalStorageで永続化する。',
      'User: TypeScript以外は使わないで。あとReactで。',
      'Assistant: 了解です。React + TypeScriptでlocalStorageベースのTODOアプリですね。コンポーネント設計はどうしますか？',
      'User: シンプルに。TodoList、TodoItem、AddTodoFormの3つ。',
      'Assistant: TodoList.tsxの基本構造を示しますね。\n```tsx\nexport const TodoList: React.FC = () => {\n  const [todos, setTodos] = useState<Todo[]>([]);\n  useEffect(() => {\n    const saved = localStorage.getItem("todos");\n    if (saved) setTodos(JSON.parse(saved));\n  }, []);\n  // ...\n};\n```',
      'User: いいね、TodoList.tsxとTodoItem.tsxを実装した。AddTodoFormはまだ。',
      'User: フィルタ機能もほしいけど、まずは基本のCRUDを先に完成させたい。',
    ].join('\n'),
    expected: {
      constraints: [
        'バックエンドなし（クライアントサイドのみ）',
        'TypeScriptのみ使用',
        'データ永続化はlocalStorage',
      ],
      completed: [
        'TodoList.tsxを実装',
        'TodoItem.tsxを実装',
      ],
      nextActions: ['AddTodoFormコンポーネントを実装する'],
      currentStatus: [
        'TodoListとTodoItemは実装済み、AddTodoFormは未実装',
        'フィルタ機能は未着手',
      ],
    },
    bad: {
      constraints: [], // missed implicit constraints
      resumeContext: ['コードベースを確認する'], // too vague
    },
  },

  // =========================================================================
  // Test case 4: Long session with multiple topics and decision changes
  // =========================================================================
  {
    name: 'Long session with multiple topics and decision changes',
    description:
      'Session starts with Redis decision, later reverses to localStorage. Multiple features discussed.',
    input: [
      'User: キャッシュにRedisを使おう。セッションデータの保存先として。',
      'Assistant: Redisは高速で良い選択ですね。redis npmパッケージをインストールしましょうか？',
      'User: うん、package.jsonに追加して。',
      'User: あ、でも待って。今のユーザー数だとRedisはオーバーキルかも。',
      'User: やっぱりlocalStorageで十分だった。Redisはやめる。クライアントサイドだけで完結させたい。',
      'Assistant: 了解です。localStorageに切り替えましょう。storage.tsにラッパー関数を作りますか？',
      'User: そうする。storage.tsにget/set/removeのラッパーを実装した。',
      'User: あとsearch機能も入れたい。SearchBar.tsxを作って、タイトルとタグで検索できるようにする。',
      'User: SearchBar.tsxの基本UIは実装した。でも検索ロジックはまだ。fuzzy matchにするかexact matchにするか迷ってる。',
      'Assistant: 小規模データならexact matchの部分一致で十分かもしれません。fuse.jsを使えばfuzzy matchも簡単です。',
      'User: まだ決めてない。次のセッションで考える。',
    ].join('\n'),
    expected: {
      decisionRationales: [
        {
          decision: 'localStorage採用（Redis撤回）',
          rationale: '現時点ではクライアントサイドのみで十分と判断',
        },
      ],
      decisions: ['localStorage採用（Redis撤回）'],
      completed: [
        'storage.tsにget/set/removeラッパーを実装',
        'SearchBar.tsxの基本UIを実装',
      ],
      blockers: [],
      nextActions: ['SearchBar.tsxの検索ロジック（fuzzy vs exact）を決定して実装する'],
      currentStatus: [
        'storage.tsのlocalStorageラッパーは実装済みで動作中',
        'SearchBar.tsxはUI実装済み、検索ロジックは未実装',
      ],
    },
    bad: {
      decisions: ['Redisを採用', 'localStorageを採用'], // contradictory, both present
      blockers: ['Redisの設定が必要'], // Redis was dropped
      currentStatus: ['Redisからlocalに切り替えた'], // past tense
      resumeContext: ['検索機能の実装を続ける'], // too vague
    },
  },
];
