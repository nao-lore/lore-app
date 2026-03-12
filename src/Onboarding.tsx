import { useState, useEffect, useCallback } from 'react';
import type { Lang } from './i18n';
import { useFocusTrap } from './useFocusTrap';
import { markOnboardingDone } from './onboardingState';

interface OnboardingProps {
  lang: Lang;
  onClose: () => void;
  onOpenSettings: () => void;
  onStartCreate: () => void;
}

interface StepDef {
  title: string;
  desc: string;
  action?: { label: string; handler: () => void };
  final?: boolean;
  descAlign?: 'left';
}

export default function Onboarding({ lang, onClose, onOpenSettings, onStartCreate }: OnboardingProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [step, setStep] = useState(0);
  const ja = lang === 'ja';

  const finish = useCallback(() => {
    markOnboardingDone();
    onClose();
  }, [onClose]);

  // Esc to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [finish]);

  const steps: StepDef[] = [
    {
      title: ja ? 'Loreへようこそ' : 'Welcome to Lore',
      desc: ja
        ? 'AIとの会話を貼り付けるだけで、作業ログ・引き継ぎメモを自動生成します。'
        : 'Automatically generate work logs and handoff notes — just paste your AI conversations.',
    },
    {
      title: ja ? 'まずAPIキーを設定しましょう' : 'Set up your API key',
      desc: ja
        ? 'Gemini（推奨）のAPIキーを設定しましょう。\n無料で取得できます。\n\n→ aistudio.google.com でAPIキーを取得\n\u3000Claude・OpenAIにも対応しています。'
        : 'Set up a Gemini (recommended) API key.\nIt\'s free to get started.\n\n→ aistudio.google.com to get an API key\n  Claude and OpenAI are also supported.',
      descAlign: 'left',
      action: {
        label: ja ? '設定画面を開く' : 'Open Settings',
        handler: () => { markOnboardingDone(); onOpenSettings(); },
      },
    },
    {
      title: ja ? 'AIとの会話を貼り付けてみましょう' : 'Paste an AI conversation',
      desc: ja
        ? 'ChatGPTやClaudeとの会話をコピーして貼り付けるだけでOKです。ファイルのドロップにも対応しています。'
        : 'Just copy and paste a conversation from ChatGPT or Claude. You can also drop files.',
      action: {
        label: ja ? 'やってみる' : 'Try it now',
        handler: () => { markOnboardingDone(); onStartCreate(); },
      },
    },
    {
      title: ja ? 'Chrome拡張でもっと便利に' : 'Even easier with the Chrome extension',
      desc: ja
        ? 'ChatGPTやClaudeのページに\n「Loreに送る」ボタンが追加されます。\n\n会話が終わったらワンクリックで\nLoreに送れます。'
        : 'Adds a "Send to Lore" button\non ChatGPT and Claude pages.\n\nSend conversations to Lore\nwith one click.',
      action: {
        label: ja ? 'スキップ' : 'Skip for now',
        handler: () => {},
      },
    },
    {
      title: ja ? 'AIとの会話が資産になる' : 'Your AI chats become assets',
      desc: ja
        ? '1. AIで仕事する\n2. チャット履歴をLoreに貼る\n3. Handoffに自動変換される\n4. プロジェクトに追加してProject Summaryを生成\n5. 次回のAIにHandoffをコピペ → 即座に文脈共有'
        : '1. Work with AI\n2. Paste the chat into Lore\n3. Auto-converted to Handoff\n4. Add to a project and generate a Project Summary\n5. Copy-paste Handoff to next AI → instant context sharing',
      descAlign: 'left',
    },
    {
      title: ja ? '準備完了です' : 'You\'re all set!',
      desc: ja
        ? '困ったときはサイドバーのヘルプをご確認ください。'
        : 'If you need help, check the Help section in the sidebar.',
      final: true,
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;
  const totalSteps = steps.length;

  return (
    <div className="onboarding-overlay">
      <div ref={trapRef} className="onboarding-card" role="dialog" aria-modal="true">
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: i === step ? 'var(--accent)' : 'var(--border-default)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Step counter */}
        <div className="meta" style={{ textAlign: 'center', fontSize: 12, marginBottom: 8 }}>
          Step {step + 1} / {totalSteps}
        </div>

        {/* Content */}
        <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          {current.title}
        </h2>
        {current.descAlign === 'left' ? (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 28px' }}>
            <p style={{ textAlign: 'left', fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', margin: 0, maxWidth: 360, whiteSpace: 'pre-line' }}>
              {current.desc}
            </p>
          </div>
        ) : (
          <p style={{ textAlign: 'center', fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', margin: '0 0 28px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto', whiteSpace: 'pre-line' }}>
            {current.desc}
          </p>
        )}

        {/* Action button (step-specific) */}
        {current.action && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <button
              className="btn btn-primary"
              onClick={current.action.handler}
              style={{ padding: '8px 24px', fontSize: 14, fontWeight: 600, borderRadius: 10 }}
            >
              {current.action.label}
            </button>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {!isFirst && (
              <button
                className="btn"
                onClick={() => setStep((s) => s - 1)}
                style={{ fontSize: 13, padding: '6px 14px' }}
              >
                {ja ? '戻る' : 'Back'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isLast && (
              <button
                className="btn"
                onClick={finish}
                style={{ fontSize: 13, padding: '6px 14px', color: 'var(--text-muted)' }}
              >
                {ja ? 'スキップ' : 'Skip'}
              </button>
            )}
            {current.final ? (
              <button
                className="btn btn-primary"
                onClick={finish}
                style={{ fontSize: 13, padding: '6px 20px', fontWeight: 600, borderRadius: 8 }}
              >
                {ja ? 'はじめる' : 'Get Started'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setStep((s) => s + 1)}
                style={{ fontSize: 13, padding: '6px 20px', fontWeight: 600, borderRadius: 8 }}
              >
                {ja ? '次へ' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
