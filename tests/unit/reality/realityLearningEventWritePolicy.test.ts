/**
 * A1-7-18 Later / Deferred Learning Event Policy — pure helper tests。
 *   decideLearningWrite: accept/dismiss/later すべて accepted なら write（**later を含める**）・!accepted は skip。
 *   learningEventDedupKey: handle+action+acted_date（日粒度）・同日反復 collapse / 異日別 key / action·handle 別。
 */
import { describe, it, expect } from "vitest";
import { decideLearningWrite, learningEventDedupKey } from "@/lib/plan/reality/learning/learning-event-write-policy";

const OK = { accepted: true };
const FAIL = { accepted: false };
const H = "c1:" + "a".repeat(64);

describe("A1-7-18 decideLearningWrite — accept/dismiss/later すべて write（later を是正して含める）", () => {
  it("accept + accepted → write/adoption", () => {
    expect(decideLearningWrite("accept", OK)).toEqual({ write: true, signal: "adoption", reason: "adoption" });
  });
  it("dismiss + accepted → write/non_adoption", () => {
    expect(decideLearningWrite("dismiss", OK)).toEqual({ write: true, signal: "non_adoption", reason: "non_adoption" });
  });
  it("later + accepted → write/deferral（**A1-7-17 の deferred 除外を是正**）", () => {
    expect(decideLearningWrite("later", OK)).toEqual({ write: true, signal: "deferral", reason: "deferral" });
  });
  it("!accepted（失敗/conflict）→ 全 action で skip", () => {
    for (const a of ["accept", "dismiss", "later"] as const) {
      expect(decideLearningWrite(a, FAIL)).toEqual({ write: false, signal: null, reason: "action_not_accepted" });
    }
  });
});

describe("A1-7-18 learningEventDedupKey — handle+action+acted_date（日粒度・同日 collapse / 異日蓄積）", () => {
  it("同 handle+action+同日（時刻違い）→ 同 key（同日連打を collapse）", () => {
    const k1 = learningEventDedupKey(H, "later", "2026-06-15T09:00:00.000Z");
    const k2 = learningEventDedupKey(H, "later", "2026-06-15T21:30:45.000Z");
    expect(k1).toBe(k2);
    expect(k1).toBe(`${H}::later::2026-06-15`);
  });
  it("同 handle+action+異日 → 別 key（慢性 deferral を蓄積）", () => {
    expect(learningEventDedupKey(H, "later", "2026-06-15T09:00:00.000Z")).not.toBe(
      learningEventDedupKey(H, "later", "2026-06-16T09:00:00.000Z")
    );
  });
  it("action 違い → 別 key", () => {
    expect(learningEventDedupKey(H, "accept", "2026-06-15T09:00:00.000Z")).not.toBe(
      learningEventDedupKey(H, "dismiss", "2026-06-15T09:00:00.000Z")
    );
  });
  it("handle 違い → 別 key", () => {
    expect(learningEventDedupKey(H, "later", "2026-06-15T09:00:00.000Z")).not.toBe(
      learningEventDedupKey("c1:" + "b".repeat(64), "later", "2026-06-15T09:00:00.000Z")
    );
  });
  it("acted_at null/空 → 同 handle+action の null を collapse（graceful）", () => {
    expect(learningEventDedupKey(H, "later", null)).toBe(`${H}::later::`);
    expect(learningEventDedupKey(H, "later", "")).toBe(`${H}::later::`);
  });
});
