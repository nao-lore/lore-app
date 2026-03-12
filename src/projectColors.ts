export const PROJECT_COLORS: { key: string; hex: string; label: string }[] = [
  { key: 'red', hex: '#ef4444', label: 'Red' },
  { key: 'orange', hex: '#f97316', label: 'Orange' },
  { key: 'amber', hex: '#f59e0b', label: 'Amber' },
  { key: 'green', hex: '#22c55e', label: 'Green' },
  { key: 'teal', hex: '#14b8a6', label: 'Teal' },
  { key: 'blue', hex: '#3b82f6', label: 'Blue' },
  { key: 'indigo', hex: '#6366f1', label: 'Indigo' },
  { key: 'purple', hex: '#a855f7', label: 'Purple' },
  { key: 'pink', hex: '#ec4899', label: 'Pink' },
  { key: 'slate', hex: '#64748b', label: 'Slate' },
];

export function getProjectColor(colorKey?: string): string | undefined {
  if (!colorKey) return undefined;
  return PROJECT_COLORS.find((c) => c.key === colorKey)?.hex;
}
