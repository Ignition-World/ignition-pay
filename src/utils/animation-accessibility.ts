export interface MotionPreference {
  prefersReducedMotion: boolean;
}

export function checkPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getAccessibleTransitionStyle(defaultTransition: string): string {
  if (checkPrefersReducedMotion()) {
    return 'none';
  }
  return defaultTransition;
}
