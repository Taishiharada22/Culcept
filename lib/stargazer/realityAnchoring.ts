/**
 * Reality Anchoring — HDM v1 P5: 現実返還
 *
 * Alter の内的理解を「現実の小さな着地点」に変換する。
 *
 * ── 設計思想 ──
 *
 * 行動指示ではなく、ユーザーの判断原理・価値観から導く。
 * 「あなたはこういうタイプだから、こうするのが自然な一歩かもしれない」
 * のように、自己理解を現実に着地させる補助。
 *
 * ── P4 との違い ──
 *
 * P4（多視点統合）: 「別の角度では…」— 視点を広げる
 * P5（現実返還）: 「あなたの傾向から見ると、現実の一手は…」— 視点を着地させる
 *
 * ── Gate 条件 ──
 *
 * Phase ≥ 5 / Trust ≥ 4 / rupture なし / dignity risk なし / protective 非スパイク
 * clarify mode では出さない（判断が確定していない段階で着地を出すのは危険）
 *
 * ── 安全制約 ──
 *
 * - reactive 高い時に決断を急がせない
 * - dignity を削る提案をしない
 * - ActionShape=skip の時は「何もしない」を肯定する（行動を押し込まない）
 * - 提案は常に「小さな一歩」（大きな決断を促さない）
 *
 * 学術基盤:
 *   - Implementation Intentions (Gollwitzer, 1999)
 *   - Self-Determination Theory: autonomy support > directive advice
 *   - Motivational Interviewing: elicit user's own reasons for change
 *
 * @see docs/heart-dynamics-model-v1.md §Phase 5
 */

import type { HdmPhase } from "./hdmPhase";
import type { TrustLevel } from "./alterUnderstanding";
import type { ActionShape } from "./alterHomeAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RealityAnchoringBlockReason =
  | "blocked_by_phase"
  | "blocked_by_trust"
  | "blocked_by_rupture"
  | "blocked_by_dignity"
  | "blocked_by_protective_spike"
  | "blocked_by_reactive_spike"
  | "blocked_by_clarify_mode";

export interface RealityAnchoringGateResult {
  allowed: boolean;
  reasons: RealityAnchoringBlockReason[];
}

