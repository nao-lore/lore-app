import { safeGetItem, safeSetItem, safeRemoveItem } from './storage';

const ONBOARDING_KEY = 'threadlog_onboarding_done';

export function isOnboardingDone(): boolean {
  return safeGetItem(ONBOARDING_KEY) === '1';
}

export function markOnboardingDone(): void {
  safeSetItem(ONBOARDING_KEY, '1');
}

export function resetOnboarding(): void {
  safeRemoveItem(ONBOARDING_KEY);
}
