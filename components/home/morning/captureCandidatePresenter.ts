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
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";

/** UI 表示用の 1 候補（**安全文字列のみ**・技術名/UUID/raw なし）。 */
export interface CaptureCandidateDisplayItem {
  /** 所要時間の控えめ表示（例「約60分」）。 */
  readonly durationText: string;
  /** 根拠の友好ラベル（**enum 名でない**）。 */
  readonly sourceLabel: string;
  /** 時間帯の友好ラベル（無ければ null）。 */
  readonly bandLabel: string | null;
  /**
   * A1-6-11: 希望日の friendly 表示（「今日」「明日」「6/15」等・無ければ null）。
   *   **controlled formatter**（LLM 不使用・捏造なし・desiredDate という structured state の安全表示）。today 注入で deterministic。
   */
  readonly dateLabel: string | null;
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
/**
 * band（技術名）→ 友好ラベル。**A1-6-10: reflection の plan item label（consumed-seed-reflection bandLabel）と一致**させる
 *   （候補で「午後」、反映後の予定で「午後の予定」と同じ語にし、候補↔予定の違和感を消す）。
 */
const BAND_LABEL: Record<TimeBandLabel, string> = {
  morning: "午前",
  afternoon: "午後",
  evening: "夜",
};

/** durationMin → 控えめ表示（非数/非正は「予定」のみ）。 */
function durationText(durationMin: number): string {
  return Number.isFinite(durationMin) && durationMin > 0 ? `約${Math.round(durationMin)}分` : "予定";
}

/**
 * A1-6-11: 希望日（YYYY-MM-DD）→ **friendly 表示**（**controlled formatter・LLM 不使用・deterministic**）。
 *   今日/明日/明後日/昨日 は相対、それ以外は M/D。date / today 欠落 / parse 不能 → null（表示なし）。
 *   **Date.now を使わない**（today を注入）。`new Date(string)` は与えられた値の parse のみ＝決定的。
 */
export function friendlyDateLabel(dateISO: string | null, todayISO: string | null | undefined): string | null {
  if (!dateISO || !todayISO) return null;
  const d = new Date(`${dateISO}T00:00:00Z`);
  const t = new Date(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return null;
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  if (diff === 2) return "明後日";
  if (diff === -1) return "昨日";
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/**
 * A1-6-11: action → **確認文言**（**controlled formatter・固定文・LLM 不使用・根拠捏造なし**）。
 *   accept→「予定に入れました」/ dismiss→「今回は見送りました」/ later→「あとで確認できます」。
 */
export function actionResultText(action: CandidateActionKind): string {
  switch (action) {
    case "accept":
      return "予定に入れました";
    case "dismiss":
      return "今回は見送りました";
    case "later":
      return "あとで確認できます";
  }
}

/**
 * A1-5-7-6: `CandidateSurfaceDTO` → UI 表示モデル（**pure・redacted・控えめ**）。
 *   absent / hasCandidate=false → **null**（表示なし）。candidate 有 → 友好ラベル化した表示モデル。
 */
export function presentCaptureCandidate(
  dto: CandidateSurfaceDTO | null | undefined,
  todayISO?: string | null // A1-6-11: 注入（無→ dateLabel null・後方互換）。banner が local today を渡す。
): CaptureCandidateDisplay | null {
  if (!dto || !dto.hasCandidate) return null; // 表示なし（既存 UI 不変）
  return {
    heading: "候補があります",
    // A1-6-10: 「なぜ出たか」を一言で（やり取り由来）+ 非断定（候補）。per-item の sourceLabel が具体的な根拠を補う。
    note: "あなたとのやり取りから、空き時間に置けそうな予定の候補です",
    items: dto.items.map((it) => ({
      durationText: durationText(it.durationMin),
      sourceLabel: SOURCE_LABEL[it.evidenceSource] ?? "メモから", // 未知 → 中立（enum 名を出さない）
      bandLabel: it.band ? BAND_LABEL[it.band] ?? null : null,
      dateLabel: friendlyDateLabel(it.date, todayISO), // A1-6-11: 「いつ」文脈（controlled formatter）
      handle: typeof it.handle === "string" ? it.handle : null, // A1-6-8: action 用 opaque handle（無ければ null）
    })),
  };
}
