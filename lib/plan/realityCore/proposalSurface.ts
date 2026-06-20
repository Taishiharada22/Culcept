/**
 * proposalSurface — RO-5（2026-06-20）: Proposal Surface Contract / UI 併存解消 pure view-model（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro5-proposal-surface-contract-design.md（RO-5 v0.1・敵対的検証 10 mustFix 反映）
 * 思想: RO-4 ProposalRouteSetV0（pure kernel・caller=0）の初の surface consumer。internal trace（evidenceRefs/
 *   raw id）を一切露出せず、conceptKind='reaction_stance' を焼いた表示用 DTO に薄写像する。
 *
 * 二重正本化回避（CEO 最重要）:
 *   - copySurface(RJ2e)は「no proposal / 3案」を明示除外（別 lane）。RO-5 は copySurface を import も改変もせず、
 *     三層防御（exact catalog 固定 lookup / FORBIDDEN_LEXICON walker / serialization backstop）を **pattern として
 *     mirror**（code 借用でなく規律継承・RO-5 専用 catalog/walker 新設）。
 *   - empty-day-reasoning(組み方文言)は import type すらせず複製しない。conceptKind で「組み方 vs 構え」を親分離。
 *   - stance 型は RealityProposalStance（proposalRoute.ts・RO-4 正本）を import type のみ（RealityProposalStanceV0
 *     等を新規 re-define しない＝三重化防止・mustFix #2）。
 *
 * 画面混同防止の核:
 *   - conceptKind='reaction_stance' を DTO 必須 field に焼く（型名分離だけでは画面 homonym を防げない）。
 *   - raw stance 値（'protect'/'easy'/'push'）を露出せず stanceLabelKey 経由（EmptyDayTier 値同形の semantics-bleed 遮断）。
 *   - push ラベルは empty-day TIER_INTENT_LINE.push と 4-gram 非共有（mustFix #1）。
 *
 * 不変条件: pure（IO/Date/RNG/write/localStorage/PredictionLedger なし・戻り値のみ）。RO-1/2/3/4 + empty-day +
 *   RJ2 surface chain の runtime/型を改変しない（import type のみ）。**RO-5 完了 ≠ 表示完了**（実 UI 配線は別 GO）。
 */
import type {
  ProposalRouteSetV0,
  ProposalRouteV0,
  RealityProposalStance,
  RouteConfidence,
  RouteBasisBucket,
} from "./proposalRoute";

export const PROPOSAL_SURFACE_VERSION = 0;

/** RO-5 は「構え」固定（組み方=empty-day 側・RO-5 は持たない）。 */
export type SurfaceConceptKind = "reaction_stance";

/** raw stance 値（'protect' 等・EmptyDayTier 値同形）を露出しないための label key（homonym 遮断）。 */
export type StanceLabelKey = "protect_label" | "easy_label" | "push_label";

export interface ProposalRouteReasonViewV0 {
  /** basisBucket→BASIS_SUMMARY honest 要約のみ。evidenceRefs（gap_/anchor_/signal id）は drop（生表示しない）。 */
  readonly basisSummary: string;
}

export interface ProposalRouteCardV0 {
  readonly stanceLabelKey: StanceLabelKey; // raw stance 値を露出しない
  readonly stanceLabel: string; // STANCE_LABEL 固定
  readonly intentLine: string; // STANCE_INTENT 固定 hedged
  readonly reasons: ReadonlyArray<ProposalRouteReasonViewV0>;
  readonly hasNoBasis: boolean; // reasons 空=true（黙らせない）
  // 注: card-level confidenceLabel は持たない（RO-4 confidence は route 横断一律＝set-level に集約・mustFix #4）
}

export interface ProposalSurfaceViewV0 {
  readonly schemaVersion: 0;
  readonly conceptKind: SurfaceConceptKind; // 画面混同防止の核・必須
  readonly conceptLabel: string; // CONCEPT_LABEL 固定
  readonly display: "render" | "suppress";
  readonly cards: ReadonlyArray<ProposalRouteCardV0>; // render 時常に 3（protect/easy/push 順）/ suppress 時 []
  readonly recommendedStanceLabelKey: StanceLabelKey | null; // raw stance でなく label key・null=偽推薦なし
  readonly recommendationAbsent: boolean;
  readonly confidenceLabel: string; // set 全体 hedged（unresolved 頭打ち反映）
}

