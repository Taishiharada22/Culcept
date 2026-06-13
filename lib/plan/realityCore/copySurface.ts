/**
 * CopySurface — RJ2e consumer view → user-facing 文面（pure core 限定・exact template のみ）
 *
 * 正本: docs/reality-copy-surface-impl-design-rj2e-0.md（RJ2e-0/RJ2e-0A・§11 exact catalog）/ docs/reality-judgment-surface-boundary-rj2-0.md
 *   / CEO RJ2e 実装 GO（2026-06-14・最終 exact 文面差し替え + view precheck + whitelist walker）
 *
 * 思想（初の user-facing 文面・三層防御）: RJ2d の `SurfaceProjectionConsumerViewV0`（category-free / verdict-free /
 *   opaque）を入力に、**決定的な exact template / choice label のみ**で文面を組む pure core。**最も慎重を要する層**。
 *   三層で安全を担保:
 *     ① 入力面: consumer view は機微・verdict・raw id を持たない（RJ2d 保証）。renderCopy は冒頭で view を**再検証**（CEO #4・
 *        RJ2d を信用しきらない）。
 *     ② 出力面: text/choiceLabels は **exact catalog からの固定 lookup のみ**（dynamic interpolation なし・LLM 自由生成なし）。
 *     ③ walker: copyViolations が exact whitelist / forbidden lexicon scan / serialization backstop で検証。
 *
 * 規律（CEO）: consumer view のみ consume。RJ2a/b/c/d 4 ファイル不接触（型 + walker import のみ）。LLM 自由生成なし・
 *   dynamic interpolation なし。no proposal / 3案 / departure / notification / contact / action / write / send / book /
 *   pay / UI / API / DB write / localStorage / external read / location。pure（I/O・時刻 API・乱数なし）。
 *   **最終文言は CEO 文面承認 gate を通過済（exact catalog 正本）**。
 */

import type { ProjectedClaimKind, ProjectedQuestionKind, SurfaceProjectionConsumerViewV0 } from "./surfaceProjection";
import { surfaceProjectionConsumerViewViolations } from "./surfaceProjection";

export const COPY_SURFACE_VERSION = 0;

/** 文面の語調（v0 は neutral/hedged のみ・assertion 不可） */
export type CopyTone = "neutral" | "hedged";

export interface RenderedClaimCopy {
  readonly kind: ProjectedClaimKind;
  readonly text: string; // exact catalog 由来（固定句・断定なし・raw ref なし）
  readonly tone: CopyTone;
}

export interface RenderedQuestionCopy {
  readonly kind: ProjectedQuestionKind;
  readonly text: string; // exact catalog 由来
  readonly choiceLabels: ReadonlyArray<string>; // generic exact labels のみ
  readonly tone: CopyTone;
}

export interface RenderedCopyV0 {
  readonly schemaVersion: 0;
  readonly display: "render" | "suppress";
  readonly claimCopies: ReadonlyArray<RenderedClaimCopy>; // suppress なら []
  readonly questionCopies: ReadonlyArray<RenderedQuestionCopy>; // suppress なら []
}

/**
 * exact claim template catalog（CEO 文面承認済・RJ2e-0A §11.1）。kind → 固定句（dynamic interpolation なし）。
 */
const CLAIM_TEMPLATE: Record<ProjectedClaimKind, { readonly text: string; readonly tone: CopyTone }> = {
  observation: { text: "メモがあります。", tone: "neutral" },
  status_note: { text: "確認前の注意点があります。", tone: "hedged" },
  info_incomplete: { text: "まだ未確定の点があります。", tone: "hedged" },
  needs_confirmation: { text: "確認が必要な点があります。", tone: "hedged" },
};

/**
 * exact question template catalog（CEO 文面承認済・RJ2e-0A §11.2/§11.3）。
 * resolve_overlap は「重なって見える」で **衝突も重複も断定しない**（RJ1b 両義保持）。choiceLabels は generic のみ。
 */
