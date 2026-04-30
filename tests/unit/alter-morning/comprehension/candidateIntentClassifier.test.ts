/**
 * Candidate Intent Classifier tests — W3 P1
 *
 * 検証範囲:
 *   1. 7 intent (transport / modify / append / candidate_reject / candidate_select /
 *      where_refinement / noop_other) の分類精度
 *   2. CEO 確認 4 case:
 *      - 電車 → transport (where に入らない)
 *      - 9時を10時に変更 → modify (where に入らない)
 *      - 12時から…ランチ → append (where に全文 bind されない)
 *      - 渋谷 / 渋谷駅近く → where_refinement (bind される)
 *   3. 既存 taxonomy の薄い wrapper として where_refinement を委譲
 *   4. false positive 抑止 (短い utterance / 曖昧 case が noop_other に落ちる)
 *   5. pure 性 (同入力で同結果、入力 mutate しない)
 */

import { describe, test, expect } from "vitest";
import {
  classifyCandidateUtterance,
  type CandidateIntentContext,
} from "@/lib/alter-morning/comprehension/candidateIntentClassifier";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

const MOCK_CANDIDATES: NormalizedPlaceCandidate[] = [
  {
    placeId: "ChIJtest1",
    displayName: "スターバックス コーヒー 渋谷マークシティ店",
    address: "渋谷区道玄坂",
    coordinates: { lat: 35.65, lng: 139.7 },
    distanceFromAnchor: null,
    category: "coffee_shop",
    chainToken: "スタバ",
    rawRef: { provider: "google_places", placeId: "ChIJtest1" },
  },
  {
    placeId: "ChIJtest2",
    displayName: "スターバックス コーヒー 渋谷ストリーム店",
    address: "渋谷区渋谷",
    coordinates: { lat: 35.66, lng: 139.7 },
    distanceFromAnchor: null,
    category: "coffee_shop",
    chainToken: "スタバ",
    rawRef: { provider: "google_places", placeId: "ChIJtest2" },
  },
];

const ctxWithCandidates: CandidateIntentContext = {
  candidates: MOCK_CANDIDATES,
  activePresentationExists: true,
};

