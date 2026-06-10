/**
 * 横 R2 — A-4-c23/c26 Life Ops Mainline Card（**pure builder + selector + mainline route wrapper**・barrel 非 export）
 *
 * 設計: docs/life-ops-mainline-minimal-card-a4-c23-mini-design.md / docs/life-ops-real-source-contract-a4-c26-mini-design.md
 *
 * 役割: preview model から **本線最小 card DTO** を組む。持ち込むのは headline + 代表 ≤3 のみ。
 *   A-4-c26: 代表選定を `selectLifeOpsMainlineRepresentatives`（**page 表示と action 再検証の共通 selector**）に統一し、
 *   **real_only mode 限定の sparse fallback（最大 1 件・低圧文言）**を追加（案 C・preview/operator は不変）。
 *
 * 厳守:
 *   - **action rail は later/dismiss/done のみ**（accept は hold＝builder filter + server wrapper の二重防御）。
 *   - 代表 0（fallback 含め）→ **null**（card 自体を出さない）。
 *   - fallback は **mode==="real_only" の時だけ**（real_only の base 候補は空＝pool は全て real 由来 → fixture が
 *     fallback に乗る経路が構造的に不存在）。fixture_allowed では従来挙動と完全一致（後方互換・JSON 等価 lock）。
 *   - 低圧文言は固定 2 句（enum・「やるべき/必ず/今すぐ」不使用）。handle/内部 field は DTO に持ち込まない。
 */

import type { LifeOpsPreviewModel } from "./lifeops-preview-compute";
import type { LifeOpsCandidate } from "../../../lifeops/candidate-types";
import { toLifeOpsCardViewModel } from "../../../lifeops/card-presenter";
import { assessLifeOpsPermission } from "../../../lifeops/permission";
import { lifeOpsMomentKey } from "./lifeops-moment-preview";
import { listLifeOpsActionDescriptors } from "./lifeops-action-intent";
import { routeLifeOpsActionRequest, type LifeOpsActionRouteResult } from "./lifeops-action-request";
import type { LifeOpsFeedbackAction } from "./lifeops-feedback-write";
import type { LifeOpsSourceMode } from "./lifeops-source-policy";

/** 本線 card で許可する action（**accept は hold**・c19 §3）。 */
export const LIFEOPS_MAINLINE_ACTIONS: ReadonlySet<LifeOpsFeedbackAction> = new Set(["later", "dismiss", "done"]);

/** sparse fallback の低圧文言（固定 2 句・enum・督促語なし）。 */
export const LIFEOPS_SPARSE_FALLBACK_PHRASE: Record<"deadline" | "cycle", string> = {
  deadline: "期日が近づいています。余裕があれば少しだけでも",
  cycle: "そろそろの時期かもしれません。余裕があれば",
};

export interface LifeOpsMainlineActionDto {
  readonly uiLabel: string;
  readonly action: string;
  /** done のみ true（確認 UI を義務付け・c15 契約の transit）。 */
  readonly requiresConfirmation: boolean;
}
export interface LifeOpsMainlineItemDto {
  readonly label: string;
  readonly phrase: string;
  /** lookup 専用の非 PII 構造キー（**handle ではない**）。 */
  readonly candidateKey: string;
  readonly actions: readonly LifeOpsMainlineActionDto[];
}
export interface LifeOpsMainlineCardDto {
  readonly headline: string;
  /** 代表 ≤3（通常=recommended tier rail 付き／sparse fallback=最大 1）。 */
  readonly items: readonly LifeOpsMainlineItemDto[];
}

/**
 * A-4-c26: sparse fallback の選定（**real 由来 pool から最大 1 件**・deadline 優先[daysUntil 昇順]→cycle[pool 順]）。
 *   event_prep/unknown kind は対象外（安全条件）。pool は normalization で low confidence 既 drop＝medium+ のみ。
 */