const QUESTION_TEMPLATE: Record<ProjectedQuestionKind, { readonly text: string; readonly choiceLabels: ReadonlyArray<string>; readonly tone: CopyTone }> = {
  needs_verification: { text: "確認しますか？", choiceLabels: ["確認する", "あとで"], tone: "hedged" },
  resolve_overlap: { text: "重なって見える予定があります。確認しますか？", choiceLabels: ["あとで確認", "まだ決めない"], tone: "hedged" },
  resolve_missing_info: { text: "未確定の点を確認しますか？", choiceLabels: ["確認する", "そのまま"], tone: "hedged" },
};

/**
 * consumer view → 文面（pure・固定 lookup のみ・dynamic interpolation なし）。
 * **view precheck（CEO #4）**: 冒頭で surfaceProjectionConsumerViewViolations を実行し、unsafe view から文面を作らない。
 */
export function renderCopy(view: SurfaceProjectionConsumerViewV0): RenderedCopyV0 {
  const viewViolations = surfaceProjectionConsumerViewViolations(view);
  if (viewViolations.length > 0) {
    throw new Error(`renderCopy: unsafe consumer view のため文面化不可（${viewViolations.length} 件）: ${viewViolations.join(" / ")}`);
  }

  if (view.display === "suppress") {
    return { schemaVersion: 0, display: "suppress", claimCopies: [], questionCopies: [] };
  }

  const claimCopies: RenderedClaimCopy[] = view.claims.map((c) => {
    const t = CLAIM_TEMPLATE[c.kind]; // 固定 lookup（c.kind は view precheck で consumer-safe 保証済）
    return { kind: c.kind, text: t.text, tone: t.tone };
  });
  const questionCopies: RenderedQuestionCopy[] = view.questions.map((q) => {
    const t = QUESTION_TEMPLATE[q.kind];
    return { kind: q.kind, text: t.text, choiceLabels: [...t.choiceLabels], tone: t.tone };
  });

  return { schemaVersion: 0, display: "render", claimCopies, questionCopies };
}

// ── whitelist / lexicon ──
const CLAIM_TEXTS: ReadonlySet<string> = new Set(Object.values(CLAIM_TEMPLATE).map((t) => t.text));
const QUESTION_TEXTS: ReadonlySet<string> = new Set(Object.values(QUESTION_TEMPLATE).map((t) => t.text));
const CLAIM_KINDS: ReadonlySet<string> = new Set(["observation", "status_note", "info_incomplete", "needs_confirmation"]);
const QUESTION_KINDS: ReadonlySet<string> = new Set(["needs_verification", "resolve_overlap", "resolve_missing_info"]);

/** forbidden lexicon（RJ2e-0A §11.4・部分一致で検出・exact catalog には誤発火しない） */
const FORBIDDEN_LEXICON: ReadonlyArray<string> = [
  // verdict
  "成立", "不成立", "間に合", "遅刻", "遅れ", "崩れ", "失敗", "破綻", "無理", "できない", "infeasible",
  // delay/departure/route
  "出発", "何時", "時刻", "分後", "ルート", "経路", "道順", "到着", "eta", "leaveby",
  // sensitive/work/reservation/otherPeople
  "予約", "支払", "決済", "仕事", "シフト", "勤務", "出勤", "同僚", "上司", "相手", "他人", "機微", "sensitive", "reservation", "payment", "work", "shift",
  // probability/percent/score
  "％", "%", "確率", "パーセント", "スコア", "可能性が高い", "可能性が低い",
  // action/write/send/book/pay
  "削除", "移動する", "送信", "送る", "予約する", "支払う", "実行", "自動",
];
/** raw id token（文面 + serialization backstop） */
const RAW_ID_TOKENS: ReadonlyArray<string> = ["ern:", "cl:", "q:", "sp:", "pj:", "subject_", "relation_", "snapshot"];
/** 型に存在してはいけない field（notification/contact/dispatch/action/leak） */
const FORBIDDEN_FIELDS: ReadonlyArray<string> = [
  "notify", "notification", "contact", "push", "dispatch", "deliveryMode", "send", "execute", "action", "write", "book", "pay",
  "subjectRef", "relationRef", "evidenceRefs", "sourceRefs", "claimId", "questionId", "graphViewerKey",
];

