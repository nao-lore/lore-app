import { useMemo, useState } from 'react';
import type { LogEntry } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';

interface ActivityHeatmapProps {
  logs: LogEntry[];
  lang: Lang;
  onDateClick?: (date: string) => void;
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

export default function ActivityHeatmap({ logs, lang, onDateClick }: ActivityHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Build 7 (days) × 24 (hours) grid + track most recent date per cell
  const { grid, max, recentDateMap } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const dateMap = new Map<string, string>(); // "dow-hour" → most recent YYYY-MM-DD
    let mx = 0;
    for (const log of logs) {
      const d = new Date(log.createdAt);
      // JS: 0=Sun … 6=Sat → remap to 0=Mon … 6=Sun
      const dow = (d.getDay() + 6) % 7;
      const hour = d.getHours();
      g[dow][hour]++;
      if (g[dow][hour] > mx) mx = g[dow][hour];
      const cellKey = `${dow}-${hour}`;
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const existing = dateMap.get(cellKey);
      if (!existing || dateStr > existing) {
        dateMap.set(cellKey, dateStr);
      }
    }
    return { grid: g, max: mx, recentDateMap: dateMap };
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
                const cellKey = `${dow}-${h}`;
                const clickable = count > 0 && !!onDateClick;
                const isHovered = hoveredCell === cellKey && clickable;
                return (
                  <rect
                    key={cellKey}
                    x={LABEL_W + h * (CELL_SIZE + GAP)}
                    y={LABEL_H + dow * (CELL_SIZE + GAP)}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx={4}
                    fill={getColor(count, max)}
                    stroke={isHovered ? 'rgba(124, 92, 252, 0.7)' : 'transparent'}
                    strokeWidth={isHovered ? 2 : 0}
                    opacity={isHovered ? 0.8 : 1}
                    style={{ cursor: clickable ? 'pointer' : 'default', transition: 'fill 0.15s, opacity 0.15s, stroke 0.15s' }}
                    onMouseEnter={(e) => {
                      setHoveredCell(cellKey);
                      const rect = (e.target as SVGRectElement).getBoundingClientRect();
                      const parentEl = (e.target as SVGRectElement).closest('div');
                      if (!parentEl) return;
                      const parent = parentEl.getBoundingClientRect();
                      setTooltip({
                        x: rect.left - parent.left + CELL_SIZE / 2,
                        y: rect.top - parent.top - 8,
                        text: tf('heatmapTooltip', lang, count),
                      });
                    }}
                    onMouseLeave={() => { setTooltip(null); setHoveredCell(null); }}
                    onClick={() => {
                      if (clickable) {
                        const date = recentDateMap.get(cellKey);
                        if (date) onDateClick(date);
                      }
                    }}
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
