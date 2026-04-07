/**
 * Counterfactual Simulation — HDM v1 P4: 多視点統合
 *
 * 反事実シミュレーション = 「もし別の視点で見たら」の候補を生成する仕組み。
 *
 * ── 3層アーキテクチャ（概念定義のみ。生成方式は P4-3 で決定） ──
 *
 *   1. Alter（主）: ユーザー本人の視点を担保する
 *   2. LLM（補助）: 視点をずらした候補を生成する
 *   3. Alter（再統合）: 候補をユーザーの尊厳・文脈・現実性に照らして採用/棄却/弱化
 *
 * LLM が出すのは真実でも答えでもなく「候補」。
 * その候補をそのまま横流しせず、必ず Alter が再統合して返す。
 *
 * ── 視点の種類（P4-3 まで2つに限定）──
 *
 *   - other_party: ユーザーの語りから再構成した「相手の見え方候補」
 *     → 「相手視点」ではない。ユーザーが語った行動から推測した見え方の可能性
 *     → P4-3 では alternative_part 先行。other_party は alternative_part 安定後に実装
 *   - alternative_part: 自分の別の反応パターン（内部は Parts、表は「別の角度」）
 *     → parts 言語は内部専用。ユーザー向けは「別の角度」「別の見え方」に統一
 *     → 自由生成ではなくスコープ限定生成（方向指定 + 範囲制限）
 *
 * ── 安全制約 ──
 *
 *   - Phase 4 以上でのみ解禁（counterfactualAccess = true）
 *   - Trust 十分 / dignity risk 低 / rupture なし
 *   - abuse / coercion / exile proximity では絶対禁止
 *   - other_party: confidence 上限 0.5（内部管理値）/ observedBehaviors 2件以上必須
 *   - 出力は「候補」であって「事実」ではない（フレーミング制約必須）
 *   - confidence はユーザーに数値表示しない（定性表現のみ）
 *
 * ── P4-2 スコープ ──
 *
 *   alternative_part のゲートを本実装（条件を満たせば allowed: true）。
 *   other_party は blocked_by_not_implemented で明示封印（P4-3 後半で解除）。
 *   生成パイプライン・結果型は P4-3 以降で構築する。
 *
 * 学術基盤:
 *   - Pearl (2009) Level 3: Counterfactual Reasoning
 *   - IFS (Schwartz): Parts × 反事実の交差
 *   - Active Inference: 代替生成モデルによる予測
 */

import type { HdmPhase } from "./hdmPhase";
import type { TrustLevel } from "./alterUnderstanding";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 視点の定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 反事実シミュレーションで取りうる視点。
 *
 * P4-3 まではこの2つに限定。拡張は CEO 承認制。
 * P4-3 内の実装順: alternative_part → other_party
 */
export type CounterfactualPerspective =
  | "other_party"       // ユーザーの語りから再構成した「相手の見え方候補」
  | "alternative_part"  // 自分の別の反応パターン（内部は Parts、表は「別の角度」）
  ;

