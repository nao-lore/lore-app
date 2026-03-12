import { resetOnboarding } from './onboardingState';
import { t } from './i18n';
import type { Lang } from './i18n';

interface HelpViewProps {
  onBack: () => void;
  lang: Lang;
  onShowOnboarding?: () => void;
}

export default function HelpView({ onBack, lang, onShowOnboarding }: HelpViewProps) {
  const ja = lang === 'ja';

  return (
    <div className="workspace-content">
      <div className="page-header">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('back', lang)}
        </button>
        <h2>{ja ? 'ヘルプ' : 'Help'}</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 1. Loreとは */}
        <div className="content-card">
          <div className="content-card-header">{ja ? 'Loreとは' : 'What is Lore?'}</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', margin: 0 }}>
            {ja
              ? 'AIとの会話を貼り付けるだけで、Worklog（作業ログ）やHandoff（引き継ぎメモ）に自動変換するツールです。'
              : 'Lore automatically transforms your AI conversations into structured Worklogs and Handoff notes — just paste and go.'}
          </p>
          <p className="meta" style={{ fontSize: 13, marginTop: 10 }}>
            {ja
              ? '対象ユーザー：ChatGPT・Claude・GeminiなどのAIを仕事で使っている方'
              : 'For anyone who uses AI tools like ChatGPT, Claude, or Gemini in their work.'}
          </p>
        </div>

        {/* 2. 基本的な使い方 */}
        <div className="content-card">
          <div className="content-card-header">{ja ? '基本的な使い方' : 'Getting Started'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {[
              {
                step: 'Step 1',
                text: ja ? '「+ Create Log」を押す' : 'Click "+ Create Log"',
              },
              {
                step: 'Step 2',
                text: ja
                  ? 'AIとの会話をテキストエリアに貼り付ける（またはファイルをドロップ）'
                  : 'Paste your AI conversation into the text area (or drop a file)',
              },
              {
                step: 'Step 3',
                text: ja
                  ? '生成モードを選ぶ（Handoff / Handoff+TODO抽出 / TODO抽出）'
                  : 'Choose a generation mode (Handoff / Handoff+TODO / TODO only)',
              },
              {
                step: 'Step 4',
                text: ja ? '変換ボタンを押す' : 'Click the transform button',
              },
              {
                step: 'Step 5',
                text: ja
                  ? '生成されたログを確認・保存する'
                  : 'Review and save the generated log',
              },
            ].map((item) => (
              <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  background: 'var(--accent)',
                  borderRadius: 6,
                  padding: '2px 8px',
                  marginTop: 2,
                }}>
                  {item.step}
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-body)' }}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. 各機能の説明 */}
        <div className="content-card">
          <div className="content-card-header">{ja ? '各機能の説明' : 'Features'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
            {[
              {
                name: 'Worklog',
                desc: ja
                  ? 'その日やったことをAIが整理して作業ログにします。決定事項やTODOも自動抽出されます。'
                  : 'AI organizes what you did into a structured work log, automatically extracting decisions and TODOs.',
              },
              {
                name: 'Handoff',
                desc: ja
                  ? '次のAIや未来の自分がすぐ作業を再開できる引き継ぎメモを生成します。'
                  : 'Generates a handoff memo so the next AI (or future you) can resume work immediately.',
              },
              {
                name: 'Project',
                desc: ja
                  ? 'ログをプロジェクト単位で整理できます。ログの分類やフィルタリングに便利です。'
                  : 'Organize logs by project for easy categorization and filtering.',
              },
              {
                name: 'Project Summary',
                desc: ja
                  ? 'プロジェクトに紐づくログをまとめてAIが要約します。進捗の全体像を把握できます。'
                  : 'AI summarizes all logs in a project, giving you a high-level view of progress.',
              },
              {
                name: 'TODO',
                desc: ja
                  ? 'ログから自動抽出されたタスクを管理できます。手動追加や優先度・期限の設定も可能です。'
                  : 'Manage tasks auto-extracted from logs. You can also add tasks manually with priority and due dates.',
              },
              {
                name: 'Timeline',
                desc: ja
                  ? 'すべての活動（ログ作成・TODO追加・プロジェクト作成など）を時系列で確認できます。'
                  : 'View all activity (log creation, TODOs, projects, etc.) in chronological order.',
              },
            ].map((item) => (
              <div
                key={item.name}
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border-divider)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)', marginBottom: 2 }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="content-card">
          <div className="content-card-header">{ja ? 'キーボードショートカット' : 'Keyboard Shortcuts'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
            {[
              { keys: '⌘ N', desc: ja ? 'Create Logを開く' : 'Open Create Log' },
              { keys: '⌘ K', desc: ja ? '検索バーを開く' : 'Open search bar' },
              { keys: '⌘ ,', desc: ja ? '設定を開く' : 'Open Settings' },
              { keys: '?', desc: ja ? 'ショートカット一覧を表示' : 'Show keyboard shortcuts' },
              { keys: 'Esc', desc: ja ? '戻る / モーダルを閉じる' : 'Go back / Close modal' },
            ].map((item) => (
              <div
                key={item.keys}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid var(--border-divider)',
                }}
              >
                <span style={{ fontSize: 14, color: 'var(--text-body)' }}>{item.desc}</span>
                <kbd style={{
                  fontSize: 12, fontFamily: 'inherit', padding: '2px 8px',
                  borderRadius: 4, background: 'var(--bg-sidebar)', border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)', minWidth: 32, textAlign: 'center',
                }}>{item.keys}</kbd>
              </div>
            ))}
          </div>
        </div>

        {/* 4. APIキーについて */}
        <div className="content-card">
          <div className="content-card-header">{ja ? 'APIキーについて' : 'About API Keys'}</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', margin: '0 0 12px' }}>
            {ja
              ? '設定画面からClaude・Gemini・OpenAIのAPIキーを登録できます。キーはこのブラウザのLocalStorageにのみ保存され、外部には送信されません。'
              : 'You can register API keys for Claude, Gemini, and OpenAI in Settings. Keys are stored only in this browser\'s localStorage and are never sent externally.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { name: 'Claude (Anthropic)', url: 'https://console.anthropic.com' },
              { name: 'Gemini (Google)', url: 'https://aistudio.google.com' },
              { name: 'OpenAI', url: 'https://platform.openai.com' },
            ].map((provider) => (
              <div key={provider.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 140 }}>
                  {provider.name}
                </span>
                <a
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: 'var(--accent-text)', textDecoration: 'none' }}
                >
                  {provider.url}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* 5. データについての注意 */}
        <div className="content-card">
          <div className="content-card-header">{ja ? 'データについての注意' : 'Data Notice'}</div>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-body)' }}>
              {ja
                ? 'データはこのブラウザのLocalStorageに保存されています。'
                : 'Data is stored in this browser\'s localStorage.'}
            </li>
            <li style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-body)' }}>
              {ja
                ? 'ブラウザを変えるとデータは引き継がれません。'
                : 'Data will not carry over if you switch browsers.'}
            </li>
            <li style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-body)' }}>
              {ja
                ? '定期的に設定画面の「データをエクスポート」でバックアップすることを推奨します。'
                : 'We recommend regularly backing up your data using "Export Data" in Settings.'}
            </li>
          </ul>
        </div>

        {/* 6. よくある質問 */}
        <div className="content-card">
          <div className="content-card-header">{ja ? 'よくある質問' : 'FAQ'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
            {[
              {
                q: ja ? '変換がうまくいかない' : 'Transform is not working',
                a: ja
                  ? 'APIキーが正しく設定されているか確認してください。設定画面で各プロバイダのキーのステータスを確認できます。'
                  : 'Make sure your API key is correctly configured. You can check each provider\'s key status in Settings.',
              },
              {
                q: ja ? 'データが消えた' : 'My data disappeared',
                a: ja
                  ? '別のブラウザやシークレットウィンドウで開いていないか確認してください。データはブラウザごとに独立しています。'
                  : 'Check if you are using a different browser or incognito window. Data is stored per browser.',
              },
              {
                q: ja ? 'ログが長すぎてエラーになる' : 'Error due to long input',
                a: ja
                  ? '入力が長い場合は自動的に長文モードに切り替わります。それでもエラーになる場合は、入力を分割してください。'
                  : 'Long inputs are automatically handled in long-text mode. If errors persist, try splitting your input.',
              },
              {
                q: ja ? 'AI ContextとProject Summaryの違いは何ですか？' : 'What is the difference between AI Context and Project Summary?',
                a: ja
                  ? 'Project Summaryは人間が読むためのプロジェクト全体の記録です。AI Contextはそれを圧縮してAIに渡すための背景情報です。ハンドオフをコピーすると自動でAI Contextが付与されます。'
                  : 'Project Summary is a human-readable record of the entire project. AI Context is a compressed version designed to be passed to AI assistants. When you copy a handoff, AI Context is automatically included.',
              },
              {
                q: ja ? 'ハンドオフをAIに渡すにはどうすればいいですか？' : 'How do I pass a handoff to AI?',
                a: ja
                  ? 'ハンドオフ詳細画面の「Handoffをコピー」ボタンを押してください。プロジェクトに紐づいている場合、AI Contextが自動で先頭に付与された状態でコピーされます。そのままChatGPT・Claude・Geminiに貼り付けてください。'
                  : 'Click the "Copy Handoff" button on the handoff detail screen. If the log is linked to a project, AI Context is automatically prepended. Just paste it into ChatGPT, Claude, or Gemini.',
              },
              {
                q: ja ? 'Project Summaryはいつ更新すればいいですか？' : 'When should I update the Project Summary?',
                a: ja
                  ? '新しいHandoffをプロジェクトに追加したタイミングで更新することをおすすめします。サイドバーのプロジェクト名横にオレンジのバッジが表示されたら更新のサインです。'
                  : 'We recommend updating it whenever you add a new Handoff to the project. An orange badge next to the project name in the sidebar indicates it\'s time to update.',
              },
              {
                q: ja ? 'WorklogとHandoffの違いは何ですか？' : 'What is the difference between Worklog and Handoff?',
                a: ja
                  ? 'Worklogはその日の作業内容を整理した「日報」です。Handoffは次のAIセッションに渡すための「引き継ぎメモ」で、現状・次のアクション・注意点がまとめられます。通常はHandoffを使うことをおすすめします。'
                  : 'Worklog is a "daily report" summarizing your work. Handoff is a "handover memo" for the next AI session, covering current status, next actions, and caveats. We recommend using Handoff in most cases.',
              },
              {
                q: ja ? 'ナレッジベースは何に使いますか？' : 'What is the Knowledge Base for?',
                a: ja
                  ? 'プロジェクト内のログからAIが繰り返し登場するパターン・用語・ルールを抽出します。プロジェクトの「型」が見えてきます。ログが5件以上たまったら生成してみてください。'
                  : 'AI extracts recurring patterns, terms, and rules from your project logs. It reveals the "shape" of your project. Try generating one once you have 5+ logs.',
              },
              {
                q: ja ? 'ログが増えすぎたらどうすればいいですか？' : 'What should I do when I have too many logs?',
                a: ja
                  ? 'ログ一覧画面から個別に削除できます。削除したログはゴミ箱に移動し、30日後に自動削除されます。プロジェクトに紐づけて整理することもおすすめです。'
                  : 'You can delete logs individually from the log list. Deleted logs go to Trash and are auto-deleted after 30 days. Organizing them into projects is also recommended.',
              },
              {
                q: ja ? 'Chrome拡張が動かない場合は？' : 'Chrome extension not working?',
                a: ja
                  ? '拡張機能のアイコンをクリックし、「Loreのタブで開く」を押してください。それでも動かない場合は、拡張機能を一度オフにしてから再度オンにしてみてください。'
                  : 'Click the extension icon and press "Open in Lore tab". If it still doesn\'t work, try disabling and re-enabling the extension.',
              },
              {
                q: ja ? 'データはどこに保存されていますか？' : 'Where is my data stored?',
                a: ja
                  ? 'このブラウザのLocalStorageに保存されています。別のブラウザやシークレットウィンドウでは表示されません。設定画面の「データをエクスポート」で定期的にバックアップすることをおすすめします。'
                  : 'Data is stored in this browser\'s localStorage. It won\'t appear in other browsers or incognito windows. We recommend regular backups using "Export Data" in Settings.',
              },
            ].map((item, i, arr) => (
              <div
                key={i}
                style={{
                  padding: '12px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border-divider)' : 'none',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Q: {item.q}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                  A: {item.a}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Show onboarding again */}
        {onShowOnboarding && (
          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <button
              className="btn"
              onClick={() => { resetOnboarding(); onShowOnboarding(); }}
              style={{ fontSize: 13 }}
            >
              {ja ? 'オンボーディングをもう一度見る' : 'Show onboarding again'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