/** P5 が最終的に prompt に注入するコンテキスト */
export interface RealityAnchoringContext {
  actionShape: ActionShape;
  knownValues: string[];
  knownFears: string[];
  unfinishedThread: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** protective / reactive がこの値以上でブロック */
const ACTIVATION_SPIKE_THRESHOLD = 0.75;

/**
 * P5 Reality Anchoring の Gate 判定。
 *
 * Phase 5 / Trust 4 以上 + 安全条件を満たした場合のみ allowed: true。
 * P4 gate と同じ構造（reasons 配列で全ブロック理由を返す）。
 */
export function isRealityAnchoringAllowed(
  phase: HdmPhase,
  trustLevel: TrustLevel,
  ruptureActive: boolean,
  dignityRisk: boolean,
  protectiveActivation: number,
  reactiveActivation: number,
  isClarifyMode: boolean,
): RealityAnchoringGateResult {
  const reasons: RealityAnchoringBlockReason[] = [];

  if (phase < 5) reasons.push("blocked_by_phase");
  if (trustLevel < 4) reasons.push("blocked_by_trust");
  if (ruptureActive) reasons.push("blocked_by_rupture");
  if (dignityRisk) reasons.push("blocked_by_dignity");
  if (protectiveActivation >= ACTIVATION_SPIKE_THRESHOLD) reasons.push("blocked_by_protective_spike");
  if (reactiveActivation >= ACTIVATION_SPIKE_THRESHOLD) reasons.push("blocked_by_reactive_spike");
  if (isClarifyMode) reasons.push("blocked_by_clarify_mode");

  return { allowed: reasons.length === 0, reasons };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ActionShape ごとの着地テンプレート。
 * LLM への指示として、どういうトーンで現実着地を出すかを制御する。
 */
const ANCHORING_TEMPLATES: Record<ActionShape, string> = {
  full_go:
    "ユーザーの意志は固い。後押しの言葉と共に「最初にやる小さな一歩」を1つだけ提案する。",
  bounded_go:
    "範囲を限定して動くのがこの人に合う。「ここだけ、これだけ」の具体的な区切りを1つ提案する。",
  prepare_then_go:
    "準備してから動くのがこの人の自然なパターン。「まず何を準備するか」の小さな一手を1つ提案する。",
  trial_then_decide:
    "小さく試すのがこの人に合う。「一回だけ試せること」を1つ具体的に提案する。",
  observe_first:
    "今は動かず見ることを肯定する。「何を観察するか」の視点を1つだけ提案する。行動は求めない。",
  delegate_or_request:
    "誰かに頼るのがこの人の自然な選択。「誰に、何を聞くか」を1つだけ提案する。",
  defer_with_trigger:
    "今日は見送りを肯定する。「次に動くきっかけ」を1つだけ明確にする。焦らせない。",
  skip:
    "やめる判断を全面的に肯定する。行動提案は絶対にしない。「やめると決めた自分」を認める言葉だけ。",
};

/**
 * P5 Reality Anchoring の prompt block を生成する。
 *
 * homeSystemPrompt に追加注入するテキストブロック。
 * ActionShape + ユーザーの既知の価値観・恐れから、
 * 自己理解を現実に着地させる指示を LLM に与える。
 */
export function buildRealityAnchoringPromptBlock(
  context: RealityAnchoringContext,
): string {
  const { actionShape, knownValues, knownFears, unfinishedThread } = context;

  const template = ANCHORING_TEMPLATES[actionShape];

  const lines: string[] = [
    "# 現実返還（P5 — 内部指示・このラベルは表示しない）",
    "",
    "応答の最後に、この人の「自然な次の一歩」を1文だけ添える。",
    `行動形: ${template}`,
    "",
    "## 制約",
    "- 「こうすべき」ではなく「あなたはこういうタイプだから、こうするのが自然かもしれない」のトーン",
    "- 具体的に。抽象的な助言（「自分を大切に」等）は禁止",
    "- 大きな決断を促さない。現実で今日できる小さなことだけ",
    "- ユーザーの価値観に矛盾する提案はしない",
  ];

  if (knownValues.length > 0) {
    lines.push(`- この人の核心的価値観: ${knownValues.slice(0, 3).join("、")}`);
    lines.push("  → この価値観に沿った着地にすること");
  }

  if (knownFears.length > 0) {
    lines.push(`- この人の恐れ: ${knownFears.slice(0, 2).join("、")}`);
    lines.push("  → この恐れを刺激しない着地にすること");
  }

  if (unfinishedThread) {
    lines.push(`- 未解決スレッド: 「${unfinishedThread}」`);
    lines.push("  → 関連する場合のみ、このスレッドの文脈を着地に活かしてよい");
  }

  if (actionShape === "skip") {
    lines.push("");
    lines.push("※ skip 判定時は行動提案を絶対にしない。「何もしない」を肯定する言葉だけ。");
  }

  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P5-3: After-Action Loop（受動的フォローアップ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 前回の P5 Reality Anchoring の記録。
 * HdmPhaseState に永続化し、次ターン以降でフォローアップに使う。
 */
export interface PendingRealityAnchoring {
  /** 提案した ActionShape */
  actionShape: ActionShape;
  /** 提案の要約（prompt block から抽出した1行） */
  anchoringSummary: string;
  /** 提案日時 */
  suggestedAt: string;
  /** フォローアップ試行回数（3回超えたら expire） */
  followUpAttempts: number;
}

/** フォローアップが expire するまでの最大試行回数 */
const MAX_FOLLOW_UP_ATTEMPTS = 3;

/**
 * ユーザーのメッセージが前回の P5 提案に関連しているか受動的に検出する。
 *
 * 直接「どうだった？」とは聞かない。
 * ユーザーが自然に言及したシグナルのみを拾う。
 */
export type AfterActionSignal =
  | "did_it"          // やった（肯定的言及）
  | "didnt_do_it"     // やらなかった
  | "felt_good"       // やってよかった
  | "felt_bad"        // やって後悔 / 想定と違った
  | "no_mention";     // 言及なし

const DID_IT_PATTERNS =
  /やってみた|試してみた|やった|実行した|聞いてみた|頼んでみた|送った|伝えた|話した|動いた|行った/;
const DIDNT_DO_IT_PATTERNS =
  /やめた|やらなかった|結局.*しなかった|できなかった|無理だった|見送った|まだ.*してない/;
const FELT_GOOD_PATTERNS =
  /よかった|うまくいった|正解だった|楽になった|安心した|すっきりした|ほっとした/;
const FELT_BAD_PATTERNS =
  /失敗した|ダメだった|逆効果|後悔|やらなきゃよかった|余計.*悪く|裏目/;

/**
 * ユーザーメッセージから After-Action Signal を受動的に検出する。
 * 複数パターンがマッチした場合は最も強いシグナルを返す。
 */
export function detectAfterActionSignal(message: string): AfterActionSignal {
  // 感情シグナル（より具体的）を先に判定
  if (FELT_BAD_PATTERNS.test(message)) return "felt_bad";
  if (FELT_GOOD_PATTERNS.test(message)) return "felt_good";
  if (DID_IT_PATTERNS.test(message)) return "did_it";
  if (DIDNT_DO_IT_PATTERNS.test(message)) return "didnt_do_it";
  return "no_mention";
}

/**
 * pending anchoring が有効か（expire していないか）判定する。
 */
export function isPendingAnchoringActive(
  pending: PendingRealityAnchoring | null,
): boolean {
  if (!pending) return false;
  if (pending.followUpAttempts >= MAX_FOLLOW_UP_ATTEMPTS) return false;
  // 7日以上前の提案は expire
  const suggestedAt = new Date(pending.suggestedAt);
  const now = new Date();
  const daysDiff = (now.getTime() - suggestedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 7;
}

/**
 * After-Action Signal に基づくフォローアップ prompt block を生成する。
 * no_mention の場合は null（何も注入しない）。
 */
export function buildAfterActionPromptBlock(
  signal: AfterActionSignal,
  pending: PendingRealityAnchoring,
): string | null {
  if (signal === "no_mention") return null;

  const lines: string[] = [
    "# 前回の着地のフォローアップ（P5-3 — 内部指示・このラベルは表示しない）",
    "",
    `前回、あなたは「${pending.anchoringSummary}」という方向の着地を提案しました。`,
    "",
  ];

  switch (signal) {
    case "did_it":
      lines.push("ユーザーは実行したようです。");
      lines.push("「やってみてどうだった？」を自然に拾うこと。強要しない。");
      lines.push("実行できたこと自体を認める。結果の善し悪しより、動けたことに注目。");
      break;
    case "didnt_do_it":
      lines.push("ユーザーはやらなかったようです。");
      lines.push("やらなかった判断を否定しない。「やらない」も正しい選択として扱う。");
      lines.push("理由を聞くのではなく、今の気持ちに注目する。");
      break;
    case "felt_good":
      lines.push("ユーザーはやってよかったと感じているようです。");
      lines.push("その体験を深掘りすること。「なぜよかったか」をユーザー自身に言語化させる。");
      lines.push("これは自己理解が現実と一致した証拠。その一致を静かに認める。");
      break;
    case "felt_bad":
      lines.push("ユーザーは想定と違った、または後悔しているようです。");
      lines.push("共感を優先する。Alter が間違えた可能性を素直に認める。");
      lines.push("「あなたが思ったことと違ったなら、こちらの読みがズレていたのかもしれない」のトーン。");
      lines.push("次の提案は控えめにする。押し込まない。");
      break;
  }

  return lines.join("\n");
}

/**
 * ActionShape から anchoring summary を生成する。
 * pending に保存する用の短い要約。
 */
export function buildAnchoringSummary(actionShape: ActionShape): string {
  const SUMMARIES: Record<ActionShape, string> = {
    full_go: "全力で動く",
    bounded_go: "範囲を限定して動く",
    prepare_then_go: "準備してから動く",
    trial_then_decide: "小さく試してから決める",
    observe_first: "動かず様子を見る",
    delegate_or_request: "誰かに頼る・相談する",
    defer_with_trigger: "今日は見送り、条件が揃えば次に",
    skip: "やめる",
  };
  return SUMMARIES[actionShape];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildRealityAnchoringAnalytics(
  gateResult: RealityAnchoringGateResult,
  context: RealityAnchoringContext | null,
): Record<string, unknown> {
  return {
    p5_gate_allowed: gateResult.allowed,
    p5_gate_block_reasons: gateResult.reasons,
    p5_action_shape: context?.actionShape ?? null,
    p5_known_values_count: context?.knownValues.length ?? 0,
    p5_known_fears_count: context?.knownFears.length ?? 0,
    p5_has_unfinished_thread: context?.unfinishedThread !== null,
  };
}
