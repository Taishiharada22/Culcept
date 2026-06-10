/**
 * 横 R2 — Life Ops Morning Briefing Preview Presenter（**pure view-model・no-React・本線非接続**・barrel 非 export）
 *
 * 設計: docs/life-ops-morning-briefing-preview-mini-design.md
 *
 * 役割: `composeLifeOpsIntoDayProposals()` の結果を、朝のブリーフィングで読める **非断定文言 + 3案要約 + 代表 1〜3 件** の
 *   pure VM に変換する。counts-only にしない（CEO 指摘）— ただし詳細を出しすぎない（窓は午前/午後/夕方の粗さ・placeQuery 非表示）。
 *
 * 厳守:
 *   - **pure・deterministic**（IO/DB/fetch/React/Date.now なし）・Morning Briefing 本線/Moment Trigger/通知に接続しない。
 *   - 単一候補の文言は **L-8a card-presenter を public API で再利用**（DRY・トーン統一・横→縦 import は許可方向）。
 *   - **非断定**（「〜と安心です/〜と自然です/〜そうです」。「すべき/必ず/しなければ/してください」を出さない＝test 固定）。
 *   - 語彙は辞書/enum/数値のみ（LifeOpsCandidate は自由文を構造的に持たない）→ PII を漏らしようがない。
 *   - R2/R4/R5 本体無改変・`generateEmptyDay` 非実行（compose 結果を受けるだけ）。
 */

import { toLifeOpsCardViewModel } from "../../../lifeops/card-presenter";
import { assessLifeOpsPermission } from "../../../lifeops/permission";
import type { EmptyDayTier } from "../empty-day/empty-day-generator";
import type { LifeOpsDayCompose } from "./lifeops-empty-day-compose";
import type { PlacedLifeOpsCandidate } from "./lifeops-placement";

/** 代表として文言化する最大件数（朝に並べすぎない）。 */
export const BRIEFING_HIGHLIGHT_MAX = 3;
/** 注意文言の最大件数。 */
export const BRIEFING_CAUTION_MAX = 2;

const TIER_LABEL: Record<EmptyDayTier, string> = { protect: "守る案", easy: "楽な案", push: "攻める案" };

export interface LifeOpsBriefingHighlightVm {
  /** L-1 辞書 label（自由文なし）。 */
  readonly title: string;
  /** 非断定の理由 1 行（L-8a reasonText 再利用）。 */
  readonly phrase: string;
  /** 粗い窓ヒント（午前/午後/夕方・HH:MM の偽精密を避ける）。 */
  readonly windowHint: string;
}

export interface LifeOpsBriefingTierVm {
  readonly tier: EmptyDayTier;
  readonly tierLabel: string;
  /** 1 行要約（件数）。 */
  readonly line: string;
  /** 代表 0〜3 件（fitting の urgency 順先頭）。 */
  readonly highlights: readonly LifeOpsBriefingHighlightVm[];
  /** overflow>0 のときのみ（honest・黙らせない）。 */
  readonly overflowLine: string | null;
}

export interface LifeOpsBriefingPreviewVm {
  /** 朝の一言（非断定）。 */
  readonly headline: string;
  /** protect/easy/push 順の 3 案要約。 */
  readonly tiers: readonly LifeOpsBriefingTierVm[];
  /** riskFlags/permission 由来の注意（dedupe・≤2 件）。 */
  readonly cautions: readonly string[];
  /** unplaced>0 のときのみ「ほかにも候補が n 件」。 */
  readonly alsoAvailableLine: string | null;
}

/** 粗い窓ヒント（12:00/17:00 境界・briefing に HH:MM 精密は不要）。 */
function windowHint(p: PlacedLifeOpsCandidate): string {
  const start = p.window?.startMinute ?? 0;
  if (start < 12 * 60) return "午前の空き時間に";
  if (start < 17 * 60) return "午後の空き時間に";
  return "夕方以降の空き時間に";
}

/** L-8a を再利用して代表 1 件を VM 化（title=L-1 label / phrase=reasonText）。 */
function toHighlight(p: PlacedLifeOpsCandidate): LifeOpsBriefingHighlightVm {
  const card = toLifeOpsCardViewModel(p.candidate, assessLifeOpsPermission(p.candidate));
  return { title: card.title, phrase: card.reasonText, windowHint: windowHint(p) };
}

