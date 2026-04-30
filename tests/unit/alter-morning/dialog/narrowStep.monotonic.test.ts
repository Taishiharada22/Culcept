/**
 * narrowStep 単調増加 + §1.2 table 機械検証 — W3-PR-8 rev 3 commit 18
 *
 * 位置づけ:
 *   reducer の narrowStep lift 契約を設計書 §1.2 table の全 row に対して
 *   愚直に機械検証する。commit 18 で「subKind step lookup」から
 *   「累積 newDraft から derive」に寄せ直した挙動を固定化する目的。
 *
 * 設計書:
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §1.2 Step 2 table
 *   - §11.1 シナリオ A T3（multi-turn lift の本丸）
 *   - §11.4 シナリオ D（初回短絡、0→2）
 *
 * 参照 table（§1.2 Step 2）:
 *   | 前 narrowStep | 変化後 | 条件 |
 *   |---|---|---|
 *   | 0 | 1 | `anchorAdvanced && !chainAdvanced && !categoryAdvanced` |
 *   | 0 | 2 | `(chainAdvanced || categoryAdvanced)` （anchor 有無不問、1 スキップ） |
 *   | 1 | 2 | `chainAdvanced || categoryAdvanced` |
 *   | 2 | 2 | chain/category 上書き（step 動かず） |
 *   | 任意 | 任意 | `progressDelta !== "advanced"` → 変更なし |
 *   | 任意 → 小 | Invariant violation | narrowStep regression は throw |
 *
 * CEO 条件（2026-04-22 commit 18）:
 *   - 設計書を現 reducer に合わせて下げない。reducer を §11.1 T3 に寄せる
 *   - capturedHistory を使って multi-turn 合成を成立させる
 *   - readyForHandoff=true と search_handoff_blocking の関係を一意にする
 *     （narrowStep=2 かつ readyForHandoff=true ⇔ search_handoff_blocking）
 */

import { describe, expect, it } from "vitest";
import { dialogReducer } from "@/lib/alter-morning/dialog/reducer";
import {
  createInitialDialogState,
  type DialogAction,
  type DialogState,
  type NormalizedCapture,
} from "@/lib/alter-morning/dialog/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テストヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkCapture(partial: Partial<NormalizedCapture>): NormalizedCapture {
  return {
    subKind: partial.subKind ?? "other",
    extractedAnchor: partial.extractedAnchor ?? null,
    extractedCategory: partial.extractedCategory ?? null,
    extractedChain: partial.extractedChain ?? null,
    rawSpan: partial.rawSpan ?? "",
  };
}

function mkTurn(
  turnIndex: number,
  capture: NormalizedCapture,
  eventId = "event_1",
): DialogAction {
  return {
    type: "TURN_CAPTURED",
    turnIndex,
    capturedAt: `2026-04-22T09:${String(turnIndex).padStart(2, "0")}:00Z`,
    capture,
    targetEventId: eventId,
    targetSlot: "where",
  };
}

