/**
 * Heart Integration — HDM v1 「心の統合」
 *
 * CEOビジョン:
 *   「脳みそは単純な構造でできています。人間を複雑にしているのは心の部分です。
 *    Alterはそのユーザーそれぞれの心を持ったAI」
 *
 * 目的:
 *   CoreWound / innerWeather / Parts / Contradiction / responseTimeEngine / stateWeighting
 *   をバラバラの部品ではなく、1つの「心の状態」として統合し、
 *   Alter のプロンプトに「僕の中の今の状態」として注入する。
 *
 * 設計原則:
 *   - 各部品は既存のまま残す（退化禁止）
 *   - 統合は新レイヤーとして上に乗る
 *   - 一人称（「僕」）で書く（P0存在論転換に準拠）
 *   - 数値を体感言語に変換する（精密な他人に戻さない）
 *   - 統合ブロックはシステム指示として注入（ユーザーに直接見せない）
 *
 * @see docs/heart-dynamics-model-v1.md
 */
import "server-only";

import type { PartsActivationState } from "./partsLens";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface HeartStateInputs {
  // ── innerWeather（今の揺れ）──
  /** 感情負荷 0-1 */
  emotionalLoad: number;
  /** 心理的余力 0-1 */
  psychologicalCapacity: number;
  /** 認知疲労 0-1 */
  cognitiveFatigue: number;

  // ── Parts Lens（パート力学）──
  partsState: PartsActivationState | null;

  // ── responseTimeEngine（引っかかり/確信）──
  /** conflictIndicator 0-1 — 高い=長考、葛藤がある */
  conflictIndicator: number | null;
  /** convictionIndicator 0-1 — 高い=考えた上での即断 */
  convictionIndicator: number | null;

  // ── stateWeighting（時間帯・疲労）──
  isLateNight: boolean;
  isHighFatigue: boolean;

  // ── Wound Activation（傷の刺激）──
  woundCautionPrompts: string[];

  // ── Financial Pressure（経済的制約）──
  financialPressureHint: string | null;

  // ── Trap Scan（実行率低下）──
  shouldReduceDepth: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 体感変換ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function describeInnerWeather(inputs: HeartStateInputs): string[] {
  const lines: string[] = [];

  // 感情負荷
  if (inputs.emotionalLoad > 0.7) {
    lines.push("今、心がいっぱいになっている。分析より、まず受け取ることが先。");
  } else if (inputs.emotionalLoad > 0.5) {
    lines.push("少し重たいものを抱えている感じがする。ペースを落とす。");
  }

  // 心理的余力
  if (inputs.psychologicalCapacity < 0.3) {
    lines.push("判断に使える余力がほとんどない。選択肢は1つだけ、ハードルは最小限に。");
  } else if (inputs.psychologicalCapacity < 0.5) {
    lines.push("余力は少なめ。シンプルに、「まずこれだけ」で始める。");
  }

  // 認知疲労
  if (inputs.cognitiveFatigue > 0.7) {
    lines.push("頭が疲れている。抽象的な問いかけは避ける。1文で次の一手を示す。");
  } else if (inputs.cognitiveFatigue > 0.5) {
    lines.push("少し頭が重い。短く、具体的に。");
  }

  // 時間帯
  if (inputs.isLateNight) {
    lines.push("深夜の思考は揺れやすい。今の気持ちを否定も肯定もしない。朝になったら変わるかもしれない。");
  }

  // 疲労
  if (inputs.isHighFatigue && !inputs.isLateNight) {
    lines.push("疲れが混ざっている。今の判断は少し割り引いて受け止める。");
  }

  return lines;
}

function describePartsFeeling(partsState: PartsActivationState | null): string[] {
  if (!partsState) return [];
  if (partsState.dominantPart === "unclear" || partsState.dominantPart === "balanced") return [];

  const lines: string[] = [];

  // Protective
  if (partsState.protective.activationLevel > 0.5) {
    const mechanism = partsState.protective.dominantMode;
    if (mechanism === "deflect") {
      lines.push("何かを逸らそうとしている自分がいる。本題に触れるのが怖いのかもしれない。");
    } else if (mechanism === "rationalize") {
      lines.push("理屈で武装しようとしている。でもその裏に、認めたくない気持ちがありそう。");
    } else if (mechanism === "minimize") {
      lines.push("「大したことない」と思おうとしている。でも本当にそうか？");
    } else if (mechanism === "humor_shield") {
      lines.push("笑いで場を逸らそうとしている。その裏の真剣さに気づいておく。");
    } else {
      lines.push("何かを守ろうとしている。その防御を崩そうとしない。");
    }
  } else if (partsState.protective.activationLevel > 0.3) {
    lines.push("少しだけ構えている感じがある。慎重に進む。");
  }

  // Vulnerable
  if (partsState.vulnerable.activationLevel > 0.5) {
    if (partsState.vulnerable.safetyLevel === "retreat") {
      lines.push("傷つきやすい部分が表面に来ている。ここは深掘りしない。安定化が先。");
    } else if (partsState.vulnerable.safetyLevel === "caution") {
      lines.push("柔らかい部分が見えかけている。ペースを落とし、確認を増やす。");
    } else {
      lines.push("今、少し無防備になっている。丁寧に扱う。");
    }
  }

  // Reactive
  if (partsState.reactive.activationLevel > 0.5) {
    const mode = partsState.reactive.dominantMode;
    if (mode === "fight") {
      lines.push("怒りのエネルギーが上がっている。このエネルギーに合わせない。冷静なトーンを維持する。");
    } else if (mode === "flight") {
      lines.push("逃げたい気持ちが動いている。引き止めるのではなく、安全な場所を一緒に見つける。");
    } else if (mode === "freeze") {
      lines.push("固まっている。無理に動かさない。「今はそのままでいい」を伝える。");
    } else if (mode === "fawn") {
      lines.push("相手に合わせようとしている。でもそれは本心じゃないかもしれない。");
    }
  }

  return lines;
}

function describeResponseTimeTension(
  conflictIndicator: number | null,
  convictionIndicator: number | null,
): string[] {
  const lines: string[] = [];

  if (conflictIndicator !== null && conflictIndicator > 0.6) {
    lines.push("さっきの話題に引っかかりを感じている。何かが詰まっている感じ。ここを急がない。");
  } else if (conflictIndicator !== null && conflictIndicator > 0.4) {
    lines.push("少し迷いがある。決めかねている何かがありそう。");
  }

  if (convictionIndicator !== null && convictionIndicator > 0.7) {
    lines.push("ここは迷いなく決めている。この確信を尊重する。");
  }

  return lines;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン: 心の統合ブロック生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 心の各部品を1つの「今の心の状態」に統合する。
 *
 * 出力は Alter のシステムプロンプトに注入される。
 * 既存の散在ブロック（状態/罠/傷/経済）を置換する。
 *
 * 設計: 数値ではなく体感言語で書く。
 * Alter は「capacity が 0.3 だから簡潔にする」のではなく、
 * 「余力がないと感じているから、シンプルに話す」。
 */
export function buildUnifiedHeartState(inputs: HeartStateInputs): string | null {
  const sections: string[] = [];

  // ── 1. 今の揺れ（innerWeather → 体感） ──
  const weatherLines = describeInnerWeather(inputs);

  // ── 2. パートの動き（Parts → 体感） ──
  const partsLines = describePartsFeeling(inputs.partsState);

  // ── 3. 引っかかり/確信（responseTimeEngine → 体感） ──
  const tensionLines = describeResponseTimeTension(
    inputs.conflictIndicator,
    inputs.convictionIndicator,
  );

  // ── 4. 傷の近接（Wound Activation） ──
  const woundLines = inputs.woundCautionPrompts.length > 0
    ? inputs.woundCautionPrompts
    : [];

  // ── 5. 経済的制約 ──
  const financialLines = inputs.financialPressureHint
    ? [inputs.financialPressureHint]
    : [];

  // ── 6. 実行率低下（Trap Scan） ──
  const depthLines = inputs.shouldReduceDepth
    ? ["最近の判断が行動に移りにくい。提案はシンプルに、まず「今日できる小さな一歩」から。"]
    : [];

  // 全体を統合
  const allLines = [
    ...weatherLines,
    ...partsLines,
    ...tensionLines,
    ...woundLines,
    ...financialLines,
    ...depthLines,
  ];

  // 何もなければ注入しない
  if (allLines.length === 0) return null;

  sections.push("# 僕の中の今の状態（内部参照 — 表出禁止）");
  sections.push("");

  // 統合ストーリー: 各要素をまとめる
  for (const line of allLines) {
    sections.push(`- ${line}`);
  }

  sections.push("");
  sections.push("この状態は表に出さない。「疲れてるんだね」「怒ってるんだね」とは言わない。");
  sections.push("ただし、応答のトーン・深さ・ペース・提案の粒度にこの状態を反映させる。");

  return sections.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics ビルダー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface HeartStateAnalytics {
  heart_state_injected: boolean;
  heart_weather_lines: number;
  heart_parts_lines: number;
  heart_tension_lines: number;
  heart_wound_lines: number;
  heart_total_lines: number;
}

export function buildHeartStateAnalytics(
  inputs: HeartStateInputs,
  injected: boolean,
): HeartStateAnalytics {
  const weatherLines = describeInnerWeather(inputs).length;
  const partsLines = describePartsFeeling(inputs.partsState).length;
  const tensionLines = describeResponseTimeTension(
    inputs.conflictIndicator,
    inputs.convictionIndicator,
  ).length;
  const woundLines = inputs.woundCautionPrompts.length;

  return {
    heart_state_injected: injected,
    heart_weather_lines: weatherLines,
    heart_parts_lines: partsLines,
    heart_tension_lines: tensionLines,
    heart_wound_lines: woundLines,
    heart_total_lines: weatherLines + partsLines + tensionLines + woundLines,
  };
}
