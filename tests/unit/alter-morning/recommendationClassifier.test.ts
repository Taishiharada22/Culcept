/**
 * Recommendation Pre-Classifier テスト — W2-4 (CEO方針 2026-04-19)
 *
 * CEO 3 条件:
 *   (1) emit 条件を厳しくする: 純粋な提案要求だけを recommendation_request に落とす
 *   (2) pre-classifier を先に置く: 決定論で 4 分類
 *   (3) delta でも同じ意味論: 既存の explicit place を recommendation で上書きしない
 */

import { describe, test, expect } from "vitest";
import {
  classifyRecommendationIntent,
  toRecommendationIntent,
} from "@/lib/alter-morning/recommendationClassifier";

describe("W2-4 classifyRecommendationIntent — 純粋な提案要求", () => {
  test("『おすすめある？』 → recommendation_request", () => {
    const r = classifyRecommendationIntent("おすすめある？");
    expect(r.kind).toBe("recommendation_request");
    expect(r.signals.hasRecommendationPhrase).toBe(true);
    expect(r.signals.hasExplicitPlace).toBe(false);
  });

  test("『どこかいい所ない？』 → recommendation_request", () => {
    const r = classifyRecommendationIntent("どこかいい所ない？");
    expect(r.kind).toBe("recommendation_request");
  });

  test("『いい店ない？』 → recommendation_request", () => {
    const r = classifyRecommendationIntent("いい店ない？");
    expect(r.kind).toBe("recommendation_request");
  });

  test("『近くで何かない？』 → recommendation_request + interrogative", () => {
    const r = classifyRecommendationIntent("近くで何かない？");
    expect(r.kind).toBe("recommendation_request");
    expect(r.signals.hasInterrogativeMarker).toBe(true);
  });

  test("『どこで食べよう』 → recommendation_request（強 phrase は疑問マーカー不要）", () => {
    const r = classifyRecommendationIntent("どこで食べよう");
    expect(r.kind).toBe("recommendation_request");
  });

  test("『オススメ教えて』 → recommendation_request", () => {
    const r = classifyRecommendationIntent("オススメ教えて");
    expect(r.kind).toBe("recommendation_request");
  });

  test("category + anchor + 提案要求 → recommendation_request + hint 抽出", () => {
    const r = classifyRecommendationIntent("サドヤ近くでおすすめのカフェない？");
    expect(r.kind).toBe("recommendation_request");
    expect(r.anchorHint).toBe("サドヤ");
    expect(r.categoryHint).toBe("カフェ");
  });

  test("quality hint も拾う", () => {
    const r = classifyRecommendationIntent("静かなカフェでおすすめある？");
    expect(r.kind).toBe("recommendation_request");
    expect(r.categoryHint).toBe("カフェ");
    expect(r.qualityHint).toBe("静かな");
  });
});

describe("W2-4 classifyRecommendationIntent — CEO条件(1): 既存の explicit place を上書きしない", () => {
  test("『渋谷のスタバで作業』 → explicit_place（recommendation にしない）", () => {
    const r = classifyRecommendationIntent("渋谷のスタバで作業");
    expect(r.kind).toBe("explicit_place");
    expect(r.signals.hasExplicitPlace).toBe(true);
  });

  test("『サドヤに行く』 → explicit_place", () => {
    const r = classifyRecommendationIntent("サドヤに行く");
    expect(r.kind).toBe("explicit_place");
  });

  test("『新宿でランチ』 → explicit_place（地名+動詞 = explicit 判定）", () => {
    // 新宿は地名だが、「〜で」+ 活動 があれば explicit 扱い。
    // recommendation phrase が無い限り recommendation にしない。
    const r = classifyRecommendationIntent("新宿でランチ");
    // 「でランチ」は LOCATIVE_VERB の「で食べる」系ではないが、
    // チェーン/店舗標識がない場合は explicit_category にフォールバックする余地あり。
    // ここでは category 検出のみ確実。explicit_category or explicit_place のいずれか。
    expect(["explicit_place", "explicit_category"]).toContain(r.kind);
    expect(r.kind).not.toBe("recommendation_request");
  });

  test("『A店に寄る』 → explicit_place", () => {
    const r = classifyRecommendationIntent("A店に寄る");
    expect(r.kind).toBe("explicit_place");
  });

  test("『スタバでおすすめある？』 → explicit_place（店名 > 提案要求）", () => {
    // CEO 条件(1): explicit がある限り主役にしない
    const r = classifyRecommendationIntent("スタバでおすすめある？");
    expect(r.kind).toBe("explicit_place");
    // phrase と explicit の両方を検出したシグナルは残る
    expect(r.signals.hasRecommendationPhrase).toBe(true);
    expect(r.signals.hasExplicitPlace).toBe(true);
  });

  test("『叙々苑に行く』 → explicit_place（固有名漢字 + 移動動詞）", () => {
    const r = classifyRecommendationIntent("叙々苑に行く");
    expect(r.kind).toBe("explicit_place");
  });

  test("『渋谷駅に行く』 → explicit_place（駅名 + 動詞）", () => {
    const r = classifyRecommendationIntent("渋谷駅に行く");
    expect(r.kind).toBe("explicit_place");
  });
});

