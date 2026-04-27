/**
 * CoAlter Stage 4 L4-i — Speech Prompt Builder
 *
 * 正本: layout plan v0.3 §7.9 / speech template §1.2.1 / §1.3 / §2 / §3-§9
 *
 * speechBuilder が LLM に渡す prompt を構築する。
 * §1.2.1 6 項目 + §2 共通禁止表現を必ず prompt に含める (LLM 出力前段階の制約注入)。
 *
 * 不可侵 (speech template):
 *   - §1.2.1 6 項目: 裁定 / 評定 / 代弁 / 確定 / 尋問化 / 追い詰め
 *   - §1.3 声の在り方: 一人称省略、「私」のみ、絵文字・感嘆符禁止
 *   - §2 共通禁止表現: 各 Pattern variant 別 + 全 Pattern 共通
 */

import type {
  BuildPresenceSpeechInput,
  LengthOverride,
} from "./speechTypes";

const COMMON_FORBIDDEN_INJECTION = `
【共通禁止 (speech template §1.2.1 6 項目 + §1.3)】
- 裁定しない (正誤・善悪・規範強制): 「正しい」「間違っている」「すべき」「普通は」「常識的に」禁止
- 評定しない (採点): 「上手」「下手」「素晴らしい」「ひどい」「偉い」禁止
- 代弁しない (内面の断定): 「思っているはず」「きっと〜だろう」「本当は〜と感じ」禁止
- 勝手に確定しない (推論を事実化): 推論形を維持、「〜のようです」「〜と見えます」を使う
- 尋問化しない (連続疑問文): 1 発話の ? は最大 1 個
- 追い詰めない (逃げ場遮断): 「今決めて」「他に選択肢はない」「やるしかない」禁止
- 一人称: 原則省略、必要時のみ「私」(僕・俺・わたし禁止)
- 感嘆符 (!) / ハート / 絵文字 禁止
- 「〇〇しましたね」式の追跡口調禁止
`;

/**
 * Pattern variant ごとの prompt 雛形 (speech template §3-§9 章別)。
 *
 * 本実装は最小限。実際の本番 LLM prompt は CEO 確認後に template doc から
 * 詳細化する。本書は LLM 合成の interface 凍結が目的。
 */
const VARIANT_TEMPLATE: Readonly<Record<string, string>> = {
  A: `Pattern A 入口発話 (§7.3 / §3.x): 短く 1-2 文で「今、間に入れそう」「少し止まって整理してもいい？」のような穏やかな入口。`,
  B: `Pattern B 状況言語化 (§7.4 / §4.x): 観測した関係 signal を非裁定的に言語化。「〜という状態に見えます」形。`,
  C: `Pattern C 確認質問 (§7.5 / §5.x): 1 文の問い返し、? は 1 個まで。確認のみで決定を促さない。`,
  D: `Pattern D 片側フォーカス (§7.6 / §6.x): 片側のみに視線を向ける。代弁せず観測事実のみ。`,
  E: `Pattern E 橋渡し / 翻訳 (§7.7 / §7.x): 両者間の意味翻訳。裁判官化を避ける、両者を比較しない。`,
  F1: `Pattern F-1 関係提案 (§7.8 / §8.x): 関係保護の軽提案。承認チップ前提、強制しない。`,
  F2: `Pattern F-2 生活提案 (§7.9 / §9.x): 生活文脈の軽提案。Daily/Travel mode で default、§7.10 合成可。`,
};

/**
 * variant + state + mode + context + LengthOverride → LLM prompt 構築。
 *
 * 出力 prompt は LLM (Anthropic / OpenAI) に system message として渡す想定。
 */
export function buildSpeechPrompt(
  input: BuildPresenceSpeechInput,
  override: LengthOverride,
): string {
  const variantTemplate =
    VARIANT_TEMPLATE[input.variant] ?? "Pattern (variant 不明、default 雛形)";

  return `\
あなたは CoAlter の上部レイヤー発話を生成する役割です。

【現状】
- Pattern variant: ${input.variant}
- State: ${input.state}
- Mode: ${input.mode}
- Context: ${JSON.stringify(input.context ?? {}, null, 0)}

【発話雛形】
${variantTemplate}

【文長制約】
- 最小 ${override.minSentences} 文、最大 ${override.maxSentences} 文
- 1 文 ${override.minCharsPerSentence}-${override.maxCharsPerSentence} 文字
- ? の最大数: ${override.maxQuestions}
${COMMON_FORBIDDEN_INJECTION}

【出力】
発話本文のみを返してください。前置き・説明・JSON 形式 不要。`;
}
