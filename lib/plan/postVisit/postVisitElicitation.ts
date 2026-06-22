/**
 * lib/plan/postVisit/postVisitElicitation.ts
 *   — 評価OS / Stage 0: 「いつ聞くか / 何を聞くか」の pure 判定（dormant）
 *
 * ★最重要は「いつ聞かないか」。デフォルトは沈黙。trigger ホワイトリストに合致し、かつ suppress に
 *   一切該当しない時だけ elicit する。**suppress は trigger に優先する**（うざさ・捏造誘発・privacy を防ぐ）。
 * ★pure: Date/network/DB なし。`now` と各 signal は呼び出し側が derived 値で渡す（生 GPS/住所/dwell 分は渡さない）。
 */
import type { PurposeLens } from "@/lib/plan/candidateLens/purposeLens";
import {
  POST_VISIT_RESPONSES,
  POST_VISIT_RESPONSE_LABEL,
  REASON_CHIPS,
  REASON_CHIP_LABEL,
  type PostVisitResponse,
  type ReasonChipKey,
  type PostVisitTrigger,
  type SuppressReason,
  type DwellSignal,
} from "./postVisitObservation";

const DAY_MS = 24 * 60 * 60 * 1000;
/** skip/拒否「直後」のクールダウン（この間は再度聞かない）。 */
export const AFTER_SKIP_COOLDOWN_MS = 7 * DAY_MS;
/** 同型質問の「直近」窓（同じ場所×同型を再度聞かない）。 */
export const RECENT_SAME_COOLDOWN_MS = 30 * DAY_MS;

/** elicit 判定の入力（★全て derived・生データを含めない）。 */
export interface ElicitContext {
  // ── trigger signals ──
  readonly isLensProposed: boolean;   // Candidate Lens が提案した場所
  readonly isFirstVisit: boolean;     // 初訪問
  readonly isImportantPlan: boolean;  // 重要予定
  readonly isDiscoveryDomain: boolean;// 旅行/食/観光/Location Notes 由来の行動
  readonly dwellSignal: DwellSignal | null; // early/long → trigger（正確な分でなく粗い signal）
  // ── suppress signals ──
  readonly isSensitive: boolean;      // sensitive category（医療/宗教/住所 等）
  readonly isHomeOrWork: boolean;     // 自宅/職場
  readonly isHabitual: boolean;       // コンビニ/駅/日常移動
  readonly isHighFatigue: boolean;    // 疲労が強い
  readonly lastSkippedAt: number | null;       // 直近に skip/拒否した時刻（ms）
  readonly lastSimilarElicitAt: number | null; // 同型を直近に聞いた時刻（ms）
  readonly now: number;
}

export interface ElicitDecision {
  readonly elicit: boolean;
  readonly trigger: PostVisitTrigger | null;
  readonly suppressedBy: SuppressReason | null;
}

/** suppress 判定（優先順・最初に当たった理由を返す）。該当なしで null。 */
function firstSuppress(ctx: ElicitContext): SuppressReason | null {
  if (ctx.isSensitive) return "sensitive";                 // privacy 最優先
  if (ctx.isHomeOrWork) return "home_work";
  if (ctx.isHabitual) return "habitual";
  if (ctx.isHighFatigue) return "high_fatigue";
  if (ctx.lastSkippedAt != null && ctx.now - ctx.lastSkippedAt < AFTER_SKIP_COOLDOWN_MS) return "after_skip";
  if (ctx.lastSimilarElicitAt != null && ctx.now - ctx.lastSimilarElicitAt < RECENT_SAME_COOLDOWN_MS) return "recent_same";
  return null;
}

/** trigger 判定（情報量の高い順）。該当なしで null。 */
function firstTrigger(ctx: ElicitContext): PostVisitTrigger | null {
  if (ctx.isLensProposed) return "lens_proposed";   // 提案の答え合わせが最重要
  if (ctx.isImportantPlan) return "important_plan";
  if (ctx.dwellSignal === "early") return "early_leave";
  if (ctx.dwellSignal === "long") return "long_stay";
  if (ctx.isFirstVisit) return "first_visit";
  if (ctx.isDiscoveryDomain) return "discovery_domain";
  return null;
}

/**
 * 聞くべきか（pure・★suppress が trigger に優先）。
 *   - suppress に該当 → elicit=false（suppressedBy 付き）
 *   - trigger に該当なし → elicit=false（沈黙がデフォルト）
 *   - suppress なし & trigger あり → elicit=true
 */
export function shouldElicit(ctx: ElicitContext): ElicitDecision {
  const suppressedBy = firstSuppress(ctx);
  if (suppressedBy) return { elicit: false, trigger: null, suppressedBy };
  const trigger = firstTrigger(ctx);
  if (!trigger) return { elicit: false, trigger: null, suppressedBy: null };
  return { elicit: true, trigger, suppressedBy: null };
}

// ── prompt 生成（pure・★星でなく「記憶整理／未来の自分を楽にする」フレーム）──
export interface PostVisitPrompt {
  /** 問い（レビュー依頼でなく「次も候補に残す?」型）。 */
  readonly question: string;
  /** 4 択（1-tap）。 */
  readonly responses: ReadonlyArray<{ readonly key: PostVisitResponse; readonly label: string }>;
  /** 回答後に任意で出す理由 chip（固定集合・free text なし）。 */
  readonly reasonChips: ReadonlyArray<{ readonly key: ReasonChipKey; readonly label: string }>;
  /** 自己便益のフレーム文（レビュー投稿でなく次回提案の改善）。 */
  readonly framingNote: string;
}

const QUESTION_BY_TRIGGER: Record<PostVisitTrigger, string> = {
  lens_proposed: "この場所、次も候補に残す？",
  important_plan: "この場所、次の大事な予定でも候補に残す？",
  early_leave: "この場所、次も候補に残す？",
  long_stay: "この場所、次も候補に残す？",
  first_visit: "はじめての場所でした。次も候補に残す？",
  discovery_domain: "この場所、次の似た予定でも候補に残す？",
};

/** trigger（と任意の lens）から prompt を組む（pure）。reason chips は固定・star 表示なし。 */
export function buildPostVisitPrompt(trigger: PostVisitTrigger, _lens?: PurposeLens): PostVisitPrompt {
  return {
    question: QUESTION_BY_TRIGGER[trigger],
    responses: POST_VISIT_RESPONSES.map((key) => ({ key, label: POST_VISIT_RESPONSE_LABEL[key] })),
    reasonChips: REASON_CHIPS.map((key) => ({ key, label: REASON_CHIP_LABEL[key] })),
    framingNote: "次の提案に覚えておきます（評価の投稿ではありません）",
  };
}
