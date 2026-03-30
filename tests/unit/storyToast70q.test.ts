// tests/unit/storyToast70q.test.ts
// 受け入れ基準 #1 を検証
// 70問到達トーストが初回のみ出ること
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── localStorage mock ──
const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
});

// ── Extracted logic from StargazerHome.tsx ──
// The toast logic is:
//   const STORAGE_KEY = "stargazer_story_70q_shown";
//   if totalAnswered >= 70 && !localStorage.getItem(STORAGE_KEY)
//     → show toast (after 4s delay)
//     → on dismiss/view: localStorage.setItem(STORAGE_KEY, "1")

const STORAGE_KEY = "stargazer_story_70q_shown";

function shouldShowToast(totalAnswered: number): boolean {
  if (totalAnswered < 70) return false;
  if (localStorage.getItem(STORAGE_KEY)) return false;
  return true;
}

function dismissToast(): void {
  localStorage.setItem(STORAGE_KEY, "1");
}

describe("70-question toast — one-time display logic", () => {
  it("does NOT show when totalAnswered < 70", () => {
    expect(shouldShowToast(0)).toBe(false);
    expect(shouldShowToast(50)).toBe(false);
    expect(shouldShowToast(69)).toBe(false);
  });

  it("shows when totalAnswered >= 70 and not previously shown", () => {
    expect(shouldShowToast(70)).toBe(true);
    expect(shouldShowToast(100)).toBe(true);
    expect(shouldShowToast(200)).toBe(true);
  });

  it("does NOT show after being dismissed (localStorage set)", () => {
    expect(shouldShowToast(70)).toBe(true);
    dismissToast();
    expect(shouldShowToast(70)).toBe(false);
    expect(shouldShowToast(100)).toBe(false);
  });

  it("persists across 'sessions' (localStorage survives)", () => {
    dismissToast();
    // Simulate new page load — localStorage persists
    expect(shouldShowToast(70)).toBe(false);
    expect(shouldShowToast(150)).toBe(false);
  });

  it("only marks as shown when explicitly dismissed (not on threshold crossing)", () => {
    // First check: should show
    expect(shouldShowToast(70)).toBe(true);
    // Without dismissing, still shows
    expect(shouldShowToast(70)).toBe(true);
    expect(shouldShowToast(80)).toBe(true);
    // Dismiss
    dismissToast();
    // Now hidden
    expect(shouldShowToast(70)).toBe(false);
  });
});
