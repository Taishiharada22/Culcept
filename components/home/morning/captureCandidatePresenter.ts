/**
 * Reality Control OS — A1-5-7-6 Capture Candidate UI Presenter（**pure・UI 表示用・no-DB・no-network**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.46
 *
 * 役割: route response の `data.captureCandidate?: CandidateSurfaceDTO`（A1-5-7-5・redacted）を、
 *   **UI に出してよい控えめな表示モデル**へ写す pure presenter。`CaptureCandidateBanner` が消費する。
 *
 * 厳守:
 *   - **absent / hasCandidate=false → null**（表示なし＝既存 UI 完全不変）。
 *   - **控えめ**: 「候補があります」止まり。「確定した予定」と断定しない。
 *   - **evidenceSource の技術名（seed_explicit / correction）をそのまま出さない**（友好的な日本語ラベルに写す）。
 *   - **source_ref / UUID / raw を出さない**（DTO に元々無いが、presenter は安全 field のみ読む）。
 *   - pure（React / DB / network / Date.now なし）。
 */

import type { CandidateSurfaceDTO, EvidenceSourceLabel, TimeBandLabel } from "@/lib/plan/reality/integration/candidate-surface";

/** UI 表示用の 1 候補（**安全文字列のみ**・技術名/UUID/raw なし）。 */
export interface CaptureCandidateDisplayItem {
  /** 所要時間の控えめ表示（例「約60分」）。 */
  readonly durationText: string;
  /** 根拠の友好ラベル（**enum 名でない**）。 */
  readonly sourceLabel: string;
  /** 時間帯の友好ラベル（無ければ null）。 */
  readonly bandLabel: string | null;
  /**
   * A1-6-8: action 用 **opaque handle**（`"c1:"+sha256(seedRef)`・seedRef を含まない・無ければ null）。
   *   banner の accept/dismiss/later はこの handle を route に送る（seedRef は client に出ない）。
   */
  readonly handle: string | null;
}

/** UI 表示モデル（candidate 有時のみ・控えめ）。 */
export interface CaptureCandidateDisplay {
  /** 見出し（控えめ・断定しない）。 */
  readonly heading: string;
  /** 補足（控えめ）。 */
  readonly note: string;
  /** 候補詳細（count-level=空配列もあり）。 */
  readonly items: readonly CaptureCandidateDisplayItem[];
}

/** evidenceSource（技術名）→ 友好ラベル。未知は中立 fallback（**enum 名を出さない**）。 */
const SOURCE_LABEL: Record<EvidenceSourceLabel, string> = {
  seed_explicit: "あなたが話した内容から",
  correction: "これまでの調整から",
};
/** band（技術名）→ 友好ラベル。 */
const BAND_LABEL: Record<TimeBandLabel, string> = {
  morning: "朝",
  afternoon: "昼",
  evening: "夕方",
};

/** durationMin → 控えめ表示（非数/非正は「予定」のみ）。 */
function durationText(durationMin: number): string {
  return Number.isFinite(durationMin) && durationMin > 0 ? `約${Math.round(durationMin)}分` : "予定";
}

/**
 * A1-5-7-6: `CandidateSurfaceDTO` → UI 表示モデル（**pure・redacted・控えめ**）。
 *   absent / hasCandidate=false → **null**（表示なし）。candidate 有 → 友好ラベル化した表示モデル。
 */
export function presentCaptureCandidate(
  dto: CandidateSurfaceDTO | null | undefined
): CaptureCandidateDisplay | null {
  if (!dto || !dto.hasCandidate) return null; // 表示なし（既存 UI 不変）
  return {
    heading: "候補があります",
    note: "空いている時間に置けそうな予定の候補です",
    items: dto.items.map((it) => ({
      durationText: durationText(it.durationMin),
      sourceLabel: SOURCE_LABEL[it.evidenceSource] ?? "メモから", // 未知 → 中立（enum 名を出さない）
      bandLabel: it.band ? BAND_LABEL[it.band] ?? null : null,
      handle: typeof it.handle === "string" ? it.handle : null, // A1-6-8: action 用 opaque handle（無ければ null）
    })),
  };
}
