"use client";

/**
 * Haptic feedback utilities for Rendezvous interactions.
 * Uses Web Vibration API — safely no-ops on unsupported devices (iOS Safari).
 */

export function hapticLight() {
  try { navigator?.vibrate?.(10); } catch {}
}

export function hapticMedium() {
  try { navigator?.vibrate?.(25); } catch {}
}

export function hapticHeavy() {
  try { navigator?.vibrate?.([30, 20, 60]); } catch {}
}

export function hapticSuccess() {
  try { navigator?.vibrate?.([50, 30, 100, 30, 50]); } catch {}
}
