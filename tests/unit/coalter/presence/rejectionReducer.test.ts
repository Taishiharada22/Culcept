/**
 * Stage 2 L2-j — 拒否 3 分類 reducer test
 *
 * plan v0.3 §5.10 Gate (4 シナリオ + §6.8 非判定性):
 *   ① mode 昇格拒否で mode_rejection cooldown を slot に記録
 *   ② 個別提案拒否で proposal_rejection cooldown を slot に記録
 *   ③ coalter 後退要求で intervention_retreat cooldown を slot に記録
 *      (NOTE: plan §5.10 test ③ は availability `disabled` 遷移と表記するが、
 *       UI spec §6.6.3 の正確な仕様は cooldown 設定のみ。availability は
 *       master §5 opt-out 経路で別管理。spec 整合で実装、§6.8 非判定性遵守)
 *   ④ 3 種拒否の混同なし (3 slot 独立 / state shape で構造的に保証)
 *
 * §6.8 非判定性:
 *   - state に「失敗」「悪い」boolean が存在しない
 *   - 拒否回数 (count) が state に記録されない (累積評価禁止)
 */

import { describe, it, expect } from "vitest";

import {
  rejectionReducer,
  initialRejectionState,
  flattenCooldowns,
  pruneRejectionState,
  type RejectionEvent,
  type RejectionState,
} from "@/lib/coalter/presence/rejectionReducer";

const NOW = 1_000_000;

// ─────────────────────────────────────────────
// ① mode 昇格拒否 (§6.6.1)
// ─────────────────────────────────────────────

describe("L2-j rejectionReducer — ① mode 昇格拒否 (§6.6.1)", () => {
  it("MODE_ESCALATION_REJECTED で modeEscalation slot に cooldown 追加", () => {
    const event: RejectionEvent = {
      type: "MODE_ESCALATION_REJECTED",
      rejectedMode: "daily",
      at: NOW,
    };
    const next = rejectionReducer(initialRejectionState(), event);
    expect(next.modeEscalation).toHaveLength(1);
    expect(next.modeEscalation[0].kind).toBe("mode_rejection");
    expect(next.modeEscalation[0].rejectedMode).toBe("daily");
  });

  it("他 slot は不変 (3 分類混同なし)", () => {
    const next = rejectionReducer(initialRejectionState(), {
      type: "MODE_ESCALATION_REJECTED",
      rejectedMode: "travel",
      at: NOW,
    });
    expect(next.individualProposal).toHaveLength(0);
    expect(next.coalterRetreat).toHaveLength(0);
  });

  it("durationMs override が反映される (cooldown 期限)", () => {
    const next = rejectionReducer(initialRejectionState(), {
      type: "MODE_ESCALATION_REJECTED",
      rejectedMode: "daily",
      at: NOW,
      durationMs: 60_000,
    });
    expect(next.modeEscalation[0].expiresAt).toBe(NOW + 60_000);
  });

  it("複数回拒否で複数 cooldown が並ぶ (重複記録、ただし回数は state に持たない)", () => {
    let s: RejectionState = initialRejectionState();
    s = rejectionReducer(s, {
      type: "MODE_ESCALATION_REJECTED",
      rejectedMode: "daily",
      at: NOW,
    });
    s = rejectionReducer(s, {
      type: "MODE_ESCALATION_REJECTED",
      rejectedMode: "travel",
      at: NOW + 1000,
    });
    expect(s.modeEscalation).toHaveLength(2);
    expect(s.modeEscalation.map((c) => c.rejectedMode)).toEqual(["daily", "travel"]);
  });
});

// ─────────────────────────────────────────────
// ② 個別提案拒否 (§6.6.2)
// ─────────────────────────────────────────────

describe("L2-j rejectionReducer — ② 個別提案拒否 (§6.6.2)", () => {
  it("PROPOSAL_REJECTED で individualProposal slot に cooldown 追加", () => {
    const next = rejectionReducer(initialRejectionState(), {
      type: "PROPOSAL_REJECTED",
      theme: "food",
      at: NOW,
    });
    expect(next.individualProposal).toHaveLength(1);
    expect(next.individualProposal[0].kind).toBe("proposal_rejection");
    expect(next.individualProposal[0].rejectedTheme).toBe("food");
  });

  it("他 slot は不変 (混同なし)", () => {
    const next = rejectionReducer(initialRejectionState(), {
      type: "PROPOSAL_REJECTED",
      theme: "movie",
      at: NOW,
    });
    expect(next.modeEscalation).toHaveLength(0);
    expect(next.coalterRetreat).toHaveLength(0);
  });

  it("複数テーマの拒否を独立記録", () => {
    let s = initialRejectionState();
    s = rejectionReducer(s, { type: "PROPOSAL_REJECTED", theme: "food", at: NOW });
    s = rejectionReducer(s, { type: "PROPOSAL_REJECTED", theme: "movie", at: NOW });
    expect(s.individualProposal).toHaveLength(2);
    expect(
      s.individualProposal.map((c) => c.rejectedTheme).sort(),
    ).toEqual(["food", "movie"]);
  });
});

// ─────────────────────────────────────────────
// ③ coalter 後退要求 (§6.6.3)
// ─────────────────────────────────────────────

