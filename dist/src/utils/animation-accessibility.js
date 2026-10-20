"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPrefersReducedMotion = checkPrefersReducedMotion;
exports.getAccessibleTransitionStyle = getAccessibleTransitionStyle;
function checkPrefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) {
        return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function getAccessibleTransitionStyle(defaultTransition) {
    if (checkPrefersReducedMotion()) {
        return 'none';
    }
    return defaultTransition;
}
