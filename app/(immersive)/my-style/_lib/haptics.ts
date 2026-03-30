/**
 * 触覚フィードバック — Haptic Feedback Utilities
 */

function canVibrate(): boolean {
    return typeof navigator !== "undefined" && "vibrate" in navigator;
}

export function vibrateLight(): void {
    if (canVibrate()) navigator.vibrate(10);
}

export function vibrateMedium(): void {
    if (canVibrate()) navigator.vibrate(25);
}

export function vibrateSuccess(): void {
    if (canVibrate()) navigator.vibrate([10, 50, 20]);
}

export function vibrateSwipe(): void {
    if (canVibrate()) navigator.vibrate(15);
}

export function vibrateError(): void {
    if (canVibrate()) navigator.vibrate([30, 80, 30]);
}
