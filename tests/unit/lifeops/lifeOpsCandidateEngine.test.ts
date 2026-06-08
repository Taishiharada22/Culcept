/**
 * Life Ops L-3 — Candidate Engine（pure・CEO 承認: beyond_typical 以上のみ・テスト注入）。
 *   候補化閾値・MVP外/未定義skip・L-1からの写し・dueReason=cycle・suggestedWindow=null・逼迫順・横非接続。
 */
import { describe, it, expect } from "vitest";
import {
  generateLifeOpsCandidates,
  type CadenceObservation,
} from "@/lib/lifeops/candidate-engine";

const NOW = "2026-06-12T00:00:00Z";

// cut(42日): 2026-04-01→72日(ratio1.71)=well_beyond / color(56日): 2026-05-01→42日(0.75)=within / eyebrow(28日): 2026-05-10→33日(1.18)=beyond
const obsCutWellBeyond: CadenceObservation = { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-01" };
const obsColorWithin: CadenceObservation = { categoryId: "beauty_salon", menu: "color", lastCompletedAtISO: "2026-05-01" };
const obsEyebrowBeyond: CadenceObservation = { categoryId: "eyebrow", lastCompletedAtISO: "2026-05-10" };

describe("L-3 候補化閾値（beyond_typical 以上のみ・CEO 承認）", () => {
  it("beyond_typical / well_beyond は候補化・within_typical は出さない", () => {
    const out = generateLifeOpsCandidates([obsCutWellBeyond, obsColorWithin, obsEyebrowBeyond], NOW);
    const keys = out.map((c) => `${c.category}:${c.menu ?? ""}`);
    expect(keys).toContain("beauty_salon:cut"); // well_beyond
    expect(keys).toContain("eyebrow:"); // beyond_typical
    expect(keys).not.toContain("beauty_salon:color"); // within_typical
  });
  it("履歴なし(unknown)は候補にしない（断定しない）", () => {
    expect(generateLifeOpsCandidates([{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: null }], NOW)).toEqual([]);
  });
  it("nearing は出さない（35日=ratio0.83・閾値未満）", () => {
    // cut 42日 × 0.83 ≈ 35日 → nearing
    const out = generateLifeOpsCandidates([{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-05-08" }], NOW);
    expect(out).toEqual([]);
  });
});

describe("L-3 skip（MVP外 cadence / L-1 未定義）", () => {
  it("MVP外 cadence（nail・treatment）は skip", () => {
    const out = generateLifeOpsCandidates(
      [
        { categoryId: "nail", lastCompletedAtISO: "2026-01-01" }, // cadence MVP外
        { categoryId: "beauty_salon", menu: "treatment", lastCompletedAtISO: "2026-01-01" }, // treatment cadence なし
      ],
      NOW,
    );
    expect(out).toEqual([]);
  });
  it("未知カテゴリは skip", () => {
    expect(generateLifeOpsCandidates([{ categoryId: "unknown_xyz", lastCompletedAtISO: "2026-01-01" }], NOW)).toEqual([]);
  });
});

describe("L-3 candidate 内容（L-1 から写す・§4 契約）", () => {
  it("placeQuery/permissionLevelHint/riskFlags は L-1 spec から・dueReason=cycle・suggestedWindow=null", () => {
    const [cut] = generateLifeOpsCandidates([obsCutWellBeyond], NOW);
    expect(cut.category).toBe("beauty_salon");
    expect(cut.menu).toBe("cut");
    expect(cut.placeQuery).toBe("美容室");
    expect(cut.permissionLevelHint).toBe("L3");
    expect(cut.riskFlags).toEqual(expect.arrayContaining(["appearance_change", "nomination", "personal_info"]));
    expect(cut.dueReason.kind).toBe("cycle");
    expect(cut.dueReason.elapsedDays).toBe(72);
    expect(cut.dueReason.typicalIntervalDays).toBe(42);
    expect(cut.dueReason.phase).toBe("well_beyond");
    expect(cut.suggestedWindow).toBeNull(); // L-3 は窓を決めない（横 R2）
  });
});

describe("L-3 逼迫順ソート（決定的）", () => {
  it("well_beyond が beyond_typical より先", () => {
    const out = generateLifeOpsCandidates([obsEyebrowBeyond, obsCutWellBeyond], NOW); // 入力は beyond, well_beyond の順
    expect(out[0].dueReason.phase).toBe("well_beyond"); // 並べ替えで well_beyond 先頭
    expect(out[1].dueReason.phase).toBe("beyond_typical");
  });
  it("同 phase は経過比 降順", () => {
    // どちらも beyond_typical だが eyebrow(33/28=1.18) > color相当を作る: cut 2026-04-25→48日/42=1.14
    const a: CadenceObservation = { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-25" }; // 48日 ratio1.14 beyond
    const out = generateLifeOpsCandidates([a, obsEyebrowBeyond], NOW);
    expect(out.every((c) => c.dueReason.phase === "beyond_typical")).toBe(true);
    expect(out[0].category).toBe("eyebrow"); // 1.18 > 1.14
  });
});

describe("L-3 空・冪等", () => {
  it("空入力 → 空", () => expect(generateLifeOpsCandidates([], NOW)).toEqual([]));
  it("同入力は同出力（pure・deterministic）", () => {
    const inp = [obsCutWellBeyond, obsEyebrowBeyond];
    expect(generateLifeOpsCandidates(inp, NOW)).toEqual(generateLifeOpsCandidates(inp, NOW));
  });
});