export function selectLifeOpsSparseFallback(pool: readonly LifeOpsCandidate[]): LifeOpsCandidate | null {
  const deadlines = pool
    .filter((c) => c.dueReason.kind === "deadline")
    .sort((a, b) => (a.dueReason.kind === "deadline" && b.dueReason.kind === "deadline" ? a.dueReason.daysUntilDeadline - b.dueReason.daysUntilDeadline : 0));
  if (deadlines.length > 0) return deadlines[0];
  const cycle = pool.find((c) => c.dueReason.kind === "cycle");
  return cycle ?? null; // event_prep 等は fallback 対象外
}

/**
 * A-4-c26: 本線代表の共通 selector（**page 表示と action 再検証が同一の集合を見る**）。
 *   ①従来 reps 非空 → そのまま ②空 ∧ real_only → pool から fallback 最大 1（fixture_allowed では fallback しない）。
 */
export function selectLifeOpsMainlineRepresentatives(model: LifeOpsPreviewModel, mode: LifeOpsSourceMode): readonly LifeOpsCandidate[] {
  if (model.repCandidates.length > 0) return model.repCandidates;
  if (mode !== "real_only") return []; // fixture 環境では fallback しない（fixture 由来の fallback を構造的に排除）
  const fb = selectLifeOpsSparseFallback(model.pooledCandidates);
  return fb ? [fb] : [];
}

function toItem(candidate: LifeOpsCandidate, phraseOverride?: string): LifeOpsMainlineItemDto | null {
  const descriptors = listLifeOpsActionDescriptors(candidate);
  if (descriptors.length === 0) return null; // 辞書外（理論上 pool に来ないが防御）
  const card = toLifeOpsCardViewModel(candidate, assessLifeOpsPermission(candidate));
  return {
    label: card.title,
    phrase: phraseOverride ?? card.reasonText,
    candidateKey: lifeOpsMomentKey(candidate),
    actions: descriptors
      .filter((d) => LIFEOPS_MAINLINE_ACTIONS.has(d.intent.action)) // accept は本線に出さない（hold）
      .map((d) => ({ uiLabel: d.uiLabel, action: d.intent.action, requiresConfirmation: d.intent.requiresExplicitConfirmation })),
  };
}

/**
 * preview model → 本線最小 card DTO（**候補 0 → null**・selector 統一・fallback は低圧文言）。
 *   mode 既定は fixture_allowed（c23 互換＝fallback なし・出力は従来と完全一致）。
 */
export function buildLifeOpsMainlineCardDto(model: LifeOpsPreviewModel, mode: LifeOpsSourceMode = "fixture_allowed"): LifeOpsMainlineCardDto | null {
  const reps = selectLifeOpsMainlineRepresentatives(model, mode);
  if (reps.length === 0) return null; // 候補 0 → card 自体を出さない（静けさ維持）
  const isFallback = model.repCandidates.length === 0; // selector が fallback 経路を使った場合のみ true
  const items: LifeOpsMainlineItemDto[] = [];
  for (const c of reps.slice(0, 3)) {
    const phrase = isFallback && (c.dueReason.kind === "deadline" || c.dueReason.kind === "cycle")
      ? LIFEOPS_SPARSE_FALLBACK_PHRASE[c.dueReason.kind]
      : undefined;
    const item = toItem(c, phrase);
    if (item) items.push(item);
  }
  if (items.length === 0) return null;
  return { headline: model.dto.briefing.headline, items };
}

/**
 * 本線用 route wrapper（**accept を含む非許可 action を server 側でも拒否**＝偽造 POST 防御の二重化）。
 *   許可 action は c17/c18 の `routeLifeOpsActionRequest` へ委譲（done 2 段階・候補照合・intent 再構築は共有）。
 */
export function routeLifeOpsMainlineActionRequest(
  repCandidates: readonly LifeOpsCandidate[],
  candidateKeyRaw: unknown,
  actionRaw: unknown,
  confirmRaw: unknown,
): LifeOpsActionRouteResult {
  if (typeof actionRaw !== "string" || !LIFEOPS_MAINLINE_ACTIONS.has(actionRaw as LifeOpsFeedbackAction)) {
    return { kind: "reject", reason: "invalid_action" }; // accept（hold）/enum 外/型不正は本線で常時拒否
  }
  return routeLifeOpsActionRequest(repCandidates, candidateKeyRaw, actionRaw, confirmRaw);
}