// ── exact catalog（copySurface CLAIM_TEMPLATE と同じ固定 lookup discipline・dynamic interpolation/LLM なし） ──
// 最終文言は CEO 文面承認 gate 通過まで draft。FORBIDDEN_LEXICON 非抵触 + empty-day TIER_INTENT_LINE と 4-gram 非共有。
const CONCEPT_LABEL: Record<SurfaceConceptKind, string> = {
  reaction_stance: "今の現実への構え",
};
const STANCE_LABEL: Record<RealityProposalStance, string> = {
  protect: "守る構え",
  easy: "楽にいく構え",
  push: "進める構え", // ★「前に進める」を撤回（empty-day「前に進めたいこと」と 4-gram 非共有・mustFix #1）
};
const STANCE_INTENT: Record<RealityProposalStance, string> = {
  protect: "動いた現実を、まず守る向きです",
  easy: "負荷が下がった分を、軽く使う向きです",
  push: "進める方向に、寄せていく向きです", // ★empty-day push intent と 4-gram 非共有
};
const STANCE_LABEL_KEY: Record<RealityProposalStance, StanceLabelKey> = {
  protect: "protect_label",
  easy: "easy_label",
  push: "push_label",
};
const BASIS_SUMMARY: Record<RouteBasisBucket, string> = {
  diff_collapsed: "直前に動いた予定と関連があります",
  change_task: "この用事に進んだ記録があります",
  gradient_axis: "見立てより負荷が下がっている兆しがあります",
};
const CONFIDENCE_LABEL: Record<RouteConfidence, string> = {
  low: "参考程度の見立てです",
  tentative: "暫定の見立てです",
};

/** route の reasons を basisBucket→BASIS_SUMMARY に honest 要約（distinct・evidenceRefs 非参照）。 */
function deriveReasonSummaries(route: ProposalRouteV0): ProposalRouteReasonViewV0[] {
  const seen = new Set<string>();
  const out: ProposalRouteReasonViewV0[] = [];
  for (const r of route.reasons) {
    const summary = BASIS_SUMMARY[r.basisBucket]; // basisBucket のみ参照・evidenceRefs を一切読まない
    if (summary === undefined || seen.has(summary)) continue; // 同 bucket は 1 句に圧縮
    seen.add(summary);
    out.push({ basisSummary: summary });
  }
  return out;
}

/** recommended stance → label key（null=偽推薦なし）。 */
function recommendedLabelKeyOf(set: ProposalRouteSetV0): StanceLabelKey | null {
  return set.recommended === null ? null : STANCE_LABEL_KEY[set.recommended];
}

/**
 * buildProposalSurface — ProposalRouteSetV0 → 表示用 DTO（pure・初の RO-4 surface consumer）。
 *   set.routes を直接 iterate（RO-4 が proposalRoute.ts:209 で常に 3・protect/easy/push 順を保証）。
 *   internal trace（evidenceRefs/raw id/unresolved*）を一切 DTO に載せない。
 */
export function buildProposalSurface(set: ProposalRouteSetV0): ProposalSurfaceViewV0 {
  // set 全体の confidence は route 横断一律（RO-4・proposalRoute.ts:190）→ 先頭 route から取る（空なら low）
  const setConfidence: RouteConfidence = set.routes.length > 0 ? set.routes[0].confidence : "low";

  const cards: ProposalRouteCardV0[] = set.routes.map((route) => {
    const reasons = deriveReasonSummaries(route);
    return {
      stanceLabelKey: STANCE_LABEL_KEY[route.stance],
      stanceLabel: STANCE_LABEL[route.stance],
      intentLine: STANCE_INTENT[route.stance],
      reasons,
      hasNoBasis: reasons.length === 0,
    };
  });

  return {
    schemaVersion: 0,
    conceptKind: "reaction_stance",
    conceptLabel: CONCEPT_LABEL.reaction_stance,
    display: "render",
    cards,
    recommendedStanceLabelKey: recommendedLabelKeyOf(set),
    recommendationAbsent: set.recommended === null,
    confidenceLabel: CONFIDENCE_LABEL[setConfidence],
  };
}

// ── walker（copySurface 三層防御を mirror・RO-5 専用 catalog） ──

/** RO-5 専用 RAW_ID_TOKENS（mustFix #3: copySurface の list は trn:/proute:/anchor_/gap_ を欠くため流用不可）。 */
const RO5_RAW_ID_TOKENS: ReadonlyArray<string> = ["proute:", "trn:", "anchor_", "gap_", "ern:", "cl:", "q:", "rdiff:", "redge:"];

/** RO-5 専用禁止 field キー（field キー走査・mustFix #6: copySurface FORBIDDEN_FIELDS の "push" 誤検出を避け値でなくキーで検査）。 */
const RO5_FORBIDDEN_FIELD_KEYS: ReadonlyArray<string> = [
  "evidenceRefs", "forTarget", "routeSetId", "unresolvedNotes", "ledgerRefsObserved", "unresolvedCount",
  "notify", "notification", "dispatch", "action", "write", "send", "book", "pay", "sourceRefs", "deliveryMode",
];

