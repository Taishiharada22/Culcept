/**
 * Parts Lens — HDM v1 P2-3
 *
 * Schwartz (1995) Internal Family Systems + Friston Active Inference:
 *   人間の内部には複数の「パート」が共存し、
 *   それぞれが異なる目的と反応パターンを持つ。
 *   パートは固定人格ではなく、文脈依存の activation state である。
 *
 * 3層モデル:
 *   1. Protective — 防御反応（逸らし、合理化、最小化、ユーモア盾）
 *   2. Vulnerable — 傷つきやすい部分の表出（痛み、恐れ、不確実性）
 *   3. Reactive — 即時反応（fight / flight / freeze / fawn）
 *
 * 設計原則:
 *   - parts は固定人格ではなく activation state として扱う
 *   - UIや返答で IFS 用語を前面化しない。ラベル貼りしない
 *   - Exile を Alter 側から暴かない（EXILE_CONTACT_BAN）
 *   - contradictionDetector を入口にするが、単独では起動しない（2信号以上必要）
 *   - DB永続化しない。per-turn 推定 + 短期 rolling smoothing（3-5ターン）
 *   - P1.5 の既存制約（repair / hold / probe / hedging）に従属する
 *
 * @see docs/heart-dynamics-model-v1.md §8.3 (Parts Lens / IFS)
 */
import "server-only";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ProtectiveMode = "deflect" | "rationalize" | "minimize" | "humor_shield";
export type ReactiveMode = "fight" | "flight" | "freeze" | "fawn";
export type VulnerabilitySafetyLevel = "safe" | "caution" | "retreat";
export type DominantPart = "protective" | "vulnerable" | "reactive" | "balanced" | "unclear";

/** 各パートの activation state */
export interface PartActivation {
  activationLevel: number; // 0-1
}

export interface ProtectiveActivation extends PartActivation {
  dominantMode: ProtectiveMode | null;
  triggerSource: string | null;
}

export interface VulnerableActivation extends PartActivation {
  /** Exile territory に近づいているか */
  isApproaching: boolean;
  /** 安全レベル: safe=通常, caution=注意, retreat=後退+保持 */
  safetyLevel: VulnerabilitySafetyLevel;
}

export interface ReactiveActivation extends PartActivation {
  dominantMode: ReactiveMode | null;
}

/** per-turn の parts activation 推定結果 */
export interface PartsActivationState {
  protective: ProtectiveActivation;
  vulnerable: VulnerableActivation;
  reactive: ReactiveActivation;
  /** 最も活性の高いパート（証拠不足時は unclear） */
  dominantPart: DominantPart;
  /** 発火した信号の数（2未満では parts 推定は unclear） */
  signalCount: number;
  /** 発火した信号の種類 */
  signals: string[];
}

/** Parts Lens に渡す入力信号 */
export interface PartsSignalInput {
  /** ユーザーメッセージ */
  message: string;
  /** cross-session contradiction が検出されたか */
  hasContradictionHint: boolean;
  /** personality の contradictionAxes から parts 関連ドメインの強い矛盾があるか */
  hasStrongDomainContradiction: boolean;
  /** P2-1: narrative shift が検出されたか */
  narrativeShiftDetected: boolean;
  /** P2-2: body signal が検出されたか */
  bodySignalDetected: boolean;
  /** 前ターンの state（rolling smoothing 用） */
  previousState: PartsActivationState | null;
}

