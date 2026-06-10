/**
 * R1-4 Episodic Memory（pure）— M1 learning event row → MemoryItem(episodic)。
 *   1 イベント=1 記憶・occurredAtISO=acted_at・action 動詞・certainty=low・非断定・不正 action skip。
 */
import { describe, it, expect } from "vitest";
import {
  learningEventToEpisodicMemory,
  learningEventsToEpisodicMemory,
} from "@/lib/plan/reality/learning/memory-episodic";
import { memoryObservationHasViolation } from "@/lib/plan/reality/learning/memory-model";
import type { PrmLearningEventReadRow } from "@/lib/plan/reality/learning/prm-learning-event-read";

function row(over: Partial<PrmLearningEventReadRow> = {}): PrmLearningEventReadRow {
  return {
    handle: "h1",
    action: "dismiss",
    desired_date: "2026-06-05",
    band: "evening",
    confidence_band: "medium",
    duration_min: 60,
    source_kind: "seed_explicit",
    acted_at: "2026-06-05T19:00:00.000Z",
    ...over,
  } as PrmLearningEventReadRow;
}

describe("R1-4 learningEventToEpisodicMemory", () => {
  it("episodic 記憶へ写す（occurredAtISO=acted_at・certainty=low・evidence=1・source）", () => {
    const m = learningEventToEpisodicMemory(row());
    expect(m.kind).toBe("episodic");
    expect(m.occurredAtISO).toBe("2026-06-05T19:00:00.000Z");
    expect(m.certainty).toBe("low");
    expect(m.evidenceCount).toBe(1);
    expect(m.counterCount).toBe(0);
    expect(m.source).toBe("prm_learning_event");
    expect(m.context).toEqual({ dimension: "band", value: "evening" });
  });
  it("action → 事実動詞（accept 取り入れた / dismiss 見送った / later 後回しにした）", () => {
    expect(learningEventToEpisodicMemory(row({ action: "accept" })).observation).toContain("取り入れた");
    expect(learningEventToEpisodicMemory(row({ action: "dismiss" })).observation).toContain("見送った");
    expect(learningEventToEpisodicMemory(row({ action: "later" })).observation).toContain("後回しにした");
  });
  it("observation は非断定・trait 語なし・文脈句を含む", () => {
    const m = learningEventToEpisodicMemory(row({ band: "evening" }));
    expect(memoryObservationHasViolation(m.observation)).toBe(false);
    expect(m.observation).toContain("夜の予定");
  });
  it("band null は文脈句 fallback・context.value=null", () => {
    const m = learningEventToEpisodicMemory(row({ band: null }));
    expect(m.context.value).toBeNull();
    expect(m.observation).toContain("ある場面");
  });
});

describe("R1-4 learningEventsToEpisodicMemory", () => {
  it("全件写す・不正 action は skip", () => {
    const out = learningEventsToEpisodicMemory([
      row({ action: "accept" }),
      row({ action: "dismiss" }),
      row({ action: "bogus" as PrmLearningEventReadRow["action"] }), // 不正 → skip
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((m) => m.kind === "episodic")).toBe(true);
  });
  it("★A-4-c10 先回り防御: handle 'lifeops:' 行は episodic 化しない（Life Ops は専用 adapter が読む）", () => {
    const out = learningEventsToEpisodicMemory([
      row({ action: "accept" }),
      row({ action: "accept", handle: "lifeops:beauty_salon:cut" }), // 将来の Life Ops feedback 行 → 混入させない
    ]);
    expect(out).toHaveLength(1);
  });
});
