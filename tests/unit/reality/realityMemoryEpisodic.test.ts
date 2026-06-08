/**
 * R1-4 Episodic Memory Adapter（pure）— M1 learning event → MemoryItem(episodic)。
 *   provenance=prm_learning_event・非断定「〜したことがある」・counterCount=0・redacted(band×action のみ)・
 *   同一文脈の collapse(occurrence count)・決定的順序・semantic との区別。
 */
import { describe, it, expect } from "vitest";
import {
  learningEventToEpisodicMemory,
  learningEventsToEpisodicMemory,
} from "@/lib/plan/reality/learning/memory-episodic-adapter";
import { memoryObservationHasViolation } from "@/lib/plan/reality/learning/memory-model";
import type { PrmLearningEventReadRow } from "@/lib/plan/reality/learning/prm-learning-event-read";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";

function row(over: Partial<PrmLearningEventReadRow> = {}): PrmLearningEventReadRow {
  return {
    handle: "h1",
    action: "dismiss",
    desired_date: "2026-05-12",
    band: "evening",
    confidence_band: "medium",
    duration_min: 60,
    source_kind: "seed_explicit",
    acted_at: "2026-05-12T10:00:00Z",
    ...over,
  };
}

describe("R1-4 learningEventToEpisodicMemory — 1 件の event", () => {
  it("kind=episodic / provenance=prm_learning_event / context=band / 1 occurrence / counterCount=0", () => {
    const m = learningEventToEpisodicMemory(row());
    expect(m.kind).toBe("episodic");
    expect(m.source).toBe("prm_learning_event");
    expect(m.context).toEqual({ dimension: "band", value: "evening" });
    expect(m.evidenceCount).toBe(1);
    expect(m.counterCount).toBe(0); // 事実に反証はない
    expect(m.userConfirmed).toBe(false);
    expect(m.userCorrection).toBeNull();
    expect(m.certainty).toBe("low"); // 1 件は low
  });

  it("action → 過去形動詞（accept/dismiss/later = 取り入れた/見送った/後回しにした）", () => {
    expect(learningEventToEpisodicMemory(row({ action: "accept" })).observation).toContain("取り入れた");
    expect(learningEventToEpisodicMemory(row({ action: "dismiss" })).observation).toContain("見送った");
    expect(learningEventToEpisodicMemory(row({ action: "later" })).observation).toContain("後回しにした");
  });

  it("band → 文脈句（morning/afternoon/evening と null=none）", () => {
    expect(learningEventToEpisodicMemory(row({ band: "morning" })).observation).toContain("朝の予定");
    expect(learningEventToEpisodicMemory(row({ band: "afternoon" })).observation).toContain("午後の予定");
    expect(learningEventToEpisodicMemory(row({ band: "evening" })).observation).toContain("夜の予定");
    const nullBand = learningEventToEpisodicMemory(row({ band: null }));
    expect(nullBand.context.value).toBe("none");
    expect(nullBand.observation).toContain("時間帯の定まらない予定");
  });

  it("redacted: observation に handle / 絶対日付を含まない", () => {
    const m = learningEventToEpisodicMemory(row({ handle: "secret-handle-xyz" }));
    expect(m.observation).not.toContain("secret-handle-xyz");
    expect(m.observation).not.toContain("2026");
    expect(m.observation).not.toContain("h1");
  });

  it("observation は非断定・trait 語なし（全 action）", () => {
    for (const a of ["accept", "dismiss", "later"] as CandidateActionKind[]) {
      const m = learningEventToEpisodicMemory(row({ action: a }));
      expect(memoryObservationHasViolation(m.observation)).toBe(false);
      expect(m.observation).toContain("ことがある"); // 事実型（傾向「〜やすい」でない）
      expect(m.observation).not.toContain("やすい傾向"); // semantic と混同しない
    }
  });
});

describe("R1-4 learningEventsToEpisodicMemory — collapse + 決定的順序", () => {
  it("同一 (band×action) を occurrence count へ collapse（重複 item を作らない）", () => {
    const items = learningEventsToEpisodicMemory([
      row({ band: "evening", action: "dismiss" }),
      row({ band: "evening", action: "dismiss", desired_date: "2026-05-20" }),
      row({ band: "evening", action: "dismiss", desired_date: "2026-05-21" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].evidenceCount).toBe(3);
    expect(items[0].certainty).toBe("tentative"); // 複数回 → recall salience（cap で high 不可）
    expect(items[0].context).toEqual({ dimension: "band", value: "evening" });
  });

  it("band/action が異なれば別 item", () => {
    const items = learningEventsToEpisodicMemory([
      row({ band: "morning", action: "accept" }),
      row({ band: "evening", action: "dismiss" }),
    ]);
    expect(items).toHaveLength(2);
  });

  it("出力は band(morning→afternoon→evening→none)×action(accept→dismiss→later) の固定順", () => {
    const items = learningEventsToEpisodicMemory([
      row({ band: "evening", action: "later" }),
      row({ band: "morning", action: "dismiss" }),
      row({ band: "morning", action: "accept" }),
      row({ band: null, action: "accept" }),
    ]);
    expect(items.map((m) => `${m.context.value}:${m.observation.includes("取り入れた") ? "accept" : m.observation.includes("見送った") ? "dismiss" : "later"}`)).toEqual([
      "morning:accept",
      "morning:dismiss",
      "evening:later",
      "none:accept",
    ]);
  });

  it("不正 action row は skip（loose row 耐性）", () => {
    const items = learningEventsToEpisodicMemory([
      row({ action: "accept" }),
      row({ action: "bogus" as CandidateActionKind }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].observation).toContain("取り入れた");
  });

  it("空入力 → 空", () => {
    expect(learningEventsToEpisodicMemory([])).toEqual([]);
  });

  it("全 item の observation は非断定・counterCount=0", () => {
    const items = learningEventsToEpisodicMemory([
      row({ band: "morning", action: "accept" }),
      row({ band: "afternoon", action: "later" }),
      row({ band: null, action: "dismiss" }),
    ]);
    for (const m of items) {
      expect(memoryObservationHasViolation(m.observation)).toBe(false);
      expect(m.counterCount).toBe(0);
      expect(m.kind).toBe("episodic");
      expect(m.source).toBe("prm_learning_event");
    }
  });
});