function applyTurns(
  turns: ReadonlyArray<DialogAction>,
  initial: DialogState = createInitialDialogState(),
): DialogState {
  return turns.reduce((s, a) => dialogReducer(s, a), initial);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. §1.2 table 全 row を機械検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1.2 table — narrowStep 遷移", () => {
  // Row 1: 0 → 1 (anchor only)
  it("Row1 [0 → 1]: anchor_alone 初回（anchor のみ advance）", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(1);
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s.searchQueryDraft.chainToken).toBeNull();
    expect(s.searchQueryDraft.categoryToken).toBeNull();
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s.conversationStatus).toBe("narrowing");
  });

  // Row 2: 0 → 2 (chain or category, skip 1)
  it("Row2 [0 → 2]: chain_alone 初回（anchor なし、1 スキップ）— §11.4 D 初回短絡", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
    expect(s.searchQueryDraft.anchorRegion).toBeNull();
    expect(s.searchQueryDraft.readyForHandoff).toBe(false); // anchor 必須
    expect(s.conversationStatus).toBe("narrowing"); // step=2 でも ready=false なら narrowing
  });

  it("Row2 [0 → 2]: category_alone 初回（anchor なし、1 スキップ）", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.searchQueryDraft.categoryToken).toBe("カフェ");
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s.conversationStatus).toBe("narrowing");
  });

  it("Row2 [0 → 2]: chain_with_anchor 初回（chain+anchor 同時、readyForHandoff=true）", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
    // narrowStep=2 かつ readyForHandoff=true → search_handoff_blocking
    expect(s.conversationStatus).toBe("search_handoff_blocking");
  });

  // Row 3: 1 → 2 (chain/category after anchor) — rev 3 の本質
  it("Row3 [1 → 2]: anchor_alone → chain_alone の multi-turn lift（§11.1 A T3）", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      ),
      mkTurn(
        2,
        mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(2); // ★ lift
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
    expect(s.conversationStatus).toBe("search_handoff_blocking");
  });

  it("Row3 [1 → 2]: anchor_alone → category_alone の multi-turn lift", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      ),
      mkTurn(
        2,
        mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
    expect(s.conversationStatus).toBe("search_handoff_blocking");
  });

  // Row 4: 2 → 2 (overwrite)
  it("Row4 [2 → 2]: narrowStep=2 到達後、chain 上書きでも step は 2 維持", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      ),
      // 別の chain に上書き
      mkTurn(
        2,
        mkCapture({
          subKind: "chain_alone",
          extractedChain: "ドトール",
          rawSpan: "ドトール",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.searchQueryDraft.chainToken).toBe("ドトール"); // 上書き
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府"); // 保持
    expect(s.conversationStatus).toBe("search_handoff_blocking");
  });

  // Row 5: progressDelta !== "advanced" → step 維持（flat / undecided / other）
  it("Row5 [flat → 維持]: 同じ anchor 再発話は step 不変", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      ),
      mkTurn(
        2,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府", // 同値
          rawSpan: "甲府",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(1); // 維持
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
  });

  it("Row5 [undecided → 維持]: 「決めてない」は step を進めない", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      ),
      mkTurn(
        2,
        mkCapture({
          subKind: "undecided",
          rawSpan: "決めてない",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(1); // undecided では進まない
  });

  it("Row5 [other → 維持]: 分類不能発話は step 不変、semanticMissStreak++", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      ),
      mkTurn(
        2,
        mkCapture({
          subKind: "other",
          rawSpan: "あのさ",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(1);
    expect(s.semanticMissStreak).toBe(1);
  });

  // Row 6 (invariant): narrowStep regression
  it("Row6 [regression 禁止]: narrowStep=2 到達後、category_alone 後発で step=2 維持（逆行せず）", () => {
    // chain_with_anchor で step=2 到達後、category_alone 単独が来ても
    // chain が維持され category は exclusivity で捨てられ、step は 2 維持。
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      ),
      mkTurn(
        2,
        mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(2); // 逆行せず
    expect(s.searchQueryDraft.chainToken).toBe("スタバ"); // exclusivity で chain 維持
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. terminal subKind — proper_noun / baseline は step=3
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2 terminal subKind → narrowStep=3 + stable", () => {
  it("proper_noun_specific → step=3", () => {
    const s = applyTurns([
      mkTurn(1, mkCapture({ subKind: "proper_noun_specific", rawSpan: "サドヤ" })),
    ]);
    expect(s.focus?.narrowStep).toBe(3);
    expect(s.conversationStatus).toBe("stable");
  });

  it("baseline → step=3（自宅）", () => {
    const s = applyTurns([
      mkTurn(1, mkCapture({ subKind: "baseline", rawSpan: "自宅" })),
    ]);
    expect(s.focus?.narrowStep).toBe(3);
    expect(s.conversationStatus).toBe("stable");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. focus 切替時の narrowStep reset / 復元
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 focus 切替と narrowStep", () => {
  it("event_id 変更 → draft reset、narrowStep は新 capture 依存で再計算", () => {
    const s1 = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
        "event_1",
      ),
    ]);
    expect(s1.focus?.narrowStep).toBe(2);

    const s2 = applyTurns(
      [
        mkTurn(
          2,
          mkCapture({
            subKind: "anchor_alone",
            extractedAnchor: "東京",
            rawSpan: "東京",
          }),
          "event_2", // 別 event
        ),
      ],
      s1,
    );
    expect(s2.focus?.event_id).toBe("event_2");
    expect(s2.focus?.narrowStep).toBe(1); // event 切替で reset、anchor のみ advance
    expect(s2.searchQueryDraft.anchorRegion).toBe("東京");
    expect(s2.searchQueryDraft.chainToken).toBeNull(); // 前 event の chain は引き継がない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. readyForHandoff と search_handoff_blocking の一意対応
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 readyForHandoff ⇔ search_handoff_blocking の関係を一意にする", () => {
  it("narrowStep=2 かつ readyForHandoff=true → search_handoff_blocking（一意）", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
    expect(s.conversationStatus).toBe("search_handoff_blocking");
  });

  it("narrowStep=2 だが readyForHandoff=false → narrowing（handoff_blocking に入らない）", () => {
    // chain_alone 初回は step=2 だが anchor 欠落で readyForHandoff=false
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s.conversationStatus).toBe("narrowing"); // blocking ではなく narrowing
  });

  it("narrowStep<2 → readyForHandoff は常に false、blocking に入らない", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      ),
    ]);
    expect(s.focus?.narrowStep).toBe(1);
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s.conversationStatus).toBe("narrowing");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. capturedHistory を使った multi-turn 合成（CEO 条件）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5 capturedHistory に各ターンの capture が追記され、累積 draft と整合", () => {
  it("「甲府」→「スタバ」の 2 ターンで capturedHistory 2 件、draft は累積", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      ),
      mkTurn(
        2,
        mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      ),
    ]);
    expect(s.capturedHistory).toHaveLength(2);
    expect(s.capturedHistory[0]?.capture.extractedAnchor).toBe("甲府");
    expect(s.capturedHistory[1]?.capture.extractedChain).toBe("スタバ");
    // 累積 draft: anchor + chain
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
  });

  it("progressDelta が各エントリに記録される（advanced / flat / undecided）", () => {
    const s = applyTurns([
      mkTurn(
        1,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      ),
      mkTurn(
        2,
        mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府", // 同値 flat
          rawSpan: "甲府",
        }),
      ),
      mkTurn(
        3,
        mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      ),
    ]);
    expect(s.capturedHistory[0]?.progressDelta).toBe("advanced");
    expect(s.capturedHistory[1]?.progressDelta).toBe("flat");
    expect(s.capturedHistory[2]?.progressDelta).toBe("advanced");
  });
});
