// lib/origin/v2/anchorStore.ts
// LocalStorage persistence for Earth Trace preferences and anchors

import type { EarthTracePrefs, LifeAnchor } from "./types";

const PREFS_KEY = "culcept_earth_trace_prefs_v1";
const ANCHORS_KEY = "culcept_life_anchors_v2";

export const defaultEarthTracePrefs: EarthTracePrefs = {
  gpsPermissionGranted: false,
  autoGrabOnOpen: false,
  nightLogEnabled: false,
  lastSessionId: null,
  version: 1,
};

export function loadEarthTracePrefs(): EarthTracePrefs {
  if (typeof window === "undefined") return defaultEarthTracePrefs;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultEarthTracePrefs;
    return { ...defaultEarthTracePrefs, ...JSON.parse(raw) };
  } catch {
    return defaultEarthTracePrefs;
  }
}

export function saveEarthTracePrefs(prefs: EarthTracePrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function loadAnchors(): LifeAnchor[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ANCHORS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveAnchors(anchors: LifeAnchor[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ANCHORS_KEY, JSON.stringify(anchors));
}