const ctxEmpty: CandidateIntentContext = {
  candidates: [],
  activePresentationExists: false,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transport
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("transport intent (CEO 確認 case 1)", () => {
  const transportCases = [
    "電車",
    "車",
    "徒歩",
    "歩き",
    "タクシー",
    "バス",
    "自転車",
    "バイク",
    "地下鉄",
    "新幹線",
  ];
  for (const utt of transportCases) {
    test(`"${utt}" → transport`, () => {
      const r = classifyCandidateUtterance(utt, ctxWithCandidates);
      expect(r.intent).toBe("transport");
      expect(r.confidence).toBe("high");
    });
  }

  test("「電車で」も transport", () => {
    const r = classifyCandidateUtterance("電車で", ctxWithCandidates);
    expect(r.intent).toBe("transport");
  });

  test("「電車に変更」も transport", () => {
    const r = classifyCandidateUtterance("電車に変更", ctxWithCandidates);
    expect(r.intent).toBe("transport");
  });

  test("「電車に乗って渋谷まで行く」は long form のため LLM 委譲 (noop_other or other)", () => {
    // false positive 抑止: 単独 keyword 完全一致のみ transport 扱い、長文は LLM Branch B
    const r = classifyCandidateUtterance(
      "電車に乗って渋谷まで行く",
      ctxWithCandidates,
    );
    // "渋谷" を含むため where_refinement の可能性も。重要なのは transport にならないこと
    // (CEO の不変条件は「where 汚染を止める」)。実際の経路は taxonomy 次第
    expect(["where_refinement", "noop_other"]).toContain(r.intent);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Modify (CEO 確認 case 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("modify intent (CEO 確認 case 2)", () => {
  test("「9時を10時に変更」→ modify", () => {
    const r = classifyCandidateUtterance("9時を10時に変更", ctxWithCandidates);
    expect(r.intent).toBe("modify");
    expect(r.confidence).toBe("high");
  });

  test("「9時を10時に」→ modify", () => {
    const r = classifyCandidateUtterance("9時を10時に", ctxWithCandidates);
    expect(r.intent).toBe("modify");
  });

  test("「9時から10時にして」→ modify", () => {
    const r = classifyCandidateUtterance(
      "9時から10時にして",
      ctxWithCandidates,
    );
    expect(r.intent).toBe("modify");
  });

  test("「キャンセル」→ modify", () => {
    const r = classifyCandidateUtterance("キャンセル", ctxWithCandidates);
    expect(r.intent).toBe("modify");
  });

  test("「やめる」→ modify", () => {
    const r = classifyCandidateUtterance("やめる", ctxWithCandidates);
    expect(r.intent).toBe("modify");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Append (CEO 確認 case 3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("append intent (CEO 確認 case 3)", () => {
  test("「この後、12時から高橋と新宿でランチ」→ append", () => {
    const r = classifyCandidateUtterance(
      "この後、12時から高橋と新宿でランチ",
      ctxWithCandidates,
    );
    expect(r.intent).toBe("append");
    expect(r.confidence).toBe("high");
  });

  test("「次に病院」→ append", () => {
    const r = classifyCandidateUtterance("次に病院", ctxWithCandidates);
    expect(r.intent).toBe("append");
  });

  test("「12時から新宿でランチ」→ append (時刻 + 場所構文)", () => {
    const r = classifyCandidateUtterance(
      "12時から新宿でランチ",
      ctxWithCandidates,
    );
    expect(r.intent).toBe("append");
  });

  test("「あとで」→ append", () => {
    const r = classifyCandidateUtterance("あとで", ctxWithCandidates);
    expect(r.intent).toBe("append");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Candidate reject
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("candidate_reject intent", () => {
  const rejectCases = [
    "ない",
    "なし",
    "違う",
    "候補じゃない",
    "候補の話じゃない",
  ];
  for (const utt of rejectCases) {
    test(`"${utt}" → candidate_reject`, () => {
      const r = classifyCandidateUtterance(utt, ctxWithCandidates);
      expect(r.intent).toBe("candidate_reject");
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Candidate select
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("candidate_select intent", () => {
  test("順序「1」→ candidate_select", () => {
    const r = classifyCandidateUtterance("1", ctxWithCandidates);
    expect(r.intent).toBe("candidate_select");
  });

  test("順序「最初」→ candidate_select", () => {
    const r = classifyCandidateUtterance("最初", ctxWithCandidates);
    expect(r.intent).toBe("candidate_select");
  });

  test("順序「2つ目」→ candidate_select", () => {
    const r = classifyCandidateUtterance("2つ目", ctxWithCandidates);
    expect(r.intent).toBe("candidate_select");
  });

  test("候補 displayName 部分一致「マークシティ」→ candidate_select (medium)", () => {
    const r = classifyCandidateUtterance("マークシティ", ctxWithCandidates);
    expect(r.intent).toBe("candidate_select");
    expect(r.confidence).toBe("medium");
  });

  test("候補なし context で「マークシティ」→ where_refinement or noop", () => {
    // candidates 空なら displayName 一致は発生しない、taxonomy 委譲
    const r = classifyCandidateUtterance("マークシティ", ctxEmpty);
    expect(r.intent).not.toBe("candidate_select");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Where refinement (CEO 確認 case 4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("where_refinement intent (CEO 確認 case 4)", () => {
  test("「渋谷」→ where_refinement (taxonomy: anchor_alone)", () => {
    const r = classifyCandidateUtterance("渋谷", ctxWithCandidates);
    expect(r.intent).toBe("where_refinement");
    expect(r.reason).toContain("taxonomy:");
  });

  test("「渋谷駅近く」→ where_refinement", () => {
    const r = classifyCandidateUtterance("渋谷駅近く", ctxWithCandidates);
    expect(r.intent).toBe("where_refinement");
  });

  test("「渋谷のカフェ」→ where_refinement", () => {
    const r = classifyCandidateUtterance("渋谷のカフェ", ctxWithCandidates);
    expect(r.intent).toBe("where_refinement");
  });

  test("「自宅」→ where_refinement (baseline)", () => {
    const r = classifyCandidateUtterance("自宅", ctxWithCandidates);
    expect(r.intent).toBe("where_refinement");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// noop_other (false positive 抑止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("noop_other (Branch B 委譲)", () => {
  test("空文字 → noop_other", () => {
    const r = classifyCandidateUtterance("", ctxWithCandidates);
    expect(r.intent).toBe("noop_other");
    expect(r.reason).toBe("empty_utterance");
  });

  test("空白のみ → noop_other", () => {
    const r = classifyCandidateUtterance("   ", ctxWithCandidates);
    expect(r.intent).toBe("noop_other");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 不変条件: where 汚染を止める
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P1.6: 全文 sentence guard (CEO 実機 trace 2026-05-01)", () => {
  // 実機 trace で確定した bug:
  //   「明日の9時に渋谷のスタバ」が taxonomy で chain_with_anchor 判定 →
  //   where_refinement として answerBinder に流れ →
  //   place_ref="明日の9時に渋谷のスタバ" 全文 bind 発生
  //
  // P1.6 修正:
  //   時刻パターン (\d+時 or \d+:\d+) を含む長文は where_refinement から除外し、
  //   noop_other に落として Branch B (LLM 再 comprehension) に委譲する。

  test("「明日の9時に渋谷のスタバ」→ where_refinement にならない (全文 guard)", () => {
    const r = classifyCandidateUtterance(
      "明日の9時に渋谷のスタバ",
      ctxWithCandidates,
    );
    // CEO 不変条件: 全文 bind を防ぐ
    expect(r.intent).not.toBe("where_refinement");
    // 既存 P1 の transport / modify / append / reject にも該当しないため noop_other に落ちる
    expect(r.intent).toBe("noop_other");
  });

  test("「9時に渋谷」→ where_refinement にならない (時刻含む)", () => {
    const r = classifyCandidateUtterance("9時に渋谷", ctxWithCandidates);
    expect(r.intent).not.toBe("where_refinement");
  });

  test("「9:00 渋谷」→ where_refinement にならない (時刻含む)", () => {
    const r = classifyCandidateUtterance("9:00 渋谷", ctxWithCandidates);
    expect(r.intent).not.toBe("where_refinement");
  });

  test("「渋谷」→ where_refinement (短文、時刻なし、許可)", () => {
    const r = classifyCandidateUtterance("渋谷", ctxWithCandidates);
    expect(r.intent).toBe("where_refinement");
  });

  test("「渋谷駅近く」→ where_refinement (短文、時刻なし、許可)", () => {
    const r = classifyCandidateUtterance("渋谷駅近く", ctxWithCandidates);
    expect(r.intent).toBe("where_refinement");
  });

  test("「マークシティ周辺」→ taxonomy 限界で noop_other 許容 (全文 bind されないことが重要)", () => {
    // taxonomy の dict に「マークシティ」が anchor として登録がない場合 noop_other に落ちる。
    // これは taxonomy 拡充の領域 (P1.6 範囲外)。
    // CEO 不変条件「全文 bind されない」は noop_other → Branch B 委譲で満たされる。
    const r = classifyCandidateUtterance("マークシティ周辺", ctxWithCandidates);
    expect([
      "where_refinement",
      "candidate_select",
      "noop_other",
    ]).toContain(r.intent);
  });

  test("「自宅」→ where_refinement (baseline、時刻なし、許可)", () => {
    const r = classifyCandidateUtterance("自宅", ctxWithCandidates);
    expect(r.intent).toBe("where_refinement");
  });
});

describe("CEO 不変条件: where 汚染を止める (P1 成功条件)", () => {
  // gate が answerBinder を skip すべき intent 一覧
  const skipIntents = [
    "transport",
    "modify",
    "append",
    "candidate_reject",
    "candidate_select",
    "noop_other",
  ];

  test("「電車」は where_refinement にならない", () => {
    const r = classifyCandidateUtterance("電車", ctxWithCandidates);
    expect(r.intent).not.toBe("where_refinement");
    expect(skipIntents).toContain(r.intent);
  });

  test("「9時を10時に変更」は where_refinement にならない", () => {
    const r = classifyCandidateUtterance("9時を10時に変更", ctxWithCandidates);
    expect(r.intent).not.toBe("where_refinement");
    expect(skipIntents).toContain(r.intent);
  });

  test("「この後、12時から高橋と新宿でランチ」は where_refinement にならない", () => {
    const r = classifyCandidateUtterance(
      "この後、12時から高橋と新宿でランチ",
      ctxWithCandidates,
    );
    expect(r.intent).not.toBe("where_refinement");
    expect(skipIntents).toContain(r.intent);
  });

  test("「ない」は where_refinement にならない", () => {
    const r = classifyCandidateUtterance("ない", ctxWithCandidates);
    expect(r.intent).not.toBe("where_refinement");
    expect(skipIntents).toContain(r.intent);
  });

  test("「渋谷」だけは where_refinement (gate を通る)", () => {
    const r = classifyCandidateUtterance("渋谷", ctxWithCandidates);
    expect(r.intent).toBe("where_refinement");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// pure 性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("pure 性 / 副作用ゼロ", () => {
  test("同入力で同結果 (決定論)", () => {
    const a = classifyCandidateUtterance("電車", ctxWithCandidates);
    const b = classifyCandidateUtterance("電車", ctxWithCandidates);
    expect(a).toEqual(b);
  });

  test("入力 candidates を mutate しない", () => {
    const candidates = [...MOCK_CANDIDATES];
    const ctx: CandidateIntentContext = {
      candidates,
      activePresentationExists: true,
    };
    const before = JSON.parse(JSON.stringify(candidates));
    classifyCandidateUtterance("マークシティ", ctx);
    expect(candidates).toEqual(before);
  });

  test("trim される (前後空白)", () => {
    const r = classifyCandidateUtterance("  電車  ", ctxWithCandidates);
    expect(r.intent).toBe("transport");
  });
});
