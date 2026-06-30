// tests/unit/plan/postVisit/matchLedger.test.ts
// 評価OS ②-3: shadow Match Ledger（pairwise）の検証。
//   同一条件セルの相対比較で pairwise 導出・僅差は引き分け・place-pair 集約・leader は confidence 十分時のみ・
//   薄い=insufficient/null（断定しない）・PII 非保存・決定論。
import { describe, it, expect } from "vitest";
import {
  deriveShadowPairwise,
  buildMatchLedger,
  PAIRWISE_MARGIN_EPSILON,
} from "@/lib/plan/postVisit/matchLedger";
import { buildPostVisitObservation, type PostVisitObservation } from "@/lib/plan/postVisit/postVisitObservation";
import type { PostVisitContextSnapshot } from "@/lib/plan/postVisit/postVisitContext";

function cs(over: Partial<PostVisitContextSnapshot> = {}): PostVisitContextSnapshot {
  return { v: 1, sourceSurface: "calendar_past_anchor", timeOfDay: "midday", dayType: "weekday", gapBucket: "under_30", weatherKind: null, fatigue: null, companion: "solo", mobilityLoad: null, locationCategory: "cafe", ...over };
}
function obs(place: string, resp: "keep" | "conditional" | "not_today" | "no_more" | null, ctx?: PostVisitContextSnapshot | null): PostVisitObservation {
  return buildPostVisitObservation({ placeDescriptor: place, lens: "focus_work", trigger: "past_plan", response: resp, at: 1, ...(ctx !== undefined ? { contextSnapshot: ctx ?? undefined } : { contextSnapshot: cs() }) });
}
const keyOf = (place: string) => obs(place, "keep").placeKey;

describe("deriveShadowPairwise — 同一条件セルの相対比較", () => {
  it("★同 cell で fit 差が epsilon 超 → winner 導出", () => {
    const data = [obs("Good", "keep", cs()), obs("Bad", "no_more", cs())]; // 同 cell・1.0 vs 0.0
    const pw = deriveShadowPairwise(data);
    expect(pw.length).toBe(1);
    expect(pw[0]!.winnerKey).toBe(keyOf("Good"));
    expect(pw[0]!.loserKey).toBe(keyOf("Bad"));
    expect(pw[0]!.margin).toBeCloseTo(1.0);
  });
  it("★僅差（epsilon 以下）は引き分け＝導出しない", () => {
    const data = [obs("A", "keep", cs()), obs("B", "keep", cs())]; // 同値 1.0 vs 1.0
    expect(deriveShadowPairwise(data).length).toBe(0);
    expect(PAIRWISE_MARGIN_EPSILON).toBeGreaterThan(0);
  });
  it("★別 cell の2場所は比較しない（状態交絡を避ける）", () => {
    const data = [obs("Good", "keep", cs({ gapBucket: "under_30" })), obs("Bad", "no_more", cs({ gapBucket: "over_120" }))];
    expect(deriveShadowPairwise(data).length).toBe(0);
  });
  it("★文脈なし観測は比較に乗らない", () => {
    expect(deriveShadowPairwise([obs("A", "keep", null), obs("B", "no_more", null)]).length).toBe(0);
  });
});

describe("buildMatchLedger — place-pair 集約 + leader", () => {
  it("★勝ち越しが confidence 十分 → leader 立つ・evidence/state 整合", () => {
    // Good が 3 cell で Bad に勝つ
    const data = [
      obs("Good", "keep", cs({ timeOfDay: "morning" })), obs("Bad", "no_more", cs({ timeOfDay: "morning" })),
      obs("Good", "keep", cs({ timeOfDay: "midday" })), obs("Bad", "no_more", cs({ timeOfDay: "midday" })),
      obs("Good", "keep", cs({ timeOfDay: "evening" })), obs("Bad", "no_more", cs({ timeOfDay: "evening" })),
    ];
    const ledger = buildMatchLedger(data);
    expect(ledger.length).toBe(1);
    const e = ledger[0]!;
    expect(e.evidenceCount).toBe(3);
    expect(e.state).toBe("observed");
    expect(e.leader).toBe(keyOf("Good"));
    expect(e.confidence).toBeCloseTo(1.0); // 3-0
  });
  it("★1勝1敗（互角）→ leader=null（断定しない）", () => {
    const data = [
      obs("A", "keep", cs({ timeOfDay: "morning" })), obs("B", "no_more", cs({ timeOfDay: "morning" })), // A 勝ち
      obs("A", "no_more", cs({ timeOfDay: "evening" })), obs("B", "keep", cs({ timeOfDay: "evening" })),  // B 勝ち
    ];
    const e = buildMatchLedger(data)[0]!;
    expect(e.evidenceCount).toBe(2);
    expect(e.confidence).toBeCloseTo(0); // 1-1
    expect(e.leader).toBeNull();
    expect(e.state).toBe("tentative");
  });
  it("★比較ゼロ → 空配列（光らせない）", () => {
    expect(buildMatchLedger([obs("A", "keep")])).toEqual([]); // 1 場所のみ→比較不能
    expect(buildMatchLedger([])).toEqual([]);
  });
  it("★PII を保存しない（placeKey は opaque hash・生 place 名/住所が出ない）", () => {
    const data = [obs("ブルーボトル 江東区", "keep", cs()), obs("スタバ 渋谷区", "no_more", cs())];
    const json = JSON.stringify(buildMatchLedger(data));
    expect(json).not.toContain("ブルーボトル");
    expect(json).not.toContain("江東区");
    expect(json).not.toContain("渋谷");
  });
  it("★決定論（同入力→同出力・ranking 非依存）", () => {
    const data = [obs("A", "keep", cs()), obs("B", "no_more", cs())];
    expect(buildMatchLedger(data)).toEqual(buildMatchLedger(data));
  });
});

describe("buildMatchLedger — margin-weighted（改善）", () => {
  it("★count-tied でも決定的 margin 差で leader が立つ（旧 win-rate なら null）", () => {
    const data = [
      // morning: Good=keep(1.0) vs Bad=no_more(0.0) → Good 決定的 win（margin 1.0）
      obs("Good", "keep", cs({ timeOfDay: "morning" })),
      obs("Bad", "no_more", cs({ timeOfDay: "morning" })),
      // evening: Good=not_today(0.35) vs Bad=conditional(0.6) → Bad 僅差 win（margin 0.25）
      obs("Good", "not_today", cs({ timeOfDay: "evening" })),
      obs("Bad", "conditional", cs({ timeOfDay: "evening" })),
    ];
    const e = buildMatchLedger(data)[0]!;
    expect(e.evidenceCount).toBe(2);
    expect(e.aWins).toBe(1);
    expect(e.bWins).toBe(1); // count は互角
    expect(e.confidence).toBeCloseTo(0.6); // |1.0−0.25|/1.25
    expect(e.leader).toBe(keyOf("Good")); // 決定的勝者が leader
  });
});
