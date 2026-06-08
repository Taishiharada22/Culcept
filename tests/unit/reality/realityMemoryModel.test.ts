/**
 * R1-1 Memory Model（pure）— 5 種 taxonomy・certainty cap(high なし)・非断定 observation guard・buildMemoryItem 正規化。
 */
import { describe, it, expect } from "vitest";
import {
  MEMORY_TAXONOMY,
  capCertainty,
  memoryObservationHasViolation,
  buildMemoryItem,
  type MemoryKind,
} from "@/lib/plan/reality/learning/memory-model";

const KINDS: MemoryKind[] = ["episodic", "semantic", "procedural", "preference", "correction"];

describe("R1-1 MEMORY_TAXONOMY", () => {
  it("5 種すべてが PRM source 付きで定義されている", () => {
    for (const k of KINDS) {
      const spec = MEMORY_TAXONOMY[k];
      expect(spec.kind).toBe(k);
      expect(spec.sources.length).toBeGreaterThan(0);
      // 正本は PRM のみ（他軸を直接抱えない＝境界尊重）
      for (const s of spec.sources) expect(["prm_learning_event", "prm_review_decision", "prm_model_entry"]).toContain(s);
    }
  });
  it("procedural は専用ストアなし→M1+M2 合成（監査反映）", () => {
    expect(MEMORY_TAXONOMY.procedural.sources).toEqual(["prm_learning_event", "prm_review_decision"]);
  });
});

describe("R1-1 capCertainty — high を構造的に不可能化", () => {
  it("low/tentative は保持・high/不正は tentative に丸める", () => {
    expect(capCertainty("low")).toBe("low");
    expect(capCertainty("tentative")).toBe("tentative");
    expect(capCertainty("high")).toBe("tentative");
    expect(capCertainty("")).toBe("tentative");
    expect(capCertainty(undefined)).toBe("tentative");
    expect(capCertainty(42)).toBe("tentative");
  });
});

describe("R1-1 memoryObservationHasViolation — 断定/trait 検出", () => {
  it("非断定・文脈束縛はクリーン", () => {
    expect(memoryObservationHasViolation("夜の予定では見送りやすい傾向が見えている")).toBe(false);
  });
  it("断定・trait 語は違反", () => {
    expect(memoryObservationHasViolation("あなたは怠惰です")).toBe(true);
    expect(memoryObservationHasViolation("必ず見送る")).toBe(true);
    expect(memoryObservationHasViolation("性格的に無責任")).toBe(true);
  });
});

describe("R1-1 buildMemoryItem — 安全正規化", () => {
  it("certainty を cap・counts 非負・provenance 保持・default", () => {
    const m = buildMemoryItem({
      kind: "semantic",
      observation: "夜の予定では見送りやすい傾向",
      certainty: "high", // → tentative に丸める
      evidenceCount: 6,
      counterCount: -2, // → 0
      source: "prm_model_entry",
    });
    expect(m.certainty).toBe("tentative");
    expect(m.counterCount).toBe(0);
    expect(m.evidenceCount).toBe(6);
    expect(m.userConfirmed).toBe(false);
    expect(m.userCorrection).toBeNull();
    expect(m.context).toEqual({ dimension: null, value: null });
    expect(m.source).toBe("prm_model_entry");
  });
  it("確認/訂正/文脈を保持", () => {
    const m = buildMemoryItem({
      kind: "correction",
      observation: "本人が向きを調整した観測",
      context: { dimension: "band", value: "evening" },
      userConfirmed: true,
      userCorrection: "direction_adjusted",
      source: "prm_review_decision",
    });
    expect(m.userConfirmed).toBe(true);
    expect(m.userCorrection).toBe("direction_adjusted");
    expect(m.context).toEqual({ dimension: "band", value: "evening" });
    // 正規化後も内部 observation は非断定であること
    expect(memoryObservationHasViolation(m.observation)).toBe(false);
  });
});
