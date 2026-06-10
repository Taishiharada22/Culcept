/**
 * 横 R2 — A-4-c23 Life Ops Mainline Card（**pure builder + mainline route wrapper**・barrel 非 export）
 *
 * 設計: docs/life-ops-mainline-minimal-card-a4-c23-mini-design.md
 *
 * 役割: preview model（c17 `computeLifeOpsPreviewModel`）から **本線最小 card DTO** を組む。
 *   持ち込むのは headline + Morning 代表（rail 付き highlights）≤3 のみ。preview DTO の
 *   moment/tiers/integrationMeta/fixtureNotice は**構造的に持ち込まない**（raw count/internal flag/source 名の本線非表示）。
 *
 * 厳守:
 *   - **action rail は later/dismiss/done のみ**（accept は hold＝builder で filter・server 側 wrapper でも拒否の二重防御）。
 *   - 候補 0（rail 付き代表なし）→ **null**（card 自体を出さない）。
 *   - handle/cadenceEligible/previewOnly 等の内部 field は DTO に持ち込まない（candidateKey は lookup 専用・非 handle）。
 */

import type { LifeOpsPreviewModel } from "./lifeops-preview-compute";
import type { LifeOpsCandidate } from "../../../lifeops/candidate-types";
import { routeLifeOpsActionRequest, type LifeOpsActionRouteResult } from "./lifeops-action-request";
import type { LifeOpsFeedbackAction } from "./lifeops-feedback-write";

/** 本線 card で許可する action（**accept は hold**・c19 §3）。 */
export const LIFEOPS_MAINLINE_ACTIONS: ReadonlySet<LifeOpsFeedbackAction> = new Set(["later", "dismiss", "done"]);

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
  /** Morning 代表 ≤3（rail 付きのみ）。 */
  readonly items: readonly LifeOpsMainlineItemDto[];
}

/**
 * preview model → 本線最小 card DTO（**候補 0 → null＝card を出さない**・accept filter）。
 */
export function buildLifeOpsMainlineCardDto(model: LifeOpsPreviewModel): LifeOpsMainlineCardDto | null {
  const items: LifeOpsMainlineItemDto[] = [];
  for (const tier of model.dto.briefing.tiers) {
    for (const h of tier.highlights) {
      if (!h.candidateKey || !h.actions || h.actions.length === 0) continue; // rail 付き代表のみ（=Morning 代表）
      items.push({
        label: h.label,
        phrase: h.phrase,
        candidateKey: h.candidateKey,
        actions: h.actions
          .filter((a) => LIFEOPS_MAINLINE_ACTIONS.has(a.action as LifeOpsFeedbackAction)) // accept は本線に出さない（hold）
          .map((a) => ({ uiLabel: a.uiLabel, action: a.action, requiresConfirmation: a.requiresConfirmation })),
      });
      if (items.length >= 3) break;
    }
    if (items.length >= 3) break;
  }
  if (items.length === 0) return null; // 候補 0 → card 自体を出さない（静けさ維持）
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