/** 視点の日本語ラベル（analytics / ログ用。ユーザー向けではない） */
export const PERSPECTIVE_LABELS: Record<CounterfactualPerspective, string> = {
  other_party: "相手の見え方候補",
  alternative_part: "別パートの反応候補",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シミュレーション入力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 反事実シミュレーションへの入力 */
export interface CounterfactualInput {
  /** どの視点でシミュレーションするか */
  perspective: CounterfactualPerspective;

  /** 対象の状況（ユーザーが話した具体的な場面） */
  situation: string;

  /** other_party の場合: 相手の情報（ユーザーが語った範囲のみ） */
  otherPartyContext: OtherPartyContext | null;

  /** alternative_part の場合: どのパートを起点にするか */
  sourcePart: PartIdentifier | null;

  /** 現在の Parts activation（P2-3 から取得）の要約 */
  currentPartsActivation: PartsActivationSummary;

  /** ユーザーの personality 要約（Stargazer 45軸からの抜粋） */
  personalitySummary: string;
}

/**
 * 相手の情報 — ユーザーが語った範囲のみ。
 *
 * Alter は相手を直接観測していない。
 * ここに入るのは「ユーザーが語った相手の行動・発言」だけであり、
 * Alter が推測で補完してはいけない。
 *
 * observedBehaviors の品質基準（P4-3 で適用）:
 *   - 直接引用 or 具体的行動のみ
 *   - ユーザーの解釈文は除外（「上司が怒っていた」は解釈、「上司が机を叩いた」は観察）
 *   - 最低2件必須（OTHER_PARTY_MIN_BEHAVIORS）
 */
export interface OtherPartyContext {
  /** ユーザーが相手をどう呼んでいるか（「上司」「彼女」「友達」等） */
  role: string;

  /**
   * ユーザーが語った相手の具体的な行動・発言。
   * 解釈文ではなく観察文のみ。
   * P4-3 で other_party を使うには最低 OTHER_PARTY_MIN_BEHAVIORS 件必須。
   */
  observedBehaviors: string[];

  /** 相手との関係の温度（RelationalLens から。0-1） */
  relationalTemperature: number;
}

/**
 * パートの識別子。
 *
 * 内部でのみ使用。ユーザー向け出力では:
 *   - protective → 「慎重な見方」「守りに入った場合」
 *   - vulnerable → 「素の反応」「ガードを外した場合」
 *   - reactive  → 「とっさの反応」「反射的な場合」
 */
export type PartIdentifier = "protective" | "vulnerable" | "reactive";

/** Parts 言語をユーザー向け表現に変換するマッピング */
export const PART_EXTERNAL_LABELS: Record<PartIdentifier, string> = {
  protective: "慎重な見方",
  vulnerable: "素の反応",
  reactive: "とっさの反応",
};

/** P2-3 Parts Lens の activation 要約（counterfactual 用） */
export interface PartsActivationSummary {
  /** 現在の dominant part */
  dominantPart: string;
  /** protective activation level (0-1) */
  protectiveLevel: number;
  /** vulnerable activation level (0-1) */
  vulnerableLevel: number;
  /** reactive activation level (0-1) */
  reactiveLevel: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 解禁ゲート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 解禁判定のブロック理由コード。
 *
 * analytics とデバッグで「なぜ弾かれたか」を追跡するために使う。
 * P1/P3 の reason code パターンと整合。
 *
 * 優先順位（上が高い）:
 *   1. 絶対禁止: abuse_context, exile_proximity, user_rejection
 *   2. 安全条件: dignity, rupture
 *   3. 段階条件: phase, trust
 *   4. 証拠条件: low_evidence, parts_unclear
 *   5. 実装状態: not_implemented
 */
export type CounterfactualBlockReason =
  | "blocked_by_abuse_context"    // abuse / coercion 文脈（絶対禁止・最高優先）
  | "blocked_by_exile_proximity"  // exile（深い脆弱性）に近接中（絶対禁止）
  | "blocked_by_user_rejection"   // ユーザーが反事実を拒否（絶対禁止）
  | "blocked_by_dignity"          // dignity risk 検出中
  | "blocked_by_rupture"          // rupture 検出中
  | "blocked_by_phase"            // Phase 4 未満（counterfactualAccess = false）
  | "blocked_by_trust"            // Trust レベル不足（Trust < 3）
  | "blocked_by_low_evidence"     // other_party の observedBehaviors 不足
  | "blocked_by_parts_unclear"    // Parts dominant = unclear（証拠不足）
  | "blocked_by_parts_low_signals" // Parts signalCount < 2
  | "blocked_by_not_implemented"  // この視点の生成パイプラインが未実装（P4-3 で解除）
  ;

/** 解禁判定の結果 */
export interface CounterfactualGateResult {
  /** 許可されたか */
  allowed: boolean;
  /** 最高優先度のブロック理由（allowed = true の場合は null） */
  reason: CounterfactualBlockReason | null;
  /** 該当した全ブロック理由（analytics 用。allowed = true の場合は空配列） */
  allBlockReasons: CounterfactualBlockReason[];
}

/** isCounterfactualAllowed に渡す Parts の状態 */
export interface CounterfactualPartsContext {
  /** dominant part（"unclear" / "balanced" / "protective" / "vulnerable" / "reactive"） */
  dominantPart: string;
  /** P2-3 Parts Lens の signalCount */
  signalCount: number;
}

/** alternative_part 解禁に必要な最小 Parts signal 数 */
export const ALTERNATIVE_PART_MIN_SIGNALS = 2;

/**
 * 反事実シミュレーションが許可されるか判定する。
 *
 * alternative_part: 本実装。条件を満たせば allowed = true。
 * other_party: blocked_by_not_implemented で明示封印。P4-3 後半で解除。
 *
 * 判定順序（優先順位順）:
 *   1. 絶対禁止チェック（abuse / exile / user rejection）
 *   2. 安全条件チェック（dignity / rupture）
 *   3. 段階条件チェック（Phase / Trust — Trust×Phase 交差制御）
 *   4. 視点別条件チェック
 *      - alternative_part: Parts dominant != unclear, signalCount >= 2
 *      - other_party: blocked_by_not_implemented（P4-3 まで封印）
 */
export function isCounterfactualAllowed(
  phase: HdmPhase,
  trustLevel: TrustLevel,
  dignityRisk: boolean,
  ruptureActive: boolean,
  perspective: CounterfactualPerspective,
  otherPartyContext: OtherPartyContext | null,
  abuseContext?: boolean,
  exileProximity?: boolean,
  userRejection?: boolean,
  partsContext?: CounterfactualPartsContext | null,
): CounterfactualGateResult {
  const reasons: CounterfactualBlockReason[] = [];

  // ── 1. 絶対禁止（Phase / Trust に関わらず） ──

  if (abuseContext) {
    reasons.push("blocked_by_abuse_context");
  }
  if (exileProximity) {
    reasons.push("blocked_by_exile_proximity");
  }
  if (userRejection) {
    reasons.push("blocked_by_user_rejection");
  }

  // ── 2. 安全条件 ──

  if (dignityRisk) {
    reasons.push("blocked_by_dignity");
  }
  if (ruptureActive) {
    reasons.push("blocked_by_rupture");
  }

  // ── 3. 段階条件（Trust × Phase 交差: 両方満たす必要がある） ──

  if (phase < 4) {
    reasons.push("blocked_by_phase");
  }
  if (trustLevel < 3) {
    reasons.push("blocked_by_trust");
  }

  // ── 4. 視点別条件 ──

  if (perspective === "alternative_part") {
    // Parts の証拠が十分か
    if (partsContext) {
      if (partsContext.dominantPart === "unclear") {
        reasons.push("blocked_by_parts_unclear");
      }
      if (partsContext.signalCount < ALTERNATIVE_PART_MIN_SIGNALS) {
        reasons.push("blocked_by_parts_low_signals");
      }
    } else {
      // partsContext が渡されなかった = Parts 情報なし → 証拠不足
      reasons.push("blocked_by_parts_unclear");
    }
  } else if (perspective === "other_party") {
    // P4-3 後半まで封印。条件チェックは書くが最後に not_implemented でブロック。
    if (otherPartyContext) {
      if (otherPartyContext.observedBehaviors.length < OTHER_PARTY_MIN_BEHAVIORS) {
        reasons.push("blocked_by_low_evidence");
      }
    } else {
      reasons.push("blocked_by_low_evidence");
    }
    // 生成パイプライン未実装のため封印
    reasons.push("blocked_by_not_implemented");
  }

  // ── 結果構築 ──

  if (reasons.length === 0) {
    return { allowed: true, reason: null, allBlockReasons: [] };
  }
  return { allowed: false, reason: reasons[0], allBlockReasons: reasons };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 制約定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * other_party の confidence 上限（内部管理値）。
 * ユーザーの語りからの再構成であり、構造的にバイアスがかかるため。
 * ユーザーには数値を表示しない。定性表現のみ。
 */
export const OTHER_PARTY_CONFIDENCE_CAP = 0.5;

/**
 * alternative_part の confidence 上限（内部管理値）。
 * Parts の activation データに基づくが、反事実推論はデータの外に出るため。
 */
export const ALTERNATIVE_PART_CONFIDENCE_CAP = 0.8;

/**
 * other_party で必要な最小 observedBehaviors 数。
 * 具体的行動が不足している状態で相手の見え方を推測するのは無責任。
 * P4-3 では解釈文ではなく観察文のみをカウントする。
 */
export const OTHER_PARTY_MIN_BEHAVIORS = 2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// フレーミング制約（P4-4 で検証ロジックを実装）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザー向け出力で使用すべきフレーミング表現。
 *
 * 「真実」として出さず、「可能性の候補」として出す。
 * parts 言語は使わず、「別の角度」に統一する。
 * confidence は内部管理のみ。ユーザーには定性表現で伝える。
 */
export const COUNTERFACTUAL_FRAMING = {
  /** other_party 視点のプレフィックス候補 */
  otherPartyPrefixes: [
    "こう見えている可能性もある",
    "別の角度では、こう受け取られているかもしれない",
    "もう一つの見え方としては",
  ],
  /** alternative_part 視点のプレフィックス候補 */
  alternativePartPrefixes: [
    "別の角度から見ると",
    "もう一つの見え方としては",
    "違う反応の仕方もあり得る",
  ],
  /** 必ず含めるべき hedge 表現（1つ以上を出力に含むこと） */
  requiredHedges: [
    "かもしれない",
    "可能性",
    "一つの見え方",
    "こう読める余地",
  ],
  /** 禁止表現（これらが出力に含まれていたらブロック） */
  prohibitedPhrases: [
    "確実に",
    "間違いなく",
    "絶対に",
    "相手はこう思っている",
    "本当は",
    "あなたの本心は",
    "本当の気持ちは",
  ],
} as const;

/**
 * 絶対禁止条件（P4-2 でゲートに組み込む）。
 *
 * これらの条件下では Phase / Trust に関わらず反事実シミュレーションを禁止する。
 * dignity risk や rupture とは別枠で、より厳格に適用される。
 */
export const ABSOLUTE_PROHIBITIONS = {
  /** abuse / coercion 文脈: 「相手にも事情がある」は加害の正当化に使われうる */
  abuseContext: true,
  /** 明示的な脆弱性（exile proximity）: 深い傷に近いとき別視点は侵襲的 */
  exileProximity: true,
  /** ユーザーが反事実を拒否した場合（「別の見方とかいらない」等） */
  userRejection: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ゲート Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 反事実シミュレーションのゲート analytics。
 *
 * P4-1 ではゲート判定のみ。実行結果の analytics は P4-3 で追加する。
 */
export interface CounterfactualGateAnalytics {
  /** ゲート判定結果 */
  gateResult: CounterfactualGateResult;
  /** 要求された視点（ゲートで弾かれた場合も記録） */
  requestedPerspective: CounterfactualPerspective | null;
  /** 入力された Phase */
  phase: HdmPhase;
  /** 入力された Trust Level */
  trustLevel: TrustLevel;
}

/**
 * ゲート analytics を構築する。
 * ゲートで弾かれた場合も「なぜ弾かれたか」を記録する。
 */
export function buildCounterfactualGateAnalytics(
  gateResult: CounterfactualGateResult,
  requestedPerspective: CounterfactualPerspective | null,
  phase: HdmPhase,
  trustLevel: TrustLevel,
): CounterfactualGateAnalytics {
  return {
    gateResult,
    requestedPerspective,
    phase,
    trustLevel,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: Shift Direction（介入型視点変換）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// これは Pearl Level 2（介入: do(X)）に相当する。
// Level 3（反事実: had X been different）は P4 後半以降。
//
// 原則:
// - shift direction はテーブルで固定。LLM に方向を決めさせない
// - 変換幅は「一段」に制限。大幅な変換は禁止
// - Exile へ前進しない。「核心はこれだ」「本当はこう思っている」は禁止

/** 視点変換の方向。パートごとに固定の3方向のみ */
export type CounterfactualShiftDirection =
  | "less_guarded"    // protective → 警戒を緩めたら
  | "more_composed"   // reactive → 一呼吸置いたら
  | "more_boundaried" // vulnerable → 境界を持ったら
  ;

/** shift direction の定義テーブル */
export interface ShiftDirectionEntry {
  /** 変換元のパート */
  fromPart: PartIdentifier;
  /** 変換の方向 */
  direction: CounterfactualShiftDirection;
  /** micro-LLM に渡す問い（構造化された prompt template） */
  promptQuestion: string;
  /** 変換の説明（ログ / analytics 用） */
  description: string;
}

/**
 * shift direction テーブル。P4-3 前半では3方向に固定。
 * 拡張は CEO 承認制。
 */
export const SHIFT_DIRECTION_TABLE: readonly ShiftDirectionEntry[] = [
  {
    fromPart: "protective",
    direction: "less_guarded",
    promptQuestion: "この状況で警戒を少し緩めたら、何を感じる余地があるか。1-2文で、可能性として述べよ。",
    description: "protective → less_guarded: 警戒を緩めた場合の感覚",
  },
  {
    fromPart: "reactive",
    direction: "more_composed",
    promptQuestion: "この反応が一呼吸置いた後のものだったら、何が残るか。1-2文で、可能性として述べよ。",
    description: "reactive → more_composed: 落ち着いた場合の残存感覚",
  },
  {
    fromPart: "vulnerable",
    direction: "more_boundaried",
    promptQuestion: "この感覚にもう少し境界があったら、何ができるか。1-2文で、可能性として述べよ。",
    description: "vulnerable → more_boundaried: 境界がある場合の行動余地",
  },
] as const;

/**
 * dominant part から shift direction を決定する。
 *
 * balanced の場合は sourcePart を明示指定する必要がある。
 * unclear の場合は P4-2 ゲートでブロック済みのため到達しない。
 */
export function resolveShiftDirection(
  dominantPart: string,
  sourcePart: PartIdentifier | null,
): ShiftDirectionEntry | null {
  // balanced → sourcePart 必須
  const effectivePart: string = dominantPart === "balanced"
    ? (sourcePart ?? "")
    : dominantPart;

  return SHIFT_DIRECTION_TABLE.find(e => e.fromPart === effectivePart) ?? null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: Internal Candidate（最小出力型）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** candidateText の最大文字数 */
export const CANDIDATE_TEXT_MAX_LENGTH = 200;

/** 内部候補（shadow mode — ユーザーに直接露出しない） */
export interface InternalCandidate {
  /** 視点 */
  perspective: "alternative_part";
  /** 変換元パート */
  sourcePart: PartIdentifier;
  /** shift direction */
  direction: CounterfactualShiftDirection;
  /** micro-LLM が生成した候補テキスト（analytics 保存時は safe でなければ redact） */
  candidateText: string;
  /** confidence (0-1, 内部管理値。上限 ALTERNATIVE_PART_CONFIDENCE_CAP) */
  confidence: number;
  /** ルールベース検証の結果。LLM ではなく validateCandidateSafety() が判定 */
  safeForIntegration: boolean;
  /** safety violation の詳細（safe の場合は空配列） */
  safetyViolations: CandidateSafetyViolation[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: Safety Validation（ルールベース純関数）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** safety violation の種類 */
export type CandidateSafetyViolationType =
  | "prohibited_phrase"    // COUNTERFACTUAL_FRAMING.prohibitedPhrases にヒット
  | "exile_language"       // Exile 接触語にヒット
  | "psych_label_exposed"  // 心理学ラベルがユーザー向け表現に露出
  | "too_long"             // candidateText が上限を超過
  ;

/** safety violation の詳細 */
export interface CandidateSafetyViolation {
  type: CandidateSafetyViolationType;
  /** ヒットした語句（too_long の場合は長さ） */
  detail: string;
}

/** Exile 接触語（「核心はこれだ」「本当の自分」等） */
const EXILE_LANGUAGE = [
  "核心",
  "本当の自分",
  "トラウマ",
  "根本的な原因",
  "心の奥底",
  "本当の気持ち",
  "あなたの本心",
  "隠された",
  "抑圧された",
] as const;

/** 心理学ラベル（内部用語がユーザー向けに露出していないか） */
const PSYCH_LABELS = [
  "プロテクター",
  "エグザイル",
  "パート",
  "IFS",
  "内的家族",
  "防衛機制",
  "反応パート",
  "脆弱パート",
] as const;

/**
 * 候補テキストの安全性をルールベースで検証する。
 *
 * LLM は candidateText を生成するだけ。
 * 安全性判定はこの純関数が行う。LLM に自己判定させない。
 *
 * チェック項目:
 *   1. 禁止表現（COUNTERFACTUAL_FRAMING.prohibitedPhrases）
 *   2. Exile 接触語
 *   3. 心理学ラベル露出
 *   4. 長さ上限
 */
export function validateCandidateSafety(candidateText: string): {
  safe: boolean;
  violations: CandidateSafetyViolation[];
} {
  const violations: CandidateSafetyViolation[] = [];

  // 1. 禁止表現
  for (const phrase of COUNTERFACTUAL_FRAMING.prohibitedPhrases) {
    if (candidateText.includes(phrase)) {
      violations.push({ type: "prohibited_phrase", detail: phrase });
    }
  }

  // 2. Exile 接触語
  for (const term of EXILE_LANGUAGE) {
    if (candidateText.includes(term)) {
      violations.push({ type: "exile_language", detail: term });
    }
  }

  // 3. 心理学ラベル露出
  for (const label of PSYCH_LABELS) {
    if (candidateText.includes(label)) {
      violations.push({ type: "psych_label_exposed", detail: label });
    }
  }

  // 4. 長さ上限
  if (candidateText.length > CANDIDATE_TEXT_MAX_LENGTH) {
    violations.push({ type: "too_long", detail: `${candidateText.length}/${CANDIDATE_TEXT_MAX_LENGTH}` });
  }

  return { safe: violations.length === 0, violations };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: Shadow Mode Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shadow mode の analytics（ユーザー応答に影響なし、記録のみ）。
 *
 * unsafe 候補の本文は analytics 保存時に redact する。
 * debug ログにのみ原文を出力（ログレベル分離）。
 */
export interface CounterfactualShadowAnalytics {
  /** ゲート判定結果 */
  gateResult: CounterfactualGateResult;
  /** 生成が実行されたか */
  generated: boolean;
  /** 生成された場合の候補サマリ */
  candidate: {
    perspective: "alternative_part";
    sourcePart: PartIdentifier;
    direction: CounterfactualShiftDirection;
    confidence: number;
    safeForIntegration: boolean;
    /** safety violations（unsafe の場合） */
    violations: CandidateSafetyViolation[];
    /** safe な場合のみ本文を含む。unsafe の場合は "[REDACTED]" */
    candidateTextOrRedacted: string;
  } | null;
  /** 生成の所要時間（ms） */
  generationLatencyMs: number | null;
}

/**
 * shadow mode analytics を構築する。
 *
 * unsafe 候補の本文は "[REDACTED]" に置換。
 * debug ログへの原文出力は呼び出し側の責任。
 */
export function buildShadowAnalytics(
  gateResult: CounterfactualGateResult,
  candidate: InternalCandidate | null,
  latencyMs: number | null,
): CounterfactualShadowAnalytics {
  return {
    gateResult,
    generated: candidate !== null,
    candidate: candidate ? {
      perspective: candidate.perspective,
      sourcePart: candidate.sourcePart,
      direction: candidate.direction,
      confidence: candidate.confidence,
      safeForIntegration: candidate.safeForIntegration,
      violations: candidate.safetyViolations,
      candidateTextOrRedacted: candidate.safeForIntegration
        ? candidate.candidateText
        : "[REDACTED]",
    } : null,
    generationLatencyMs: latencyMs,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-4: Safety Integration Layer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 候補テキスト → hedge wrapper → post-check → integration decision
//
// perspective-agnostic に設計（alternative_part / other_party 共通）。
// ただし P4-4 時点では alternative_part のみ起動・テスト。
//
// post-check は validateCandidateSafety() の再利用。
// hedge wrapper が禁止表現を注入しないことを保証するため、
// hedge 後テキストにも同じ検証を通す。

/**
 * 候補テキストに hedge prefix を付与する。
 *
 * COUNTERFACTUAL_FRAMING から perspective に応じたプレフィックスを選択し、
 * candidateText の先頭に付与する。
 *
 * 選択ロジック: situation の長さをシードにした決定的選択（ランダムではない）。
 * テスト可能性を担保するため。
 */
export function applyHedgeWrapper(
  candidateText: string,
  perspective: CounterfactualPerspective,
  situation: string,
): string {
  const prefixes = perspective === "other_party"
    ? COUNTERFACTUAL_FRAMING.otherPartyPrefixes
    : COUNTERFACTUAL_FRAMING.alternativePartPrefixes;

  // 決定的選択: situation の長さ mod プレフィックス数
  const index = situation.length % prefixes.length;
  const prefix = prefixes[index];

  return `${prefix}、${candidateText}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-4b: Integration Decision
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 統合判定の結果。Alter（再統合層）が候補をどう扱うかを決定する。
 *
 * ── 命名意図（確定。将来改名しない）──
 *
 * hedge = 安全装置（「別の角度から見ると」等のプレフィックス）。弱化ではない。
 * hedge 付きが「正しい完全形」、hedge なしが「安全装置欠落の劣化形」。
 *
 * - adopted:  hedge 付き完全形で採用（元テキスト safe + hedge 後も safe → 最良）
 * - weakened: hedge を付けられなかった劣化形で採用（元テキスト safe + hedge 後 violation → hedge 脱落）
 * - rejected: 元テキストが unsafe → 棄却（テキストを返さない）
 */
export type IntegrationDecision = "adopted" | "weakened" | "rejected";

/** integration decision の結果 */
export interface IntegrationResult {
  decision: IntegrationDecision;
  /** 最終的にユーザーに提示可能なテキスト（rejected の場合は null） */
  finalText: string | null;
  /** 元候補の safety violations */
  originalViolations: CandidateSafetyViolation[];
  /** hedge 後テキストの safety violations（rejected の場合は空配列） */
  hedgedViolations: CandidateSafetyViolation[];
}

/**
 * 候補テキストの統合判定を行う。
 *
 * 1. 元候補を validateCandidateSafety() で検証
 *    → unsafe なら rejected（テキストを返さない）
 * 2. hedge wrapper を適用
 * 3. hedge 後テキストを validateCandidateSafety() で再検証
 *    → unsafe なら weakened（hedge なしで採用）
 *    → safe なら adopted（hedge 付きで採用）
 *
 * perspective-agnostic: alternative_part / other_party 共通ロジック。
 */
export function computeIntegrationDecision(
  candidateText: string,
  perspective: CounterfactualPerspective,
  situation: string,
): IntegrationResult {
  // 1. 元候補の安全性検証
  const originalCheck = validateCandidateSafety(candidateText);
  if (!originalCheck.safe) {
    return {
      decision: "rejected",
      finalText: null,
      originalViolations: originalCheck.violations,
      hedgedViolations: [],
    };
  }

  // 2. hedge wrapper 適用
  const hedgedText = applyHedgeWrapper(candidateText, perspective, situation);

  // 3. hedge 後テキストの安全性再検証
  const hedgedCheck = validateCandidateSafety(hedgedText);
  if (!hedgedCheck.safe) {
    // hedge が violation を注入 → hedge なしで採用（weakened）
    return {
      decision: "weakened",
      finalText: candidateText,
      originalViolations: [],
      hedgedViolations: hedgedCheck.violations,
    };
  }

  // 安全 → hedge 付きで採用
  return {
    decision: "adopted",
    finalText: hedgedText,
    originalViolations: [],
    hedgedViolations: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: Candidate Prompt Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * micro-LLM に渡す system prompt を構築する。
 *
 * Alter の内側から発話する構造を維持しつつ、
 * shift direction で指定された方向のみに候補を生成する。
 *
 * 生成方式の詳細（LLM provider の選定、timeout 等）は
 * route.ts 側で決定する。ここでは prompt テキストのみ構築。
 */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-6: Live Integration — Alter 向け prompt 注入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Alter の main system prompt に注入する視点候補ブロックを構築する。
 *
 * ── 3層アーキテクチャでの位置づけ ──
 *   micro-LLM（補助）が生成した候補を、Alter（再統合）に渡す接続点。
 *   Alter は自分の言葉で統合するか、無視する。そのまま引用しない。
 *
 * ── 安全制約 ──
 *   - candidateText はそのまま出力禁止（引用禁止を明示）
 *   - parts 言語は含まない（P4-3 の buildCandidatePrompt で既に排除済み）
 *   - direction の説明は内部用（ユーザーに見せない）
 */
export function buildCounterfactualPromptBlock(
  finalText: string,
  direction: CounterfactualShiftDirection,
): string {
  return [
    "",
    "## 別の角度（内部参照 — そのまま出力しないこと）",
    "以下の視点候補が利用可能です。",
    "ユーザーの状況に自然に織り込むか、無視してください。",
    "【厳守】そのまま引用・コピーして出力しないこと。あなた自身の言葉で再構成すること。",
    `候補（${direction}）: 「${finalText}」`,
    "",
  ].join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-6: 送信前 Post-Check（最終出力検証）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** post-check violation の種類 */
export type IntegratedOutputViolationType =
  | "candidate_verbatim"      // candidateText がそのまま最終出力に含まれている
  | "prohibited_phrase"       // 禁止表現
  | "exile_language"          // Exile 接触語
  | "psych_label_exposed"     // 心理学ラベル露出
  ;

/** post-check violation の詳細 */
export interface IntegratedOutputViolation {
  type: IntegratedOutputViolationType;
  detail: string;
}

/** post-check の結果 */
export interface IntegratedOutputCheckResult {
  pass: boolean;
  violations: IntegratedOutputViolation[];
}

/**
 * counterfactual 統合後の最終出力を検証する。
 *
 * Alter が prompt block を無視して candidateText をそのまま引用したり、
 * 禁止表現を含む応答を生成していないかを検証する。
 *
 * ── チェック項目 ──
 *   1. candidateText の完全一致（Alter が引用禁止を無視した場合の最終防衛線）
 *   2. 禁止表現（COUNTERFACTUAL_FRAMING.prohibitedPhrases）
 *   3. Exile 接触語
 *   4. 心理学ラベル露出
 *
 * 注意: too_long は対象外（最終応答は候補テキストより長いのが普通）。
 * 近似一致は対象外（基準が曖昧。完全一致で十分。後で追加可能）。
 *
 * 違反時: counterfactual 統合を破棄し、通常応答にフォールバックする。
 */
export function validateIntegratedOutput(
  responseText: string,
  candidateText: string,
): IntegratedOutputCheckResult {
  const violations: IntegratedOutputViolation[] = [];

  // 1. candidateText の完全一致
  if (responseText.includes(candidateText)) {
    violations.push({ type: "candidate_verbatim", detail: candidateText.slice(0, 50) });
  }

  // 2. 禁止表現
  for (const phrase of COUNTERFACTUAL_FRAMING.prohibitedPhrases) {
    if (responseText.includes(phrase)) {
      violations.push({ type: "prohibited_phrase", detail: phrase });
    }
  }

  // 3. Exile 接触語
  for (const term of EXILE_LANGUAGE) {
    if (responseText.includes(term)) {
      violations.push({ type: "exile_language", detail: term });
    }
  }

  // 4. 心理学ラベル
  for (const label of PSYCH_LABELS) {
    if (responseText.includes(label)) {
      violations.push({ type: "psych_label_exposed", detail: label });
    }
  }

  return { pass: violations.length === 0, violations };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4-3 前半: Candidate Prompt Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildCandidatePrompt(
  shift: ShiftDirectionEntry,
  situation: string,
  personalitySummary: string,
): string {
  return [
    "あなたはユーザーの内側にいる視点変換の補助です。",
    "以下の状況で、指定された方向に一段だけ視点をずらした場合の候補を生成してください。",
    "",
    "## 制約（厳守）",
    "- 1-2文以内で回答",
    "- 「可能性」「かもしれない」等の hedge 表現を必ず含める",
    "- 断定しない（「確実に」「間違いなく」「絶対に」は禁止）",
    "- 「本当は」「核心」「トラウマ」「本当の自分」等は禁止",
    "- 心理学用語（パート、プロテクター、エグザイル、IFS）は禁止",
    "- 「別の角度では」「もう一つの見え方としては」のような開始で",
    "",
    `## 変換方向: ${shift.description}`,
    `## 問い: ${shift.promptQuestion}`,
    "",
    `## ユーザーの状況: ${situation}`,
    `## 性格要約: ${personalitySummary}`,
  ].join("\n");
}