/** headline（§1・非断定・recommended tier 基準）。 */
function buildHeadline(compose: LifeOpsDayCompose): string {
  const baseTier = compose.recommended ?? "easy";
  const base = compose.composed.find((c) => c.tier === baseTier) ?? compose.composed[0];
  const fitting = base ? base.lifeOps.fitting : [];
  if (fitting.length === 0) {
    return compose.alsoAvailable.length > 0
      ? `今日は枠が埋まっていますが、生活まわりの候補は${compose.alsoAvailable.length}件あります`
      : "今日は生活まわりで急ぎのものはなさそうです";
  }
  const titleOf = (p: PlacedLifeOpsCandidate) => toHighlight(p).title;
  // A-4-c6: overdue は一段だけ強く（事実明示 + 低圧の後押し・督促語/「今すぐ」/「必ず」は使わない＝test 固定）。
  const overdue = fitting.find((p) => p.candidate.dueReason.kind === "deadline" && p.candidate.dueReason.overdue);
  if (overdue) {
    return `「${titleOf(overdue)}」は期日を過ぎています。今日は少しだけでも触れると安心です`;
  }
  const deadline = fitting.find((p) => p.candidate.dueReason.kind === "deadline");
  if (deadline) {
    const other = fitting.find((p) => p !== deadline);
    return other
      ? `今日は「${titleOf(deadline)}」を先にすませると安心です。余裕があれば「${titleOf(other)}」も入れられそうです`
      : `今日は「${titleOf(deadline)}」を先にすませると安心です`;
  }
  return `今日は「${titleOf(fitting[0])}」あたりを入れると自然です`;
}

/** 注意文言（§5・L-7/L-8a 再利用・dedupe・cap 2）。recommended tier の代表のみ対象（朝に並べすぎない）。 */
function buildCautions(compose: LifeOpsDayCompose): readonly string[] {
  const baseTier = compose.recommended ?? "easy";
  const base = compose.composed.find((c) => c.tier === baseTier);
  const reps = (base ? base.lifeOps.fitting : []).slice(0, BRIEFING_HIGHLIGHT_MAX);
  const out: string[] = [];
  for (const p of reps) {
    const card = toLifeOpsCardViewModel(p.candidate, assessLifeOpsPermission(p.candidate));
    const notes = [...(card.confirmationNote ? [card.confirmationNote] : []), ...card.riskNotes];
    for (const n of notes) {
      if (out.length >= BRIEFING_CAUTION_MAX) return out;
      if (!out.includes(n)) out.push(n); // dedupe
    }
  }
  return out;
}

/**
 * compose 結果 → 朝のブリーフィング preview VM（**pure・非断定・本線非接続**）。
 */
export function buildLifeOpsBriefingPreview(compose: LifeOpsDayCompose): LifeOpsBriefingPreviewVm {
  const tiers: LifeOpsBriefingTierVm[] = compose.composed.map((c) => {
    const n = c.lifeOps.fitting.length;
    const overflowTotal = c.lifeOps.overflowTotalCount ?? c.lifeOps.overflow.length; // A-4-c7: line は総数（保持 cap で配列を絞っても嘘をつかない）
    return {
      tier: c.tier,
      tierLabel: TIER_LABEL[c.tier],
      line: n > 0 ? `${TIER_LABEL[c.tier]}には${n}件入ります` : `${TIER_LABEL[c.tier]}は生活まわりの追加なし`,
      highlights: c.lifeOps.fitting.slice(0, BRIEFING_HIGHLIGHT_MAX).map(toHighlight),
      overflowLine: overflowTotal > 0 ? `この案では入りきらない候補が${overflowTotal}件あります` : null,
    };
  });

  return {
    headline: buildHeadline(compose),
    tiers,
    cautions: buildCautions(compose),
    alsoAvailableLine: compose.alsoAvailable.length > 0 ? `ほかにも候補が${compose.alsoAvailable.length}件あります` : null,
  };
}
