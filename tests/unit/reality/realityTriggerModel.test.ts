/**
 * R4-1 Trigger Model（pure）— taxonomy(pure/deferred 分離)・priority・nextCommitment。
 */
import { describe, it, expect } from "vitest";
import { TRIGGER_KINDS, DEFERRED_TRIGGER_KINDS, TRIGGER_PRIORITY, nextCommitment } from "@/lib/plan/reality/triggers/trigger-model";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const ws = (over: Partial<WorldState> = {}): WorldState => ({ date: "2026-06-20", nowMinute: 600, todaySchedule: [], availableWindows: [], context: null, mobility: null, permissionLevel: 2, ...over });

describe("R4-1 taxonomy", () => {
  it("pure trigger と deferred(位置系) を分離・重複なし", () => {
    expect(TRIGGER_KINDS).toEqual(["preflight", "empty_day", "gap_opportunity", "wind_down"]);
    expect(DEFERRED_TRIGGER_KINDS).toEqual(["departure", "linger", "off_route"]);
    expect(TRIGGER_KINDS.some((k) => (DEFERRED_TRIGGER_KINDS as readonly string[]).includes(k))).toBe(false);
  });
  it("preflight が最優先", () => {
    expect(TRIGGER_PRIORITY.preflight).toBeGreaterThan(TRIGGER_PRIORITY.gap_opportunity);
    expect(TRIGGER_PRIORITY.gap_opportunity).toBeGreaterThan(TRIGGER_PRIORITY.empty_day);
    expect(TRIGGER_PRIORITY.empty_day).toBeGreaterThan(TRIGGER_PRIORITY.wind_down);
  });
});

describe("R4-1 nextCommitment", () => {
  it("now より後で最も早い予定・なければ null", () => {
    const w = ws({ nowMinute: 600, todaySchedule: [{ startMinute: 540, endMinute: 600, label: null, protection: null }, { startMinute: 720, endMinute: 780, label: null, protection: null }, { startMinute: 900, endMinute: 960, label: null, protection: null }] });
    expect(nextCommitment(w)!.startMinute).toBe(720);
    expect(nextCommitment(ws({ nowMinute: 1000, todaySchedule: [{ startMinute: 540, endMinute: 600, label: null, protection: null }] }))).toBeNull();
    expect(nextCommitment(ws({ nowMinute: null, todaySchedule: [{ startMinute: 720, endMinute: 780, label: null, protection: null }] }))).toBeNull();
  });
});