function scanForbidden(s: string, label: string, out: string[]): void {
  for (const t of FORBIDDEN_LEXICON) if (s.includes(t)) out.push(`copy: ${label} に forbidden lexicon "${t}" 混入「${s}」`);
  for (const t of RAW_ID_TOKENS) if (s.includes(t)) out.push(`copy: ${label} に raw id token "${t}" 混入「${s}」`);
}

/** 文面の安全検証（exact whitelist + forbidden lexicon + serialization backstop・空=適合）。CEO 必須 12 項 */
export function copyViolations(c: RenderedCopyV0): string[] {
  const out: string[] = [];

  // display 整合
  if (c.display === "suppress" && (c.claimCopies.length > 0 || c.questionCopies.length > 0)) out.push("copy: display suppress なのに copies が非空");

  for (const cc of c.claimCopies) {
    // #1 exact template whitelist + kind 整合 + kind→text 対応
    if (!CLAIM_KINDS.has(cc.kind)) out.push(`copy: claim kind 不正 "${cc.kind}"`);
    if (!CLAIM_TEXTS.has(cc.text) || CLAIM_TEMPLATE[cc.kind]?.text !== cc.text) out.push(`copy: claim text が exact catalog と不一致「${cc.text}」（dynamic 生成の疑い）`);
    if (cc.tone !== "neutral" && cc.tone !== "hedged") out.push(`copy: claim tone 不正 "${cc.tone}"`);
    // #4-9/#11 forbidden lexicon / raw id scan
    scanForbidden(cc.text, "claim text", out);
    // #12 forbidden field
    for (const f of FORBIDDEN_FIELDS) if (f in (cc as unknown as Record<string, unknown>)) out.push(`copy: 禁止 field "${f}" が claim copy に存在`);
  }

  for (const qc of c.questionCopies) {
    if (!QUESTION_KINDS.has(qc.kind)) out.push(`copy: question kind 不正 "${qc.kind}"`);
    if (!QUESTION_TEXTS.has(qc.text) || QUESTION_TEMPLATE[qc.kind]?.text !== qc.text) out.push(`copy: question text が exact catalog と不一致「${qc.text}」（dynamic 生成の疑い）`);
    if (qc.tone !== "neutral" && qc.tone !== "hedged") out.push(`copy: question tone 不正 "${qc.tone}"`);
    // #2 exact choice label whitelist（kind ごとに完全一致）
    const expected = QUESTION_TEMPLATE[qc.kind]?.choiceLabels ?? [];
    if (qc.choiceLabels.length !== expected.length || !qc.choiceLabels.every((l, i) => l === expected[i])) {
      out.push(`copy: choiceLabels が exact catalog と不一致 [${qc.choiceLabels.join(",")}]`);
    }
    scanForbidden(qc.text, "question text", out);
    for (const l of qc.choiceLabels) scanForbidden(l, "choice label", out);
    for (const f of FORBIDDEN_FIELDS) if (f in (qc as unknown as Record<string, unknown>)) out.push(`copy: 禁止 field "${f}" が question copy に存在`);
  }

  // top-level forbidden field
  for (const f of FORBIDDEN_FIELDS) if (f in (c as unknown as Record<string, unknown>)) out.push(`copy: 禁止 field "${f}" が copy object に存在`);

  // #serialization backstop（raw id token 非出現）
  const json = JSON.stringify(c).toLowerCase();
  for (const t of RAW_ID_TOKENS) if (json.includes(t)) out.push(`copy: serialization に raw id token "${t}" が出現`);

  return out;
}
