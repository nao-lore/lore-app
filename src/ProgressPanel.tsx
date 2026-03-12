import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Lang } from './i18n';

export interface ProgressStep {
  label: string;
  duration?: number; // estimated ms for this step (for simulated progress)
}

export interface ProgressState {
  /** Current step index (0-based). Set to steps.length when done. */
  stepIndex: number;
  /** Optional real percentage override (0-100). If set, takes priority over simulation. */
  percent?: number;
  /** Additional status text shown below the bar */
  detail?: string;
}

interface ProgressPanelProps {
  steps: ProgressStep[];
  state: ProgressState;
  lang: Lang;
  /** Optional action buttons (pause/cancel) rendered below the bar */
  actions?: ReactNode;
  /** Custom dot color CSS value */
  dotColor?: string;
  /** Whether to animate the dot (default: true) */
  dotAnimate?: boolean;
  /** Custom bar color CSS value */
  barColor?: string;
  /** Optional heading shown above the progress (e.g. "Step 1/2: Handoff") */
  heading?: string;
}

/**
 * Shared loading/progress component for all AI processing.
 *
 * Usage:
 *   <ProgressPanel
 *     steps={[
 *       { label: 'ログを分析中...', duration: 3000 },
 *       { label: '重要項目を抽出中...', duration: 4000 },
 *       { label: '内容を整理中...', duration: 2000 },
 *       { label: '仕上げ中...', duration: 1000 },
 *     ]}
 *     state={{ stepIndex: 1 }}
 *     lang={lang}
 *   />
 */
export default function ProgressPanel({ steps, state, lang, actions, dotColor, dotAnimate = true, barColor, heading }: ProgressPanelProps) {
  const { stepIndex, percent: realPercent, detail } = state;
  const totalSteps = steps.length;
  const isDone = stepIndex >= totalSteps;

  // Simulated smooth progress within the current step
  const [simProgress, setSimProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStepRef = useRef(-1);

  useEffect(() => {
    if (isDone) {
      setSimProgress(100);
      return;
    }

    // Reset simulation on step change
    if (stepIndex !== prevStepRef.current) {
      prevStepRef.current = stepIndex;
      const basePercent = (stepIndex / totalSteps) * 100;
      setSimProgress(basePercent);

      // Simulate progress within this step's slice
      const stepSlice = 100 / totalSteps;
      const duration = steps[stepIndex]?.duration || 5000;
      const tickMs = 150;
      const totalTicks = duration / tickMs;
      // Progress to ~85% of the step slice, leaving room for the real completion
      const targetDelta = stepSlice * 0.85;
      let elapsed = 0;

      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        elapsed++;
        // Ease-out curve: fast at start, slowing down
        const rawPct = basePercent + (targetDelta * (1 - Math.pow(1 - elapsed / totalTicks, 2)));
        setSimProgress(Math.min(rawPct, basePercent + targetDelta));
        if (elapsed >= totalTicks) {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, tickMs);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [stepIndex, totalSteps, steps, isDone]);

  const displayPercent = realPercent !== undefined ? realPercent : simProgress;
  const currentStep = isDone ? steps[totalSteps - 1] : steps[stepIndex];

  return (
    <div className="ai-progress-panel">
      {/* Phase heading (for "both" mode) */}
      {heading && (
        <div className="ai-progress-heading">{heading}</div>
      )}
      {/* Step indicator */}
      <div className="ai-progress-header">
        <span className="ai-progress-dot" style={{
          ...(dotColor ? { background: dotColor } : {}),
          ...(dotAnimate ? {} : { animation: 'none' }),
        }} />
        <span className="ai-progress-label">
          {currentStep?.label || (lang === 'ja' ? '処理中...' : 'Processing...')}
        </span>
        {!isDone && totalSteps > 1 && (
          <span className="ai-progress-step-count">
            {stepIndex + 1}/{totalSteps}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="ai-progress-track">
        <div
          className="ai-progress-bar"
          style={{
            width: `${Math.min(100, Math.max(0, displayPercent))}%`,
            ...(barColor ? { background: barColor } : {}),
          }}
        />
      </div>

      {/* Step dots (hidden for single-step) */}
      {totalSteps > 1 && (
        <div className="ai-progress-steps">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`ai-progress-step${i < stepIndex ? ' done' : i === stepIndex && !isDone ? ' active' : ''}`}
            >
              <div className="ai-progress-step-dot" />
              <span className="ai-progress-step-label">{step.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Detail text */}
      {detail && (
        <div className="ai-progress-detail">{detail}</div>
      )}

      {/* Action buttons */}
      {actions && (
        <div className="ai-progress-actions">{actions}</div>
      )}
    </div>
  );
}
