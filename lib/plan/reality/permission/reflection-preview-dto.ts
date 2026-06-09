/**
 * Reality Control OS — A-4-c Reflection Preview Client DTO（**pure・allowlist 強制・client への唯一の通路**・barrel 非 export）
 *
 * 設計: docs/reality-display-preview-contract-a4-c0.md（§1-§4）
 *
 * 役割: A-4-b `ReflectionPreviewResult` を **client に渡してよい最小情報だけ**に変換する pure mapper。
 *   既存 envelope 契約（changeSetDraft={opCount}）は**変えず**、別 DTO として並置する（A-4-c0 確定）。
 *
 * 厳守（A-4-c0 allowlist/deny）:
 *   - 渡す: stage / preconditionVerdict / reflected / reflectedItemCount / **blockers・warnings は count のみ** /
 *     items={startTime,endTime?,label}（**HH:MM + 固定 allowlist label のみ**・集合外は「自由時間」へ強制置換）。
 *   - 落とす: item id（display: 含む）/ confidence / reason / origin / rigidity / sourceTrace 実体 /
 *     full DraftPlanItem / full DraftPlan / full ChangeSet / 安定コード列（blockers/warnings の中身）。
 *   - raw/PII を新規生成しない（label は allowlist 照合で構造的に固定 5 語に閉じる）。
 */

import type { ReflectionPreviewResult, ReflectionPreviewStage } from "./display-apply-preview";

/** client に渡す item（**これ以外の field を持たない**）。 */
export interface ReflectionPreviewItemDto {
  readonly startTime: string; // "HH:MM"
  readonly endTime?: string; // "HH:MM"
  readonly label: string; // LABEL_ALLOWLIST の 5 語のみ
}

/** client に渡す reflection preview の全て（実体は渡らない）。 */
export interface ReflectionPreviewClientDto {
  readonly stage: ReflectionPreviewStage;
  readonly preconditionVerdict: string | null;
  readonly reflected: boolean;
  readonly reflectedItemCount: number;
  /** 安定コード列は渡さない（count に縮約・A-4-c0 §2）。 */
  readonly blockersCount: number;
  readonly warningsCount: number;
  readonly items: readonly ReflectionPreviewItemDto[];
}

/** 表示してよい label の固定 allowlist（R5-2 KIND_LABEL・A-4-c0 §2）。 */
export const LABEL_ALLOWLIST: ReadonlySet<string> = new Set(["集中の時間", "軽い用事の時間", "休息", "自由時間", "余白"]);
/** 集合外 label の強制置換先（raw を client に出さない）。 */
const GENERIC_LABEL = "自由時間";

/**
 * A-4-c: ReflectionPreviewResult → client DTO（**allowlist 強制・実体落とし**）。
 *   items は additive merge で末尾に追加された **reflected 分のみ**（既存 fixture item は含めない）。
 */
export function toReflectionPreviewClientDto(result: ReflectionPreviewResult): ReflectionPreviewClientDto {
  const { summary, draftPlan } = result;
  const count = summary.reflectedItemCount;
  // additive merge は末尾追加 → reflected 分 = 末尾 count 件。
  const reflectedItems = count > 0 ? draftPlan.items.slice(draftPlan.items.length - count) : [];
  const items: ReflectionPreviewItemDto[] = reflectedItems.map((it) => ({
    startTime: it.startTime,
    ...(it.endTime !== undefined ? { endTime: it.endTime } : {}),
    label: LABEL_ALLOWLIST.has(it.title) ? it.title : GENERIC_LABEL, // 集合外→generic（raw を出さない）
  }));
  return {
    stage: summary.stage,
    preconditionVerdict: summary.preconditionVerdict,
    reflected: result.reflected,
    reflectedItemCount: count,
    blockersCount: summary.prepareBlockers.length + summary.preconditionBlockers.length,
    warningsCount: summary.warnings.length,
    items,
  };
}