describe("W2-4 classifyRecommendationIntent — カテゴリのみ / none", () => {
  test("『カフェで作業する』 → explicit_category", () => {
    const r = classifyRecommendationIntent("カフェで作業する");
    expect(r.kind).toBe("explicit_category");
    expect(r.categoryHint).toBe("カフェ");
  });

  test("『今日は家にいる』 → none", () => {
    const r = classifyRecommendationIntent("今日は家にいる");
    expect(r.kind).toBe("none");
  });

  test("『9時から仕事』 → none（時間のみ）", () => {
    const r = classifyRecommendationIntent("9時から仕事");
    expect(r.kind).toBe("none");
  });
});

describe("W2-4 classifyRecommendationIntent — 安全弁: 弱 phrase は疑問マーカー必須", () => {
  test("『おすすめ。』（文末 tail）単独 → 弱 phrase 扱いで弾く", () => {
    // 「おすすめ。」は osusume_tail にマッチするが弱 phrase。
    // 疑問マーカーがないので recommendation_request に落とさない。
    const r = classifyRecommendationIntent("おすすめ。");
    // 疑問マーカー判定: /ない\??$/ で「おすすめ。」は末尾「。」→ 疑問ではない
    // よって recommendation_request にならない想定
    expect(r.kind).not.toBe("recommendation_request");
  });

  test("『おすすめ教えて』 → 強 phrase で疑問マーカーなしでも OK", () => {
    const r = classifyRecommendationIntent("おすすめ教えて");
    expect(r.kind).toBe("recommendation_request");
  });

  test("『近くで何か食べたい』（平叙文） → 弱 phrase + 疑問なし → 弾く", () => {
    // chikaku_nanka は弱 phrase。「食べたい」は依頼だが疑問マーカーは弱い
    const r = classifyRecommendationIntent("近くで何か食べたい");
    // 「食べたい」語尾は INTERROGATIVE_RE に該当しない →弱 phrase + 疑問なし
    //   → recommendation_request ではない
    //   （仮に explicit_category に落ちるのは OK、none でも OK）
    expect(r.kind).not.toBe("recommendation_request");
  });
});

describe("W2-4 toRecommendationIntent — 変換", () => {
  test("recommendation_request + anchor → anchor_proximity strategy", () => {
    const c = classifyRecommendationIntent("サドヤ近くでおすすめのカフェない？");
    const intent = toRecommendationIntent(c, "サドヤ近くでおすすめのカフェない？");
    expect(intent).not.toBeNull();
    expect(intent!.strategy).toBe("anchor_proximity");
    expect(intent!.anchorHint).toBe("サドヤ");
    expect(intent!.categoryHint).toBe("カフェ");
  });

  test("recommendation_request (anchor 無し) → category_only strategy", () => {
    const c = classifyRecommendationIntent("おすすめのカフェある？");
    const intent = toRecommendationIntent(c, "おすすめのカフェある？");
    expect(intent).not.toBeNull();
    expect(intent!.strategy).toBe("category_only");
    expect(intent!.categoryHint).toBe("カフェ");
  });

  test("explicit_place → null（変換しない）", () => {
    const c = classifyRecommendationIntent("サドヤに行く");
    const intent = toRecommendationIntent(c, "サドヤに行く");
    expect(intent).toBeNull();
  });

  test("none → null", () => {
    const c = classifyRecommendationIntent("今日は暇");
    const intent = toRecommendationIntent(c, "今日は暇");
    expect(intent).toBeNull();
  });

  test("source を指定できる", () => {
    const c = classifyRecommendationIntent("おすすめある？", { source: "alter_initiated" });
    const intent = toRecommendationIntent(c, "おすすめある？");
    expect(intent!.source).toBe("alter_initiated");
  });
});

describe("W2-4 classifyRecommendationIntent — 文言揺れへの耐性", () => {
  test("『オススメ』カタカナ表記", () => {
    const r = classifyRecommendationIntent("オススメある？");
    expect(r.kind).toBe("recommendation_request");
  });

  test("『お薦め』漢字表記", () => {
    const r = classifyRecommendationIntent("お薦めある？");
    expect(r.kind).toBe("recommendation_request");
  });

  test("『何かいい店ない？』 → recommendation_request", () => {
    const r = classifyRecommendationIntent("何かいい店ない？");
    expect(r.kind).toBe("recommendation_request");
  });

  test("全角？・半角? 両対応", () => {
    const full = classifyRecommendationIntent("おすすめある？");
    const half = classifyRecommendationIntent("おすすめある?");
    expect(full.kind).toBe("recommendation_request");
    expect(half.kind).toBe("recommendation_request");
  });

  test("『どこがいい？』 → recommendation_request", () => {
    const r = classifyRecommendationIntent("どこがいい？");
    expect(r.kind).toBe("recommendation_request");
  });
});