/** P1.5 への出力制約 */
export interface PartsP15Override {
  /** claim strength の上限（null = 制約なし） */
  claimStrengthCap: "hold" | "probe" | "lean_in" | null;
  /** response mode の強制（null = 制約なし） */
  forcedResponseMode: "repair" | null;
  /** hedging 必須か */
  hedgingRequired: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Signal Detection Patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// -- Protective patterns --
const DEFLECT_PATTERNS = /大したことない|関係ない[よね]?|どうでもいい|話変えるけど|それはさておき|まあいいか|別の話だけど/;
const RATIONALIZE_PATTERNS = /論理的に[考見]|客観的に[見考]|合理的に|冷静に考え|仕方がない|仕方ない|そういうもの[だで]|当然[だの]/;
const MINIMIZE_PATTERNS = /別にいい|気にしてない|平気[だで]|大丈夫[だで]|問題ない|何でもない|全然平気|そんなもん/;
const HUMOR_SHIELD_PATTERNS = /(?:笑|www|ｗｗ|草|ウケる)[。、！!]?$/;

// -- Vulnerable patterns --
const VULNERABLE_PATTERNS = /本当は|実は.*(?:怖|不安|辛|悲し|寂し)|怖[いく](?:て|んだ)|不安[でに](?:なる|押しつぶ)|辛[いく]て|助けて|どうしたらいい|分からなくなっ|自信がなくなっ|消えたい|逃げたい/;
const DEEP_VULNERABLE_PATTERNS = /誰にも言[えわ]なかった|ずっと隠してた|本当の自分|見せたくない|触れたくない|思い出したくない|あの[時頃]から/;

// -- Reactive patterns --
const FIGHT_PATTERNS = /ムカつく|腹が立[つた]|許せない|最悪|ふざけるな|なんで[!！]+|信じられない|もう無理|いい加減にし/;
const FLIGHT_PATTERNS = /もういい[よや]|やめ[たよ]|逃げたい|関わりたくない|放っておいて|一人にして/;
const FREEZE_PATTERNS = /分からない{2,}|どうすれば|頭が真っ白|考えられない|何も[浮思]かばない|固まっ[たて]/;
const FAWN_PATTERNS = /(?:全部)?(?:私|自分)(?:が|の)(?:せい|悪い)|(?:あなた|相手)(?:は|が)(?:正し|悪くない)|ごめんなさい{2,}/;

// -- Hedging patterns (tone shift signal) --
const HEDGING_INCREASE = /かもしれない|気がする|よく分からないけど|たぶん|もしかしたら/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Signal Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DetectedSignals {
  /** 発火した信号名 */
  names: string[];
  /** Protective 推定 */
  protective: { level: number; mode: ProtectiveMode | null };
  /** Vulnerable 推定 */
  vulnerable: { level: number; deep: boolean };
  /** Reactive 推定 */
  reactive: { level: number; mode: ReactiveMode | null };
}

/**
 * 全信号を検出する。
 * 2信号以上で parts 推定が起動する。
 */
export function detectPartsSignals(input: PartsSignalInput): DetectedSignals {
  const names: string[] = [];

  // -- Contradiction signals --
  if (input.hasContradictionHint) names.push("cross_session_contradiction");
  if (input.hasStrongDomainContradiction) names.push("domain_contradiction");

  // -- External lens signals --
  if (input.narrativeShiftDetected) names.push("narrative_shift");
  if (input.bodySignalDetected) names.push("body_signal");

  // -- Message-level signals --
  const msg = input.message;

  // Protective
  const protLevel = detectProtectiveLevel(msg);
  if (protLevel.level > 0.3) names.push("protective_pattern");

  // Vulnerable
  const vulnLevel = detectVulnerableLevel(msg);
  if (vulnLevel.level > 0.3) names.push("vulnerable_pattern");

  // Reactive
  const reactLevel = detectReactiveLevel(msg);
  if (reactLevel.level > 0.3) names.push("reactive_pattern");

  // Tone shift (hedging increase)
  const hedgingMatches = msg.match(new RegExp(HEDGING_INCREASE.source, "g"));
  if (hedgingMatches && hedgingMatches.length >= 2) names.push("hedging_shift");

  return {
    names,
    protective: protLevel,
    vulnerable: vulnLevel,
    reactive: reactLevel,
  };
}

function detectProtectiveLevel(msg: string): { level: number; mode: ProtectiveMode | null } {
  let level = 0;
  let mode: ProtectiveMode | null = null;

  if (DEFLECT_PATTERNS.test(msg)) { level = Math.max(level, 0.6); mode = "deflect"; }
  if (RATIONALIZE_PATTERNS.test(msg)) { level = Math.max(level, 0.5); mode = mode ?? "rationalize"; }
  if (MINIMIZE_PATTERNS.test(msg)) { level = Math.max(level, 0.5); mode = mode ?? "minimize"; }
  if (HUMOR_SHIELD_PATTERNS.test(msg)) { level = Math.max(level, 0.4); mode = mode ?? "humor_shield"; }

  // 複数パターン → レベル上昇
  const matchCount = [DEFLECT_PATTERNS, RATIONALIZE_PATTERNS, MINIMIZE_PATTERNS, HUMOR_SHIELD_PATTERNS]
    .filter(p => p.test(msg)).length;
  if (matchCount >= 2) level = Math.min(1, level + 0.2);

  return { level, mode };
}

function detectVulnerableLevel(msg: string): { level: number; deep: boolean } {
  let level = 0;
  let deep = false;

  if (VULNERABLE_PATTERNS.test(msg)) level = 0.5;
  if (DEEP_VULNERABLE_PATTERNS.test(msg)) { level = 0.8; deep = true; }

  return { level, deep };
}

function detectReactiveLevel(msg: string): { level: number; mode: ReactiveMode | null } {
  let level = 0;
  let mode: ReactiveMode | null = null;

  if (FIGHT_PATTERNS.test(msg)) { level = Math.max(level, 0.6); mode = "fight"; }
  if (FLIGHT_PATTERNS.test(msg)) { level = Math.max(level, 0.5); mode = mode ?? "flight"; }
  if (FREEZE_PATTERNS.test(msg)) { level = Math.max(level, 0.5); mode = mode ?? "freeze"; }
  if (FAWN_PATTERNS.test(msg)) { level = Math.max(level, 0.4); mode = mode ?? "fawn"; }

  return { level, mode };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Parts Activation Estimation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Rolling smoothing の重み — 非対称: 活性化は遅く(0.6)、非活性化は速く(0.8) */
const SMOOTHING_ALPHA_ACTIVATE = 0.6;
const SMOOTHING_ALPHA_DEACTIVATE = 0.8;

/**
 * 全信号から per-turn の parts activation を推定する。
 *
 * 起動条件: 2信号以上が発火していること。
 * 1信号以下 → dominantPart = "unclear"、activation は低レベルのみ。
 */
export function estimatePartsActivation(input: PartsSignalInput): PartsActivationState {
  const detected = detectPartsSignals(input);
  const signalCount = detected.names.length;

  // 信号不足 → unclear（parts 推定を起動しない）
  if (signalCount < 2) {
    const inactiveState: PartsActivationState = {
      protective: { activationLevel: 0, dominantMode: null, triggerSource: null },
      vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "unclear",
      signalCount,
      signals: detected.names,
    };
    // 前ターンからの smoothing のみ適用（急激なリセット防止）
    return applyRollingSmoothing(inactiveState, input.previousState);
  }

  // Protective
  const protective: ProtectiveActivation = {
    activationLevel: detected.protective.level,
    dominantMode: detected.protective.mode,
    triggerSource: detected.names.includes("cross_session_contradiction")
      ? "cross_session_contradiction"
      : detected.names.includes("domain_contradiction")
        ? "domain_contradiction"
        : null,
  };

  // Vulnerable
  const vulnLevel = detected.vulnerable.level;
  const isApproaching = detected.vulnerable.deep;
  const safetyLevel: VulnerabilitySafetyLevel =
    isApproaching && protective.activationLevel > 0.3 ? "retreat" :
    isApproaching ? "caution" :
    vulnLevel > 0.5 ? "caution" :
    "safe";

  const vulnerable: VulnerableActivation = {
    activationLevel: vulnLevel,
    isApproaching,
    safetyLevel,
  };

  // Reactive
  const reactive: ReactiveActivation = {
    activationLevel: detected.reactive.level,
    dominantMode: detected.reactive.mode,
  };

  // Dominant part
  const dominantPart = determineDominantPart(protective, vulnerable, reactive);

  const rawState: PartsActivationState = {
    protective,
    vulnerable,
    reactive,
    dominantPart,
    signalCount,
    signals: detected.names,
  };

  return applyRollingSmoothing(rawState, input.previousState);
}

function determineDominantPart(
  protective: ProtectiveActivation,
  vulnerable: VulnerableActivation,
  reactive: ReactiveActivation,
): DominantPart {
  const levels = [
    { part: "protective" as const, level: protective.activationLevel },
    { part: "vulnerable" as const, level: vulnerable.activationLevel },
    { part: "reactive" as const, level: reactive.activationLevel },
  ];

  const maxLevel = Math.max(...levels.map(l => l.level));

  // 全て低い → balanced（十分なデータがあるのに全てが穏やか）
  if (maxLevel < 0.3) return "balanced";

  // 複数が同程度に高い → 最も高いものを返すが、差が小さければ unclear
  const sorted = levels.sort((a, b) => b.level - a.level);
  if (sorted.length >= 2 && sorted[0].level - sorted[1].level < 0.1 && sorted[0].level > 0.3) {
    return "unclear"; // 拮抗 — 判定できない
  }

  return sorted[0].part;
}

/**
 * Rolling smoothing: 非対称 EMA
 * - 活性化方向（上昇）: α=0.6（新値の重みが低い → 慎重に活性化）
 * - 非活性化方向（下降）: α=0.8（新値の重みが高い → 素早く解除）
 */
export function applyRollingSmoothing(
  current: PartsActivationState,
  previous: PartsActivationState | null,
): PartsActivationState {
  if (!previous) return current;

  const smoothLevel = (curr: number, prev: number): number => {
    const alpha = curr > prev ? SMOOTHING_ALPHA_ACTIVATE : SMOOTHING_ALPHA_DEACTIVATE;
    return alpha * curr + (1 - alpha) * prev;
  };

  return {
    ...current,
    protective: {
      ...current.protective,
      activationLevel: smoothLevel(current.protective.activationLevel, previous.protective.activationLevel),
    },
    vulnerable: {
      ...current.vulnerable,
      activationLevel: smoothLevel(current.vulnerable.activationLevel, previous.vulnerable.activationLevel),
    },
    reactive: {
      ...current.reactive,
      activationLevel: smoothLevel(current.reactive.activationLevel, previous.reactive.activationLevel),
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exile 接触禁止ルール（CEO 承認 2026-04-07）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Exile 接触に関するハード制約。
 * Alter は Vulnerable territory に近づいた時、「後退 + 保持」で対応する。
 *
 * === 前進禁止 ===
 * - 「もう少し教えて」「それはいつから？」のような深掘り禁止
 * - 「実はこういうことでは？」のような解釈・ラベル貼り禁止
 * - 「あなたの中にこういうパートがある」のような IFS 用語の使用禁止
 * - 過去のトラウマや傷を特定する発言の禁止
 *
 * === 後退 + 保持 ===
 * - 触れた事実は静かに保持する（無視しない）
 * - でもその先は聞かない、掘らない
 * - 安定化・減速・温度を下げる
 * - ペースはユーザーに委ねる
 */
export const EXILE_CONTACT_BAN = [
  "Vulnerable な領域に近づいた時、Alter は「前進」してはならない。深掘り・解釈・ラベル貼りは全て禁止。",
  "「もう少し教えて」「それはいつから？」「実は〜では？」のような探索的質問は禁止。",
  "IFS 用語（パート、インナーチャイルド、保護者、追放者 etc.）をユーザーに向けて使わないこと。",
  "過去のトラウマ・傷・痛みを特定したり名前をつけたりしないこと。",
  "触れてくれた事実は静かに受け止める。無視はしない。でもその先は押さない。",
  "安定化・減速・温度を下げることを優先する。ペースはユーザーに委ねる。",
].join("\n");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parts activation が意味のある状態にある時、Alter に内部感覚を注入する。
 * signalCount < 2 の場合は null（注入しない）。
 */
export function buildPartsLensPromptBlock(state: PartsActivationState): string | null {
  // 信号不足 or 全て低活性 → 注入しない
  if (state.dominantPart === "unclear" || state.dominantPart === "balanced") return null;

  const blocks: string[] = [];

  blocks.push(`\n## 内部感覚: パート力学（内部参照のみ — ユーザーへの表出禁止）`);

  // Protective
  if (state.protective.activationLevel > 0.3) {
    const modeDesc = state.protective.dominantMode
      ? protectiveModeDescription(state.protective.dominantMode)
      : "何かを守ろうとしている";
    blocks.push(
      `Protective: ${modeDesc}（活性度: ${(state.protective.activationLevel * 100).toFixed(0)}%）`,
      `→ この防御を崩そうとしないこと。挑発・指摘・直接的な質問を避ける。`,
    );
  }

  // Vulnerable
  if (state.vulnerable.activationLevel > 0.3) {
    blocks.push(
      `Vulnerable: 傷つきやすい部分が表面に近づいている（活性度: ${(state.vulnerable.activationLevel * 100).toFixed(0)}%）`,
    );
    if (state.vulnerable.safetyLevel === "retreat") {
      blocks.push(
        `⚠️ Exile territory — 後退 + 保持モード。深掘り禁止。安定化を優先。`,
      );
    } else if (state.vulnerable.safetyLevel === "caution") {
      blocks.push(
        `注意: ペースを落とし、確認を増やすこと。先を急がない。`,
      );
    }
  }

  // Reactive
  if (state.reactive.activationLevel > 0.3) {
    const modeDesc = state.reactive.dominantMode
      ? reactiveModeDescription(state.reactive.dominantMode)
      : "即時反応が活性化している";
    blocks.push(
      `Reactive: ${modeDesc}（活性度: ${(state.reactive.activationLevel * 100).toFixed(0)}%）`,
      `→ この反応のエネルギーに合わせない。冷静なトーンを維持。escalation 禁止。`,
    );
  }

  // Exile ban（Vulnerable が caution/retreat の場合）
  if (state.vulnerable.safetyLevel !== "safe") {
    blocks.push(`\n### Exile 接触禁止ルール（厳守）`);
    blocks.push(EXILE_CONTACT_BAN);
  }

  // 共通禁止
  blocks.push(`\n### 表出禁止ルール`);
  blocks.push(
    `- 「あなたの中にこういう面がある」のようなパート分析を口に出さないこと。`,
    `- 「防御している」「反応的になっている」のようなラベルを貼らないこと。`,
    `- 内部のパート力学は Alter の感覚として保持するのみ。表出は自然な対話として。`,
  );

  return blocks.join("\n");
}

function protectiveModeDescription(mode: ProtectiveMode): string {
  switch (mode) {
    case "deflect": return "話題を逸らそうとしている";
    case "rationalize": return "理屈で感情を処理しようとしている";
    case "minimize": return "重要性を小さく見せようとしている";
    case "humor_shield": return "ユーモアで距離を取ろうとしている";
  }
}

function reactiveModeDescription(mode: ReactiveMode): string {
  switch (mode) {
    case "fight": return "怒り・反発のエネルギーが強い";
    case "flight": return "その場から離れたい衝動がある";
    case "freeze": return "思考が停止・固まっている";
    case "fawn": return "過度に相手に合わせようとしている";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P1.5 Override
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parts activation state から P1.5 制約への override を算出する。
 *
 * gentle 新モードは作らない（CEO指示）。既存の repair / hold / probe / hedging を使用。
 */
export function computePartsP15Override(state: PartsActivationState): PartsP15Override {
  // unclear / balanced → 制約なし
  if (state.dominantPart === "unclear" || state.dominantPart === "balanced") {
    return { claimStrengthCap: null, forcedResponseMode: null, hedgingRequired: false };
  }

  let claimStrengthCap: PartsP15Override["claimStrengthCap"] = null;
  let forcedResponseMode: PartsP15Override["forcedResponseMode"] = null;
  let hedgingRequired = false;

  // Protective 高活性 → claim を probe 以下に制限（挑発しない）
  if (state.protective.activationLevel > 0.5) {
    claimStrengthCap = "probe";
  }

  // Vulnerable + retreat → repair mode + hold cap + hedging
  if (state.vulnerable.safetyLevel === "retreat") {
    forcedResponseMode = "repair";
    claimStrengthCap = "hold";
    hedgingRequired = true;
  } else if (state.vulnerable.safetyLevel === "caution") {
    // caution → probe cap + hedging（retreat の hold より緩い）
    if (!claimStrengthCap) claimStrengthCap = "probe";
    hedgingRequired = true;
  }

  // Reactive 高活性 → hedging 必須
  if (state.reactive.activationLevel > 0.5) {
    hedgingRequired = true;
  }

  return { claimStrengthCap, forcedResponseMode, hedgingRequired };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildPartsLensAnalytics(state: PartsActivationState): Record<string, unknown> {
  return {
    parts_dominant: state.dominantPart,
    parts_signal_count: state.signalCount,
    parts_signals: state.signals,
    parts_protective_level: state.protective.activationLevel,
    parts_protective_mode: state.protective.dominantMode,
    parts_vulnerable_level: state.vulnerable.activationLevel,
    parts_vulnerable_safety: state.vulnerable.safetyLevel,
    parts_vulnerable_approaching: state.vulnerable.isApproaching,
    parts_reactive_level: state.reactive.activationLevel,
    parts_reactive_mode: state.reactive.dominantMode,
  };
}
