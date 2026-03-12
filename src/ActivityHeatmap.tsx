import { useMemo, useState } from 'react';
import type { LogEntry } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';

interface ActivityHeatmapProps {
  logs: LogEntry[];
  lang: Lang;
}

const DAY_LABELS_JA = ['月', '火', '水', '木', '金', '土', '日'];
const DAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CELL_SIZE = 28;
const GAP = 2;
const LABEL_W = 32;
const LABEL_H = 20;

function getColor(count: number, max: number): string {
  if (count === 0) return 'var(--bg-surface-secondary)';
  const ratio = count / max;
  if (ratio <= 0.25) return 'rgba(124, 92, 252, 0.15)';
  if (ratio <= 0.5) return 'rgba(124, 92, 252, 0.35)';
  if (ratio <= 0.75) return 'rgba(124, 92, 252, 0.55)';
  return 'rgba(124, 92, 252, 0.8)';
}

export default function ActivityHeatmap({ logs, lang }: ActivityHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Build 7 (days) × 24 (hours) grid
  const { grid, max } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let mx = 0;
    for (const log of logs) {
      const d = new Date(log.createdAt);
      // JS: 0=Sun … 6=Sat → remap to 0=Mon … 6=Sun
      const dow = (d.getDay() + 6) % 7;
      const hour = d.getHours();
      g[dow][hour]++;
      if (g[dow][hour] > mx) mx = g[dow][hour];
    }
    return { grid: g, max: mx };
  }, [logs]);

  if (logs.length === 0) return null;

  const dayLabels = lang === 'ja' ? DAY_LABELS_JA : DAY_LABELS_EN;
  const svgW = LABEL_W + 24 * (CELL_SIZE + GAP);
  const svgH = LABEL_H + 7 * (CELL_SIZE + GAP);

  return (
    <div className="content-card" style={{ marginBottom: 20, overflow: 'auto' }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
        {t('heatmapTitle', lang)}
      </h3>
      <div style={{ position: 'relative', minWidth: svgW }}>
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          {/* Hour labels */}
          {Array.from({ length: 24 }, (_, h) => (
            <text
              key={`h-${h}`}
              x={LABEL_W + h * (CELL_SIZE + GAP) + CELL_SIZE / 2}
              y={14}
              textAnchor="middle"
              fontSize={10}
              fill="var(--text-muted)"
            >
              {h % 3 === 0 ? h : ''}
            </text>
          ))}
          {/* Day labels + cells */}
          {dayLabels.map((label, dow) => (
            <g key={`d-${dow}`}>
              <text
                x={LABEL_W - 6}
                y={LABEL_H + dow * (CELL_SIZE + GAP) + CELL_SIZE / 2 + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--text-muted)"
              >
                {label}
              </text>
              {Array.from({ length: 24 }, (_, h) => {
                const count = grid[dow][h];
                return (
                  <rect
                    key={`${dow}-${h}`}
                    x={LABEL_W + h * (CELL_SIZE + GAP)}
                    y={LABEL_H + dow * (CELL_SIZE + GAP)}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx={4}
                    fill={getColor(count, max)}
                    style={{ cursor: count > 0 ? 'pointer' : 'default', transition: 'fill 0.15s' }}
                    onMouseEnter={(e) => {
                      const rect = (e.target as SVGRectElement).getBoundingClientRect();
                      const parent = (e.target as SVGRectElement).closest('div')!.getBoundingClientRect();
                      setTooltip({
                        x: rect.left - parent.left + CELL_SIZE / 2,
                        y: rect.top - parent.top - 8,
                        text: tf('heatmapTooltip', lang, count),
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </g>
          ))}
        </svg>
        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -100%)',
              background: 'var(--bg-surface-tertiary)',
              color: 'var(--text-body)',
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: 'var(--shadow-sm)',
              border: '1px solid var(--border-default)',
              zIndex: 10,
            }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </div>
  );
}
