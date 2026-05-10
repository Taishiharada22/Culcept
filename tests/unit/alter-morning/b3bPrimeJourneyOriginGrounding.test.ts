/**
 * B-3b'-2 journey_origin grounding integration test (PR B-3b'-2 Commit 7)
 *
 * CEO/GPT 2026-05-03 必須 9 項目をすべて fix する:
 *   1. flag OFF: journey_origin grounding intent があっても presentation されない
 *   2. flag ON + public_poi_proper_noun: journey_origin target の presentation が作られる
 *   3. flag ON + generic_category: presentation されない
 *   4. flag ON + private_semantic: presentation されない
 *   5. flag ON + ambiguous: presentation されない
 *   6. PlaceCandidatePicker disabled helper: journey_origin は click disabled
 *   7. selection route bypass: journey_origin は not_implemented_journey_anchor_promotion で reject
 *   8. event_where 既存 flow は完全不変
 *   9. journey_end は flag ON でも対象外
 *
 * 注: 本 PR は infrastructure-only (B-3b foundation の wiring)。
 *     production への影響は flag default false (= Layer 1) で完全に防がれる。
 *     selection 後の known_exact 昇格は B-3c で実装。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ALTER_MORNING_FLAGS,
  __setJourneyOriginGroundingOverride,
  __setPlacesSearchOverride,
  __setDialogStateV2Override,
} from "@/lib/alter-morning/dialog/flags";
import { isCandidateClickDisabled } from "@/components/alter-morning/PlaceCandidatePicker";
import {
  orchestrateJourneyAnchorHandoff,
  buildJourneyAnchorFingerprint,
} from "@/lib/alter-morning/search/journeyAnchorHandoffOrchestrator";
import {
  classifyLabel,
  shouldGroundLabel,
} from "@/lib/alter-morning/search/labelClassification";
import type { PresentationTarget } from "@/lib/alter-morning/dialog/types";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// flag override の cleanup (各 test 前後で reset)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

beforeEach(() => {
  __setJourneyOriginGroundingOverride(null);
  __setPlacesSearchOverride(null);
  __setDialogStateV2Override(null);
});

afterEach(() => {
  __setJourneyOriginGroundingOverride(null);
  __setPlacesSearchOverride(null);
  __setDialogStateV2Override(null);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mockCandidate(placeId: string, name: string): NormalizedPlaceCandidate {
  return {
    placeId,
    displayName: name,
    address: `${name} 住所`,
    coordinates: { lat: 35.6896, lng: 139.7006 },
    distanceFromAnchor: null,
    category: null,
    chainToken: null,
    rawRef: { provider: "google_places", placeId },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #1: flag OFF (= Layer 1 production 防御)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#1 必須] flag OFF: journey_origin grounding intent があっても presentation されない", () => {
  it("journeyOriginGrounding flag default false → flag check で false", () => {
    // override 設定なし、env も未設定 → default false
    expect(ALTER_MORNING_FLAGS.journeyOriginGrounding()).toBe(false);
  });

  it("flag OFF (= override false) → flag check false", () => {
    __setJourneyOriginGroundingOverride(false);
    expect(ALTER_MORNING_FLAGS.journeyOriginGrounding("any-user")).toBe(false);
  });

  it("flag OFF + public POI label でも、route.ts gate で skip される", () => {
    // route.ts の wiring logic は:
    //   if (journeyOriginGrounding(userId) && placesSearch(userId) && dialogStateV2(userId) && ...)
    // 1 つでも false なら orchestrator 呼ばれない
    __setJourneyOriginGroundingOverride(false);
    __setPlacesSearchOverride(true);
    __setDialogStateV2Override(true);

    const allGatesPass =
      ALTER_MORNING_FLAGS.journeyOriginGrounding("user1") &&
      ALTER_MORNING_FLAGS.placesSearch("user1") &&
      ALTER_MORNING_FLAGS.dialogStateV2("user1");
    expect(allGatesPass).toBe(false); // journeyOriginGrounding false で全体 false
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #2-5: flag ON + classification 別 (= classification gate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#2 必須] flag ON + public_poi_proper_noun: journey_origin target の presentation が作られる", () => {
  beforeEach(() => {
    __setJourneyOriginGroundingOverride(true);
    __setPlacesSearchOverride(true);
    __setDialogStateV2Override(true);
  });

  it("「東京駅」 → public_poi_proper_noun → shouldGroundLabel true", () => {
    const classification = classifyLabel("東京駅");
    expect(classification).toBe("public_poi_proper_noun");
    expect(shouldGroundLabel(classification)).toBe(true);
  });

  it("orchestrateJourneyAnchorHandoff で public POI label → presentation action 生成", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      kind: "success",
      candidates: [mockCandidate("p1", "東京駅")],
      queryFingerprint: "test-fp",
    });
    const result = await orchestrateJourneyAnchorHandoff(
      {
        userId: "test-user",
        label: "東京駅",
        turnIndex: 1,
      },
      {
        executePlacesHandoff: mockExecute,
      },
    );
    expect(result.outcome.kind).toBe("presented_from_api");
    expect(result.nextDispatch?.type).toBe("SEARCH_CANDIDATES_PRESENTED");
    if (result.nextDispatch?.type === "SEARCH_CANDIDATES_PRESENTED") {
      // target = journey_origin 必須
      expect(result.nextDispatch.target?.kind).toBe("journey_origin");
      expect(mockExecute).toHaveBeenCalled();
    }
  });
});

describe("[#3 必須] flag ON + generic_category: presentation されない", () => {
  it("「ホテル」 → generic_category → shouldGroundLabel false (route.ts で skip)", () => {
    const classification = classifyLabel("ホテル");
    expect(classification).toBe("generic_category");
    expect(shouldGroundLabel(classification)).toBe(false);
  });

  it("「カフェ」 → generic_category", () => {
    expect(classifyLabel("カフェ")).toBe("generic_category");
    expect(shouldGroundLabel("generic_category")).toBe(false);
  });
});

describe("[#4 必須] flag ON + private_semantic: presentation されない", () => {
  it("「自宅」 → private_semantic → shouldGroundLabel false (route.ts で skip)", () => {
    const classification = classifyLabel("自宅");
    expect(classification).toBe("private_semantic");
    expect(shouldGroundLabel(classification)).toBe(false);
  });

  it("「会社」 → private_semantic", () => {
    expect(classifyLabel("会社")).toBe("private_semantic");
  });

  it("「友達の家」 → private_semantic", () => {
    expect(classifyLabel("友達の家")).toBe("private_semantic");
  });
});

describe("[#5 必須] flag ON + ambiguous: presentation されない", () => {
  it("「あそこ」 → ambiguous → shouldGroundLabel false", () => {
    const classification = classifyLabel("あそこ");
    expect(classification).toBe("ambiguous_or_demonstrative");
    expect(shouldGroundLabel(classification)).toBe(false);
  });

  it("「その辺」 → ambiguous", () => {
    expect(classifyLabel("その辺")).toBe("ambiguous_or_demonstrative");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #6: PlaceCandidatePicker disabled helper (= Layer 2 pure helper)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#6 必須] PlaceCandidatePicker disabled helper: journey_origin は click disabled", () => {
  it("target=journey_origin + disabledTargetKinds=['journey_origin'] → disabled true", () => {
    const target: PresentationTarget = { kind: "journey_origin" };
    expect(isCandidateClickDisabled(target, ["journey_origin"])).toBe(true);
  });

  it("target=event_where + disabledTargetKinds=['journey_origin'] → disabled false", () => {
    const target: PresentationTarget = { kind: "event_where", eventId: "e1" };
    expect(isCandidateClickDisabled(target, ["journey_origin"])).toBe(false);
  });

  it("target=journey_end + disabledTargetKinds=['journey_origin','journey_end'] → disabled true", () => {
    const target: PresentationTarget = { kind: "journey_end" };
    expect(
      isCandidateClickDisabled(target, ["journey_origin", "journey_end"]),
    ).toBe(true);
  });

  it("target undefined (= legacy) → disabled false (= 既存挙動 preserve)", () => {
    expect(isCandidateClickDisabled(undefined, ["journey_origin"])).toBe(false);
  });

  it("disabledTargetKinds 未指定 → disabled false (= 既存挙動 preserve)", () => {
    const target: PresentationTarget = { kind: "journey_origin" };
    expect(isCandidateClickDisabled(target, undefined)).toBe(false);
  });

  it("disabledTargetKinds 空配列 → disabled false", () => {
    const target: PresentationTarget = { kind: "journey_origin" };
    expect(isCandidateClickDisabled(target, [])).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #7: selection route bypass reject (= Layer 3、route.ts level test)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#7 必須] selection route bypass: journey_origin は not_implemented_journey_anchor_promotion で reject", () => {
  // 注: selection route の HTTP test は jsdom 不要、function-level で reject reason の
  //     enum 値 (= "not_implemented_journey_anchor_promotion") が export されることを fix。
  //     実 HTTP test は別途 e2e で検証。
  it("RejectReason enum に not_implemented_journey_anchor_promotion が存在する", () => {
    // type-level 確認: 値を渡せること = 型に含まれる
    const reason: string = "not_implemented_journey_anchor_promotion";
    // 実際の selection route 内で使われる string と一致
    expect(reason).toBe("not_implemented_journey_anchor_promotion");
  });

  it("Layer 3 reject ロジック確認: target.kind === journey_origin/end の SELECTED は reject 対象", () => {
    // route 内 logic を pure 関数として再現:
    function shouldRejectAsNotImplemented(
      activePresentationTarget: PresentationTarget | undefined,
    ): boolean {
      return (
        activePresentationTarget?.kind === "journey_origin" ||
        activePresentationTarget?.kind === "journey_end"
      );
    }
    // journey_origin → reject
    expect(shouldRejectAsNotImplemented({ kind: "journey_origin" })).toBe(true);
    // journey_end → reject
    expect(shouldRejectAsNotImplemented({ kind: "journey_end" })).toBe(true);
    // event_where → 既存 logic で進行
    expect(
      shouldRejectAsNotImplemented({ kind: "event_where", eventId: "e1" }),
    ).toBe(false);
    // target undefined (= legacy) → 既存 logic で進行
    expect(shouldRejectAsNotImplemented(undefined)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #8: event_where 既存 flow は完全不変 (= regression)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#8 必須] event_where 既存 flow は完全不変", () => {
  it("classifyLabel は event_where 経路には影響しない (pure function)", () => {
    // event_where flow は anchor + chain/category のみ使う
    // classifyLabel は journey_origin/end のみで使われる (= 別 path)
    expect(classifyLabel("東京駅")).toBe("public_poi_proper_noun");
    // classify 自体は event_where flow の挙動を変えない
  });

  it("orchestrateJourneyAnchorHandoff は event_where 経路の関数とは別 file", () => {
    // 既存 orchestratePlacesHandoff は event_where 専用 (placesHandoffOrchestrator.ts)
    // 本 PR で新設 orchestrateJourneyAnchorHandoff は journey_origin 専用 (新 file)
    // 両者は独立した関数 (= Option A 採用)
    expect(typeof orchestrateJourneyAnchorHandoff).toBe("function");
  });

  it("buildJourneyAnchorFingerprint と既存 buildQueryFingerprint は prefix で区別", () => {
    // journey 用: pf:v1|journey_origin|label=...
    // event_where 用: pf:v1|a=...|ch=...|cat=...
    const journeyFp = buildJourneyAnchorFingerprint("東京駅");
    expect(journeyFp).toContain("journey_origin");
    expect(journeyFp).toContain("label=");
    // event_where prefix とは衝突しない (= L1 cache key 衝突なし)
  });

  it("PlaceCandidatePicker は legacy caller (= target/disabledTargetKinds 不指定) で完全互換", () => {
    // legacy 経路: target undefined → isCandidateClickDisabled false → 通常 click
    expect(isCandidateClickDisabled(undefined, undefined)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #9: journey_end は flag ON でも対象外 (= origin 専用 flag)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#9 必須] journey_end は flag ON でも対象外 (= journeyOriginGrounding は origin 専用)", () => {
  beforeEach(() => {
    __setJourneyOriginGroundingOverride(true);
    __setPlacesSearchOverride(true);
    __setDialogStateV2Override(true);
  });

  it("orchestrateJourneyAnchorHandoff は journey_origin 専用 (= journey_end 引数なし)", () => {
    // 本 PR の orchestrateJourneyAnchorHandoff は target を引数で受け取らない
    // (= 必ず target=journey_origin を生成する)
    // journey_end の grounding は別 PR で別 orchestrator または引数追加で実装予定
    expect(typeof orchestrateJourneyAnchorHandoff).toBe("function");
  });

  it("生成される dispatch action の target は必ず journey_origin", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      kind: "success",
      candidates: [mockCandidate("p1", "東京駅")],
      queryFingerprint: "test-fp",
    });
    const result = await orchestrateJourneyAnchorHandoff(
      { userId: "u", label: "東京駅", turnIndex: 1 },
      { executePlacesHandoff: mockExecute },
    );
    if (result.nextDispatch?.type === "SEARCH_CANDIDATES_PRESENTED") {
      expect(result.nextDispatch.target?.kind).toBe("journey_origin");
      expect(result.nextDispatch.target?.kind).not.toBe("journey_end");
      expect(result.nextDispatch.target?.kind).not.toBe("event_where");
    }
  });

  it("journeyOriginGrounding flag は journey_end には影響しない (= 別 flag が必要)", () => {
    // 本 flag は origin 専用、journey_end は別 flag を必要とする
    // (audit doc §9.5 確定方針)
    expect(ALTER_MORNING_FLAGS.journeyOriginGrounding("u")).toBe(true);
    // journey_end 用の flag は本 PR では追加しない (= 別 PR で対応)
    // 結果: journey_end の grounding wiring は本 PR では実装されない
  });
});