const STANCE_LABEL_VALUES: ReadonlySet<string> = new Set(Object.values(STANCE_LABEL));
const STANCE_INTENT_VALUES: ReadonlySet<string> = new Set(Object.values(STANCE_INTENT));
const BASIS_SUMMARY_VALUES: ReadonlySet<string> = new Set(Object.values(BASIS_SUMMARY));
const CONFIDENCE_LABEL_VALUES: ReadonlySet<string> = new Set(Object.values(CONFIDENCE_LABEL));
const CONCEPT_LABEL_VALUES: ReadonlySet<string> = new Set(Object.values(CONCEPT_LABEL));
const STANCE_LABEL_KEYS: ReadonlySet<string> = new Set<StanceLabelKey>(["protect_label", "easy_label", "push_label"]);

/** object を再帰走査して禁止 field キーの存在を検出。 */
function collectKeys(v: unknown, out: Set<string>): void {
  if (Array.isArray(v)) {
    for (const x of v) collectKeys(x, out);
  } else if (v !== null && typeof v === "object") {
    for (const k of Object.keys(v as Record<string, unknown>)) {
      out.add(k);
      collectKeys((v as Record<string, unknown>)[k], out);
    }
  }
}

/**
 * proposalSurfaceViolations — DTO の不変条件（空=適合・throw しない・三層防御 mirror）。
 */
export function proposalSurfaceViolations(view: ProposalSurfaceViewV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`proposalSurface: ${m}`);

  // ① conceptKind/conceptLabel 固定
  if (view.conceptKind !== "reaction_stance") push(`conceptKind は reaction_stance（got ${view.conceptKind}）`);
  if (!CONCEPT_LABEL_VALUES.has(view.conceptLabel)) push(`conceptLabel が catalog 外（"${view.conceptLabel}"）`);

  // ② cards: render 時常に 3・protect/easy/push 順 / suppress 時 []
  if (view.display === "render") {
    if (view.cards.length !== 3) push(`render 時 cards は常に 3（got ${view.cards.length}）`);
    const expectedOrder: StanceLabelKey[] = ["protect_label", "easy_label", "push_label"];
    view.cards.forEach((c, i) => {
      if (c.stanceLabelKey !== expectedOrder[i]) push(`cards[${i}] は ${expectedOrder[i]} の順（got ${c.stanceLabelKey}）`);
    });
  } else if (view.cards.length !== 0) {
    push("suppress 時 cards は []");
  }

  // ③ exact whitelist（dynamic 生成検出）
  for (const c of view.cards) {
    if (!STANCE_LABEL_KEYS.has(c.stanceLabelKey)) push(`stanceLabelKey が catalog 外（"${c.stanceLabelKey}"）`);
    if (!STANCE_LABEL_VALUES.has(c.stanceLabel)) push(`stanceLabel が catalog 外（"${c.stanceLabel}"）`);
    if (!STANCE_INTENT_VALUES.has(c.intentLine)) push(`intentLine が catalog 外（"${c.intentLine}"）`);
    for (const r of c.reasons) {
      if (!BASIS_SUMMARY_VALUES.has(r.basisSummary)) push(`basisSummary が catalog 外（"${r.basisSummary}"）`);
    }
    if (c.hasNoBasis !== (c.reasons.length === 0)) push("hasNoBasis は reasons 空と一致すべき");
  }
  if (!CONFIDENCE_LABEL_VALUES.has(view.confidenceLabel)) push(`confidenceLabel が catalog 外（"${view.confidenceLabel}"）`);

  // ④ recommendation honest（null=偽推薦なし）
  if (view.recommendationAbsent && view.recommendedStanceLabelKey !== null) {
    push("recommendationAbsent=true なら recommendedStanceLabelKey=null（偽推薦なし）");
  }
  if (view.recommendedStanceLabelKey !== null && !STANCE_LABEL_KEYS.has(view.recommendedStanceLabelKey)) {
    push(`recommendedStanceLabelKey が catalog 外（"${view.recommendedStanceLabelKey}"）`);
  }

  // ⑤ 禁止 field キー走査（internal-only を構造排除・mustFix #6）
  const keys = new Set<string>();
  collectKeys(view, keys);
  for (const fk of RO5_FORBIDDEN_FIELD_KEYS) {
    if (keys.has(fk)) push(`禁止 field "${fk}" が DTO に存在（internal trace leak）`);
  }

  // ⑥ JSON serialization backstop（RAW_ID_TOKEN 非出現・mustFix #3）
  const json = JSON.stringify(view);
  for (const tok of RO5_RAW_ID_TOKENS) {
    if (json.includes(tok)) push(`RAW_ID_TOKEN "${tok}" が DTO 文字列に出現（raw id leak）`);
  }

  return out;
}