describe("L2-j rejectionReducer — ③ coalter 後退要求 (§6.6.3)", () => {
  it("COALTER_RETREAT_REQUESTED で coalterRetreat slot に cooldown 追加", () => {
    const next = rejectionReducer(initialRejectionState(), {
      type: "COALTER_RETREAT_REQUESTED",
      at: NOW,
    });
    expect(next.coalterRetreat).toHaveLength(1);
    expect(next.coalterRetreat[0].kind).toBe("intervention_retreat");
  });

  it("他 slot は不変 (混同なし)", () => {
    const next = rejectionReducer(initialRejectionState(), {
      type: "COALTER_RETREAT_REQUESTED",
      at: NOW,
    });
    expect(next.modeEscalation).toHaveLength(0);
    expect(next.individualProposal).toHaveLength(0);
  });

  it("durationMs override で期間調整可能 (§6.6.3 「指定期間」)", () => {
    const next = rejectionReducer(initialRejectionState(), {
      type: "COALTER_RETREAT_REQUESTED",
      at: NOW,
      durationMs: 12 * 60 * 60 * 1000, // 12h
    });
    expect(next.coalterRetreat[0].expiresAt).toBe(NOW + 12 * 60 * 60 * 1000);
  });
});

// ─────────────────────────────────────────────
// ④ 3 種拒否の混同なし (構造的独立)
// ─────────────────────────────────────────────

describe("L2-j rejectionReducer — ④ 3 種混同なし (構造的独立)", () => {
  it("3 event を順に発火しても 3 slot に独立記録される", () => {
    let s = initialRejectionState();
    s = rejectionReducer(s, {
      type: "MODE_ESCALATION_REJECTED",
      rejectedMode: "daily",
      at: NOW,
    });
    s = rejectionReducer(s, {
      type: "PROPOSAL_REJECTED",
      theme: "food",
      at: NOW + 1000,
    });
    s = rejectionReducer(s, {
      type: "COALTER_RETREAT_REQUESTED",
      at: NOW + 2000,
    });
    expect(s.modeEscalation).toHaveLength(1);
    expect(s.individualProposal).toHaveLength(1);
    expect(s.coalterRetreat).toHaveLength(1);
  });

  it("flattenCooldowns で 3 slot を平坦化 (cooldownResolver 入力用)", () => {
    let s = initialRejectionState();
    s = rejectionReducer(s, {
      type: "MODE_ESCALATION_REJECTED",
      rejectedMode: "daily",
      at: NOW,
    });
    s = rejectionReducer(s, {
      type: "PROPOSAL_REJECTED",
      theme: "movie",
      at: NOW,
    });
    s = rejectionReducer(s, {
      type: "COALTER_RETREAT_REQUESTED",
      at: NOW,
    });
    const flat = flattenCooldowns(s);
    expect(flat).toHaveLength(3);
    expect(flat.map((c) => c.kind).sort()).toEqual([
      "intervention_retreat",
      "mode_rejection",
      "proposal_rejection",
    ]);
  });
});

// ─────────────────────────────────────────────
// §6.8 非判定性 (state に「失敗」「悪い」が現れない)
// ─────────────────────────────────────────────

describe("L2-j rejectionReducer — §6.8 非判定性 (state に判定的属性なし)", () => {
  it("RejectionState shape に boolean フラグ / count フィールドがない", () => {
    const s = initialRejectionState();
    // shape は 3 配列のみ。失敗 boolean / 拒否回数フィールドが存在しない
    const keys = Object.keys(s).sort();
    expect(keys).toEqual(["coalterRetreat", "individualProposal", "modeEscalation"]);
    // 各 slot は配列 (回数は length で表現するが state 内 number ではない)
    for (const slot of [s.modeEscalation, s.individualProposal, s.coalterRetreat]) {
      expect(Array.isArray(slot)).toBe(true);
    }
  });

  it("state に「failure」「rejected」「bad」のようなプロパティ名が存在しない", () => {
    const s = initialRejectionState();
    const flat = JSON.stringify(s);
    expect(flat).not.toMatch(/failure/i);
    expect(flat).not.toMatch(/"bad"/i);
    expect(flat).not.toMatch(/penaltyCount/i);
  });
});

// ─────────────────────────────────────────────
// pruneRejectionState (期限切れ除去)
// ─────────────────────────────────────────────

describe("L2-j rejectionReducer — pruneRejectionState", () => {
  it("各 slot で expiresAt <= now を除去", () => {
    const s: RejectionState = {
      modeEscalation: [
        { kind: "mode_rejection", expiresAt: NOW + 1000, rejectedMode: "daily" },
        { kind: "mode_rejection", expiresAt: NOW - 1000, rejectedMode: "travel" },
      ],
      individualProposal: [
        {
          kind: "proposal_rejection",
          expiresAt: NOW + 5000,
          rejectedTheme: "food",
        },
      ],
      coalterRetreat: [
        { kind: "intervention_retreat", expiresAt: NOW - 5000 },
      ],
    };
    const pruned = pruneRejectionState(s, NOW);
    expect(pruned.modeEscalation).toHaveLength(1);
    expect(pruned.modeEscalation[0].rejectedMode).toBe("daily");
    expect(pruned.individualProposal).toHaveLength(1);
    expect(pruned.coalterRetreat).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// initialRejectionState
// ─────────────────────────────────────────────

describe("L2-j rejectionReducer — initialRejectionState", () => {
  it("3 slot とも空配列", () => {
    const s = initialRejectionState();
    expect(s.modeEscalation).toHaveLength(0);
    expect(s.individualProposal).toHaveLength(0);
    expect(s.coalterRetreat).toHaveLength(0);
  });
});
