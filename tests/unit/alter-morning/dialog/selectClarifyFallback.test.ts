/**
 * selectClarifyFallback — W3-PR-8 rev 3 commit 23 unit tests
 *
 * 目的:
 *   phase=clarifying && items=0 の user 画面直前 gate を 6 シナリオで固定する。
 *
 * CEO 条件（2026-04-22 commit 23）:
 *   - phase authority は変更しない（helper は message 差し替え提案のみ）
 *   - plan.items は触らない
 *   - 世界観: 短く柔らかく断定しない
 *   - S5/S6 等「正常進行 / plan_presented」は不介入
 */

import { describe, expect, test } from "vitest";
import {
  selectClarifyFallback,
  type SelectClarifyFallbackParams,
} from "@/lib/alter-morning/dialog/selectClarifyFallback";
import type { SearchQueryDraft } from "@/lib/alter-morning/dialog/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkDraft(
  overrides: Partial<SearchQueryDraft> = {},
): SearchQueryDraft {
  return {
    anchorRegion: null,
    categoryToken: null,
    chainToken: null,
    readyForHandoff: false,
    ...overrides,
  };
}

function mkParams(
  overrides: Partial<SelectClarifyFallbackParams> = {},
): SelectClarifyFallbackParams {
  return {
    utterance: "",
    draft: mkDraft(),
    targetSlot: "where",
    priorQuestion: "どこに行きたい？",
    bindReason: null,
    currentMessage: "どこに行きたい？",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Branch A — undecided user 応答
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectClarifyFallback — Branch A (undecided)", () => {
  // ─ S1: カフェ→甲府→まだ決めてない ──────────────────────────────────
  test("S1. anchor あり + category あり + undecided → 候補誘導", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "まだ決めてない",
        draft: mkDraft({
          anchorRegion: "甲府",
          categoryToken: "カフェ",
        }),
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("undecided_anchor_and_spec");
    expect(r.nextMessage).toBeTruthy();
    expect(r.nextMessage).toContain("甲府");
    expect(r.nextMessage).toContain("カフェ");
    // 同文 verbatim 再提示ではない
    expect(r.nextMessage).not.toBe("どこに行きたい？");
  });

  test("S1b. chain が category を勝つ（specificity）", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "未定",
        draft: mkDraft({
          anchorRegion: "甲府",
          categoryToken: "カフェ",
          chainToken: "スタバ",
        }),
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.nextMessage).toContain("スタバ");
    // chain 優先 → category は message に出ない
    expect(r.nextMessage).not.toContain("カフェ");
  });

  // ─ S2: カフェ→まだ決めてない（anchor なし） ───────────────────────
  test("S2. category あり + anchor なし + undecided → anchor を聞く", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "まだ決めてない",
        draft: mkDraft({
          categoryToken: "ランチ",
        }),
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("undecided_spec_needs_anchor");
    expect(r.nextMessage).toContain("ランチ");
    expect(r.nextMessage).toMatch(/エリア|どこ|近/);
  });

  // ─ A3: anchor あり + spec なし ─────────────────────────────────────
  test("A3. anchor あり + spec なし + undecided → spec を聞く", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "任せる",
        draft: mkDraft({
          anchorRegion: "吉祥寺",
        }),
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("undecided_anchor_needs_spec");
    expect(r.nextMessage).toContain("吉祥寺");
  });

  // ─ S3: 初手で undecided（draft 空） ────────────────────────────────
  test("S3. empty draft + undecided (initial) → 戦略切替", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "まだ決めてない",
        draft: mkDraft(),
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("undecided_empty_draft");
    expect(r.nextMessage).toBeTruthy();
    // 「決めなくていい」「大丈夫」系の柔らかい言葉を期待
    expect(r.nextMessage).toMatch(/大丈夫|いい/);
  });

  test("A. draft が null でも undecided は動く（shadow 未通過セーフガード）", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "未定",
        draft: null,
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("undecided_empty_draft");
  });

  test("A. UNDECIDED_DICT の複数 token で同じ結果", () => {
    const tokens = ["決めてない", "未定", "まだ", "特にない", "わからない"];
    for (const u of tokens) {
      const r = selectClarifyFallback(mkParams({ utterance: u }));
      expect(r.shouldReplace).toBe(true);
      expect(r.reason).toMatch(/^undecided_/);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Branch B — semantic_miss rephrase
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectClarifyFallback — Branch B (semantic_miss rephrase)", () => {
  // ─ S4: bind 不能 with targetSlot=where ────────────────────────────
  test("S4. semantic_miss + targetSlot=where → エリア系 rephrase", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "プール", // where に bind 不能
        bindReason: "semantic_miss",
        targetSlot: "where",
        priorQuestion: "どこに行きたい？",
        currentMessage: "どこに行きたい？",
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("semantic_miss_rephrase_where");
    expect(r.nextMessage).toMatch(/エリア|どこ/);
    expect(r.nextMessage).not.toBe("どこに行きたい？");
  });

  test("B. semantic_miss + targetSlot=when → 時間帯 rephrase", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "白",
        bindReason: "semantic_miss",
        targetSlot: "when",
        priorQuestion: "何時頃？",
        currentMessage: "何時頃？",
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("semantic_miss_rephrase_when");
    expect(r.nextMessage).toMatch(/朝|昼|夜|時間/);
  });

  test("B. semantic_miss + targetSlot=what → 気分 rephrase", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "8時",
        bindReason: "semantic_miss",
        targetSlot: "what",
        priorQuestion: "何する？",
        currentMessage: "何する？",
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("semantic_miss_rephrase_what");
    expect(r.nextMessage).toMatch(/気分/);
  });

  test("B. semantic_miss + targetSlot=null → priorQuestion から slot 推定", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "違う",
        bindReason: "semantic_miss",
        targetSlot: null,
        priorQuestion: "どこにする？",
        currentMessage: "どこにする？",
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("semantic_miss_rephrase_where");
  });

  test("B. semantic_miss + targetSlot=null + priorQuestion も判定不能 → generic", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "うーん",
        bindReason: "semantic_miss",
        targetSlot: null,
        priorQuestion: "それで？",
        currentMessage: "それで？",
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("semantic_miss_rephrase_generic");
    expect(r.nextMessage).toMatch(/手がかり|ごめん/);
  });

  test("B. priority: undecided は semantic_miss より先", () => {
    // classifyUtterance が undecided と判定する tokens は A で捕まる
    const r = selectClarifyFallback(
      mkParams({
        utterance: "まだ",
        bindReason: "semantic_miss", // B も該当
        targetSlot: "where",
      }),
    );
    // A が先に発火する
    expect(r.reason).toMatch(/^undecided_/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Branch C — anti-dupe（同文 verbatim 再提示の緩和）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectClarifyFallback — Branch C (anti-dupe)", () => {
  test("C. currentMessage === priorQuestion かつ undecided/semantic_miss 非該当 → 柔らかく添え直す", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "8時頃", // undecided でもなく
        bindReason: "ok", // semantic_miss でもない
        priorQuestion: "どこに行きたい？",
        currentMessage: "どこに行きたい？",
      }),
    );
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("anti_dupe_soften");
    expect(r.nextMessage).toContain("どこに行きたい？");
    expect(r.nextMessage).not.toBe("どこに行きたい？"); // 同一ではない
  });

  test("C. priorQuestion=null なら発火しない", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "こんにちは",
        bindReason: "ok",
        priorQuestion: null,
        currentMessage: "どこに行きたい？",
      }),
    );
    expect(r.shouldReplace).toBe(false);
    expect(r.reason).toBe("noop");
  });

  test("C. priorQuestion=空文字なら発火しない", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "こんにちは",
        bindReason: "ok",
        priorQuestion: "",
        currentMessage: "",
      }),
    );
    expect(r.shouldReplace).toBe(false);
  });

  test("C. currentMessage !== priorQuestion なら不介入", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "なるほど",
        bindReason: "ok",
        priorQuestion: "どこに行きたい？",
        currentMessage: "いいね。じゃあ甲府だね。", // 既に別メッセージ
      }),
    );
    expect(r.shouldReplace).toBe(false);
    expect(r.reason).toBe("noop");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Branch D — noop (S5 / S6 既存動作維持)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectClarifyFallback — Branch D (noop / 既存動作維持)", () => {
  // ─ S5: カフェ→甲府→スタバ の正常進行 ───────────────────────────
  test("S5. 正常 chain 応答 (スタバ) → 不介入", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "スタバ",
        bindReason: "ok",
        priorQuestion: "甲府のどこ？",
        currentMessage: "甲府のスタバで探そうか？", // 既に前進したメッセージ
        draft: mkDraft({
          anchorRegion: "甲府",
          categoryToken: "カフェ",
          chainToken: "スタバ",
        }),
      }),
    );
    expect(r.shouldReplace).toBe(false);
    expect(r.reason).toBe("noop");
  });

  // ─ S6: phase=plan_presented（呼び出し側 gate で除外する想定） ──
  //  本 helper は gate を見ないが、bindReason=ok + currentMessage≠priorQuestion
  //  の組み合わせなら noop に落ちることを確認。
  test("S6. plan_presented 相当の input（=既に前進） → 不介入", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "9時に甲府のサドヤで",
        bindReason: "ok",
        priorQuestion: "時間帯は？",
        currentMessage: "9時にサドヤでコーヒーだね。",
      }),
    );
    expect(r.shouldReplace).toBe(false);
  });

  test("D. bindReason=null + undecided 非該当 → noop", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "わくわくする",
        bindReason: null,
        priorQuestion: "どこ？",
        currentMessage: "じゃあ考えてみよう。",
      }),
    );
    expect(r.shouldReplace).toBe(false);
  });

  test("D. 空発話 + currentMessage !== priorQuestion → noop", () => {
    const r = selectClarifyFallback(
      mkParams({
        utterance: "",
        bindReason: null,
        priorQuestion: "どこ？",
        currentMessage: "別のメッセージ",
      }),
    );
    expect(r.shouldReplace).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 世界観: メッセージ形状の下限保証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectClarifyFallback — voice / 世界観", () => {
  test("差し替えメッセージは markdown / 絵文字を含まない", () => {
    const cases = [
      mkParams({ utterance: "まだ決めてない", draft: mkDraft({ anchorRegion: "甲府", categoryToken: "カフェ" }) }),
      mkParams({ utterance: "未定", draft: mkDraft({ categoryToken: "カフェ" }) }),
      mkParams({ utterance: "わからない", draft: mkDraft({ anchorRegion: "新宿" }) }),
      mkParams({ utterance: "まだ" }),
      mkParams({ utterance: "プール", bindReason: "semantic_miss", targetSlot: "where" }),
      mkParams({ utterance: "8時", bindReason: "semantic_miss", targetSlot: "when" }),
    ];
    for (const p of cases) {
      const r = selectClarifyFallback(p);
      expect(r.shouldReplace).toBe(true);
      const m = r.nextMessage!;
      expect(m).not.toMatch(/[*_#`]/); // markdown metachar
      // よく出る絵文字の UTF-16 範囲をざっくり弾く（厳密でなくてよい）
      expect(m).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
      expect(m.length).toBeGreaterThan(0);
      expect(m.length).toBeLessThan(60); // 世界観: 短く
    }
  });

  test("reason は英数字と _ のみ（log ローテに優しい）", () => {
    const cases = [
      mkParams({ utterance: "まだ" }),
      mkParams({ utterance: "プール", bindReason: "semantic_miss", targetSlot: "where" }),
      mkParams({ utterance: "あ", priorQuestion: "どこ？", currentMessage: "どこ？", bindReason: "ok" }),
      mkParams({ utterance: "ok", bindReason: "ok", priorQuestion: "どこ？", currentMessage: "別" }),
    ];
    for (const p of cases) {
      const r = selectClarifyFallback(p);
      expect(r.reason).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// purity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectClarifyFallback — purity", () => {
  test("同入力 2 回で同結果", () => {
    const p = mkParams({
      utterance: "まだ",
      draft: mkDraft({ anchorRegion: "甲府", categoryToken: "カフェ" }),
    });
    const r1 = selectClarifyFallback(p);
    const r2 = selectClarifyFallback(p);
    expect(r1).toEqual(r2);
  });

  test("入力 draft を mutate しない", () => {
    const draft = mkDraft({
      anchorRegion: "甲府",
      categoryToken: "カフェ",
      readyForHandoff: true,
    });
    const snap = { ...draft };
    selectClarifyFallback(
      mkParams({ utterance: "まだ", draft }),
    );
    expect(draft).toEqual(snap);
  });
});
