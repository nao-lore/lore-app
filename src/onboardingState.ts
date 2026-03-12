const ONBOARDING_KEY = 'threadlog_onboarding_done';

export function isOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === '1';
}

export function markOnboardingDone(): void {
  localStorage.setItem(ONBOARDING_KEY, '1');
}

export function resetOnboarding(): void {
  localStorage.removeItem(ONBOARDING_KEY);
}
