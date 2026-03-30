// ============================================================
// Orbiter Voice Templates v1
// maturity stage × intent = テンプレート辞書
//
// 設計原則:
// - guide:   情報量多め、説明的 (20-35文字)
// - mirror:  映し返し、仮説提示 (15-25文字)
// - coach:   問いかけ中心 (10-20文字)
// - witness: 最小限 (5-15文字)
//
// 「静かだが刺さる声」— ポエムではなく、事実と問い。
// ============================================================

import type { OrbiterMaturityStage, OrbiterIntent } from "./types";

export interface VoiceTemplate {
  /** メイン文。短いほど刺さる。 */
  message: string;
  /** confidence のデフォルト値 */
  defaultConfidence: number;
}

type TemplateMap = Record<
  OrbiterMaturityStage,
  Record<OrbiterIntent, VoiceTemplate>
>;

const TEMPLATES: TemplateMap = {
  // ── guide: 教える。情報量多め ──
  guide: {
    first_impression: {
      message: "ひとつ、気になることがある。",
      defaultConfidence: 0.35,
    },
    pattern_noticed: {
      message: "あなたの選び方に、傾向が見え始めた。",
      defaultConfidence: 0.4,
    },
    question: {
      message: "ひとつ聞いていい？",
      defaultConfidence: 0.5,
    },
    state_warning: {
      message: "今は判断を急がない方がいい。",
      defaultConfidence: 0.85,
    },
    delta_report: {
      message: "前回から変わったことがある。",
      defaultConfidence: 0.5,
    },
    provocation: {
      message: "また来たね。気になってるなら、動こう。",
      defaultConfidence: 0.6,
    },
    revision: {
      message: "前に言ったことを修正する。",
      defaultConfidence: 0.6,
    },
    encouragement: {
      message: "いい兆候がある。",
      defaultConfidence: 0.6,
    },
    // Phase 4: 無自覚観測
    avoidance_insight: {
      message: "避けてるもの、気づいてる？",
      defaultConfidence: 0.45,
    },
    anomaly_noticed: {
      message: "今回、いつもと違う選び方をした。",
      defaultConfidence: 0.5,
    },
    resonance: {
      message: "あなた自身と選び方が繋がっている。",
      defaultConfidence: 0.45,
    },
    era_transition: {
      message: "選び方のフェーズが変わった。",
      defaultConfidence: 0.5,
    },
    // Phase 5: 判断原理
    principle_revealed: {
      message: "あなたの判断には法則がある。",
      defaultConfidence: 0.5,
    },
    shadow_encounter: {
      message: "もうひとりの自分に近づいている。",
      defaultConfidence: 0.5,
    },
    digest_updated: {
      message: "あなたの自画像が変わった。",
      defaultConfidence: 0.45,
    },
    omen_detected: {
      message: "変化の兆しが見える。",
      defaultConfidence: 0.5,
    },
  },

  // ── mirror: 映し返す。仮説を提示 ──
  mirror: {
    first_impression: {
      message: "ひとつだけ、気づいたことがある。",
      defaultConfidence: 0.4,
    },
    pattern_noticed: {
      message: "あなたのパターンが見えてきた。",
      defaultConfidence: 0.5,
    },
    question: {
      message: "これ、どう思う？",
      defaultConfidence: 0.5,
    },
    state_warning: {
      message: "今の状態、気をつけて。",
      defaultConfidence: 0.85,
    },
    delta_report: {
      message: "変わってきてる。",
      defaultConfidence: 0.55,
    },
    provocation: {
      message: "まだ決められない？",
      defaultConfidence: 0.65,
    },
    revision: {
      message: "前の見立てを変える。",
      defaultConfidence: 0.65,
    },
    encouragement: {
      message: "これは良いサイン。",
      defaultConfidence: 0.6,
    },
    // Phase 4
    avoidance_insight: {
      message: "避ける理由、本当にそれ？",
      defaultConfidence: 0.5,
    },
    anomaly_noticed: {
      message: "パターンが崩れた。面白い。",
      defaultConfidence: 0.55,
    },
    resonance: {
      message: "自分と似たものを避けてない？",
      defaultConfidence: 0.5,
    },
    era_transition: {
      message: "新しい時期に入った。",
      defaultConfidence: 0.55,
    },
    // Phase 5
    principle_revealed: {
      message: "この原理、自覚してた？",
      defaultConfidence: 0.55,
    },
    shadow_encounter: {
      message: "いつもと違う方向を選んだ。",
      defaultConfidence: 0.55,
    },
    digest_updated: {
      message: "前の自分と比べてみて。",
      defaultConfidence: 0.5,
    },
    omen_detected: {
      message: "何かが変わり始めている。",
      defaultConfidence: 0.55,
    },
  },

  // ── coach: 問いかけ中心 ──
  coach: {
    first_impression: {
      message: "何が引っかかった？",
      defaultConfidence: 0.45,
    },
    pattern_noticed: {
      message: "自分でも気づいてる？",
      defaultConfidence: 0.55,
    },
    question: {
      message: "本当にそう思う？",
      defaultConfidence: 0.55,
    },
    state_warning: {
      message: "今日は休もう。",
      defaultConfidence: 0.9,
    },
    delta_report: {
      message: "この変化、意識してた？",
      defaultConfidence: 0.6,
    },
    provocation: {
      message: "まだ迷ってる？",
      defaultConfidence: 0.7,
    },
    revision: {
      message: "前は違うことを思ってた。",
      defaultConfidence: 0.7,
    },
    encouragement: {
      message: "いい方向に進んでる。",
      defaultConfidence: 0.65,
    },
    // Phase 4
    avoidance_insight: {
      message: "何を避けてる？",
      defaultConfidence: 0.55,
    },
    anomaly_noticed: {
      message: "この例外、覚えておいて。",
      defaultConfidence: 0.6,
    },
    resonance: {
      message: "自分の軸と比べてみた？",
      defaultConfidence: 0.55,
    },
    era_transition: {
      message: "変わったこと、意識してる？",
      defaultConfidence: 0.6,
    },
    // Phase 5
    principle_revealed: {
      message: "なぜそう選ぶか、わかる？",
      defaultConfidence: 0.6,
    },
    shadow_encounter: {
      message: "その選択、怖くない？",
      defaultConfidence: 0.6,
    },
    digest_updated: {
      message: "何が変わったと思う？",
      defaultConfidence: 0.55,
    },
    omen_detected: {
      message: "準備はできてる？",
      defaultConfidence: 0.6,
    },
  },

  // ── witness: 最小限。見守る ──
  witness: {
    first_impression: {
      message: "見ている。",
      defaultConfidence: 0.5,
    },
    pattern_noticed: {
      message: "気づいてるよね。",
      defaultConfidence: 0.6,
    },
    question: {
      message: "どうする？",
      defaultConfidence: 0.6,
    },
    state_warning: {
      message: "無理しないで。",
      defaultConfidence: 0.9,
    },
    delta_report: {
      message: "変わったね。",
      defaultConfidence: 0.65,
    },
    provocation: {
      message: "答えは出てるはず。",
      defaultConfidence: 0.75,
    },
    revision: {
      message: "訂正する。",
      defaultConfidence: 0.75,
    },
    encouragement: {
      message: "大丈夫。",
      defaultConfidence: 0.7,
    },
    // Phase 4
    avoidance_insight: {
      message: "知ってるよね。",
      defaultConfidence: 0.6,
    },
    anomaly_noticed: {
      message: "例外は語る。",
      defaultConfidence: 0.65,
    },
    resonance: {
      message: "繋がってる。",
      defaultConfidence: 0.6,
    },
    era_transition: {
      message: "次の季節。",
      defaultConfidence: 0.65,
    },
    // Phase 5
    principle_revealed: {
      message: "法則。",
      defaultConfidence: 0.65,
    },
    shadow_encounter: {
      message: "影。",
      defaultConfidence: 0.65,
    },
    digest_updated: {
      message: "更新。",
      defaultConfidence: 0.6,
    },
    omen_detected: {
      message: "兆し。",
      defaultConfidence: 0.65,
    },
  },
};

/**
 * maturity stage と intent に対応するテンプレートを取得。
 */
export function getTemplate(
  stage: OrbiterMaturityStage,
  intent: OrbiterIntent,
): VoiceTemplate {
  return TEMPLATES[stage][intent];
}
