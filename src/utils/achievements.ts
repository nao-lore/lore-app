import { getTotalSnapshots } from '../storage/core';
import { getStreak } from '../storage/settings';
import { safeGetItem } from '../storage/core';
import { safeJsonParse } from './safeJsonParse';
import type { Project } from '../types';

export interface Badge {
  id: string;
  labelKey: string;
  emoji: string;
}

const BADGE_DEFS: Badge[] = [
  { id: 'first_snapshot', labelKey: 'badgeFirstSnapshot', emoji: '🎯' },
  { id: 'power_user', labelKey: 'badgePowerUser', emoji: '⚡' },
  { id: 'centurion', labelKey: 'badgeCenturion', emoji: '💯' },
  { id: 'streak_7', labelKey: 'badgeStreak7', emoji: '🔥' },
  { id: 'streak_30', labelKey: 'badgeStreak30', emoji: '🏆' },
  { id: 'multi_project', labelKey: 'badgeMultiProject', emoji: '📂' },
  { id: 'context_master', labelKey: 'badgeContextMaster', emoji: '🧩' },
];

export function checkAchievements(): Badge[] {
  const unlocked: Badge[] = [];
  const total = getTotalSnapshots();
  const streak = getStreak();

  // Snapshot count badges
  if (total >= 1) unlocked.push(BADGE_DEFS[0]);
  if (total >= 10) unlocked.push(BADGE_DEFS[1]);
  if (total >= 100) unlocked.push(BADGE_DEFS[2]);

  // Streak badges
  if (streak >= 7) unlocked.push(BADGE_DEFS[3]);
  if (streak >= 30) unlocked.push(BADGE_DEFS[4]);

  // Multi-project badge
  const rawProjects = safeGetItem('threadlog_projects');
  if (rawProjects) {
    const projects = safeJsonParse<Project[]>(rawProjects, []);
    const active = projects.filter((p) => !p.trashedAt);
    if (active.length >= 3) unlocked.push(BADGE_DEFS[5]);
  }

  // Context Master — used Chrome extension injection
  const rawLogs = safeGetItem('threadlog_logs');
  if (rawLogs) {
    // Extension import leaves a marker via hash import or sets extensionImport flag
    const hasExtensionUse = rawLogs.includes('"source":"extension"') || rawLogs.includes('"extensionImport":true');
    if (hasExtensionUse) unlocked.push(BADGE_DEFS[6]);
  }

  return unlocked;
}
