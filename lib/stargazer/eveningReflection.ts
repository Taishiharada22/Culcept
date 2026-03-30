// lib/stargazer/eveningReflection.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 2: Evening Reflection — 夜の鏡
//
// 朝の予言を閉じるループ。検証 → 1段深い洞察 → 明日への予感。
// 毎晩1分。予言の検証結果に応じてAlterが異なる深さで応答する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import type { BeliefSet } from "./bayesianAxisUpdater";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type VerificationResult = "correct" | "partial" | "wrong";

export interface EveningReflectionData {
  /** Alterの応答テキスト */
  reflection: string;
  /** 応答の深さ（検証結果に依存） */
  depth: "surface" | "pattern" | "insight";
  /** 明日への予感（次の朝の布石） */
  tomorrowHint: string;
  /** 精度フィードバック */
  accuracyUpdate: {
    currentAccuracy: number;
    trend: "improving" | "stable" | "declining";
    totalVerified: number;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. 検証応答テンプレート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ReflectionTemplate {
  axis: TraitAxisKey;
  /** 予言が当たった時 — 1段深い洞察を返す */
  correct: string;
  /** 部分的に当たった時 — 条件依存性を示唆 */
  partial: string;
  /** 外れた時 — 成長 or 状況の違いとして解釈 */
  wrong: string;
}

const REFLECTION_TEMPLATES: ReflectionTemplate[] = [
  {
    axis: "introvert_vs_extrovert",
    correct: "やっぱりそうだった。あなたのエネルギーの源は予測できるようになってきた。でもね、本当に面白いのは「例外」の日。なぜ今日はいつも通りだったのか、明日は違うかもしれない。",
    partial: "半分当たってた。あなたの内向・外向は状況で変わるんだね。「誰と一緒か」で答えが変わる。相手によって違う自分が出る。",
    wrong: "外れたか。でもこれは面白い。いつもと違う反応が出た日には、何か特別なことがあったはず。何が違ったか、心当たりある？",
  },
  {
    axis: "emotional_variability",
    correct: "予測通りだったね。あなたの感情の波には周期がある。でも本当に大事なのは、「なぜその波が来るのか」。その核心にはまだ辿り着いてない。",
    partial: "感情の強さは合ってたけど、方向が違ったね。怒りだと思ってたものが、実は悲しみだったりする。感情のラベルは、本体と少しズレることがある。",
    wrong: "今日の感情は、普段のパターンから外れてた。それは成長の兆しかもしれない。以前なら反応してたことに、反応しなくなってる。",
  },
  {
    axis: "cautious_vs_bold",
    correct: "あなたの慎重さは一貫してる。でもね、慎重なのは「怖い」からじゃない。「大事なものを守りたい」から。その違いに気づいてた？",
    partial: "場面によって慎重さの度合いが変わるんだね。仕事では大胆なのに、プライベートでは慎重。逆の人もいる。あなたは自分のパターンを知ってる？",
    wrong: "今日は予想外に大胆だった。何が背中を押したんだろう。それが分かると、「大胆になりたい時になれる」ようになる。",
  },
  {
    axis: "analytical_vs_intuitive",
    correct: "判断パターンが見えてきた。あなたは情報を集める→直感で絞る→最後にロジックで確認する。この3ステップ、自覚してた？",
    partial: "今日の判断は、いつもより直感的だったね。時間がない時は直感に頼る。時間がある時は分析に頼る。どちらもあなた。",
    wrong: "外れたか。今日はいつもと違う判断プロセスだった。それは良いこと。一つのパターンに固定されない柔軟さがある。",
  },
  {
    axis: "boundary_awareness",
    correct: "あなたの距離感は予測できるようになってきた。でも、「なぜその距離を選ぶのか」の方が大事。安全のため？自由のため？相手への配慮？",
    partial: "距離感は合ってたけど、理由が違ったかもしれない。同じ「距離を取る」でも、「疲れてるから」と「守りたいから」は全然違う。",
    wrong: "今日は予想外に距離が近かった（or 遠かった）。相手が特別だったのかな。それとも、あなた自身が変わり始めてるのかな。",
  },
  {
    axis: "independence_vs_harmony",
    correct: "今日も調和を重視してたね（or 自分の意見を貫いたね）。このパターンは安定してる。でも「いつもと逆を選んだ時」が一番面白い。",
    partial: "場面で使い分けてるんだね。仕事では調和、プライベートでは独立。その切り替えは意識的？無意識的？",
    wrong: "いつもと逆だった。これは単なるブレじゃなくて、状況への適応力だと思う。あなたは思ってるより柔軟だよ。",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. 夜の鏡生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 夜の鏡データを生成
 *
 * @param prophecyAxis     朝の予言の対象軸
 * @param verification     ユーザーの検証結果
 * @param beliefs          現在のベイズ信念
 * @param totalVerified    これまでの検証総数
 * @param correctCount     正解数
 */
export function generateEveningReflection(
  prophecyAxis: TraitAxisKey,
  verification: VerificationResult,
  beliefs: BeliefSet,
  totalVerified: number,
  correctCount: number,
): EveningReflectionData {
  // テンプレートから応答を選択
  const template = REFLECTION_TEMPLATES.find((t) => t.axis === prophecyAxis);

  let reflection: string;
  let depth: EveningReflectionData["depth"];

  if (template) {
    switch (verification) {
      case "correct":
        reflection = template.correct;
        depth = "insight";
        break;
      case "partial":
        reflection = template.partial;
        depth = "pattern";
        break;
      case "wrong":
        reflection = template.wrong;
        depth = "surface";
        break;
    }
  } else {
    // テンプレートがない軸用のフォールバック
    switch (verification) {
      case "correct":
        reflection = "当たったね。あなたのパターンが少しずつ見えてきてる。でも、本当に面白いのはこの先にある。";
        depth = "pattern";
        break;
      case "partial":
        reflection = "半分合ってた。あなたの中にある「場合による」が見え始めてる。状況で変わるところが、あなたの複雑さ。";
        depth = "pattern";
        break;
      case "wrong":
        reflection = "外れた。でもこれはいい知らせ。予測が外れた日は、あなたが成長してるか、特別な状況だった証拠。";
        depth = "surface";
        break;
    }
  }

  // 精度計算
  const newCorrect = correctCount + (verification === "correct" ? 1 : verification === "partial" ? 0.5 : 0);
  const newTotal = totalVerified + 1;
  const currentAccuracy = newTotal > 0 ? newCorrect / newTotal : 0;

  // トレンド判定（直近5回の検証）
  let trend: "improving" | "stable" | "declining" = "stable";
  if (newTotal >= 5) {
    const oldAccuracy = totalVerified > 0 ? correctCount / totalVerified : 0;
    if (currentAccuracy > oldAccuracy + 0.05) trend = "improving";
    else if (currentAccuracy < oldAccuracy - 0.05) trend = "declining";
  }

  // 明日への予感
  const tomorrowHint = generateTomorrowHint(verification, beliefs, prophecyAxis);

  return {
    reflection,
    depth,
    tomorrowHint,
    accuracyUpdate: {
      currentAccuracy: Math.round(currentAccuracy * 100) / 100,
      trend,
      totalVerified: newTotal,
    },
  };
}

function generateTomorrowHint(
  verification: VerificationResult,
  beliefs: BeliefSet,
  todayAxis: TraitAxisKey,
): string {
  if (verification === "correct") {
    return "明日は別の角度から見てみる。同じパターンが別の場面でも出るか、確かめたい。";
  }
  if (verification === "wrong") {
    return "明日は今日の「ズレ」を探る質問を用意する。外れた理由が、新しい発見につながるかもしれない。";
  }
  return "明日はもう少し深い質問を用意する。あなたの「場合による」の条件が知りたい。";
}
