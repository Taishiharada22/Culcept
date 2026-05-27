/**
 * P3 W2-1 — icsPreviewBuilder (= pure module、 簡易重複候補判定)
 *
 * 設計書: docs/alter-plan-p3-ics-import-readiness.md §0.5 補正 4
 *
 * 役割:
 *   - IcsAnchorDraft (= W1 mapper の出力) と 既存 anchor 一覧を比較
 *   - **簡易ヒューリスティック** で 「重複候補あり」 warning 生成
 *   - 完全 dedup ではない (= UID 一致は W3 server action 本体で完全判定)
 *   - W2 preview UX 用 (= user に 「同じ予定が既にあるかも」 を気づかせる signal)
 *
 * 重複候補判定基準 (= GPT 補正 4):
 *   - DTSTART (= date + startTime) と既存 anchor の startTime が同日同時刻
 *   - SUMMARY (= title) が完全一致 or 近接 (= 5 字以内編集距離は不要、 ここでは完全一致)
 *   - LOCATION が完全一致 or 同じ (= optional 比較)
 *
 * 不変原則:
 *   - **pure module** (= I/O / DB / network なし、 既存 anchor は input で受領)
 *   - 入力 mutate なし
 *   - deterministic (= 同入力 → 同出力)
 *
 * 設計参考:
 *   - lib/plan/ics/icsToAnchorMapper.ts (= IcsAnchorDraft)
 *   - lib/plan/external-anchor.ts (= ExternalAnchor)
 */

import type { IcsAnchorDraft } from "./icsToAnchorMapper";
import type { ExternalAnchor } from "../external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 重複候補 reason (= UI badge 表示用)
 */
export type DuplicateReason =
  | "exact_match" // title + date + startTime 完全一致 (= 強い候補)
  | "same_time" // date + startTime 一致のみ (= 弱い候補)
  | "same_title_same_day"; // title + date 一致 (= 中程度候補)

/**
 * draft に付与する重複候補情報 (= 1 件の draft に対して 0 〜 N 件)
 *
 * UI で 「⚠ 重複候補あり」 badge を draft card に出す。
 */
export type DuplicateCandidate = {
  readonly reason: DuplicateReason;
  /** 既存 anchor の id (= UI で 「既存予定を表示」 link 用) */
  readonly existingAnchorId: string;
  /** 既存 anchor のタイトル (= UI 表示用) */
  readonly existingTitle: string;
};

/**
 * draft + 重複候補の組
 */
export type DraftWithCandidates = {
  readonly draft: IcsAnchorDraft;
  readonly duplicateCandidates: ReadonlyArray<DuplicateCandidate>;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildIcsPreview (= main entry)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * IcsAnchorDraft[] と既存 anchor[] から DraftWithCandidates[] を生成
 *
 * 各 draft について existingAnchors を走査し、 重複候補を `duplicateCandidates` に集約。
 *
 * 不変:
 *   - 入力 mutate なし
 *   - 同入力 → 同出力
 *   - existingAnchors 空 → candidates 全て空配列
 */
export function buildIcsPreview(
  drafts: ReadonlyArray<IcsAnchorDraft>,
  existingAnchors: ReadonlyArray<ExternalAnchor>,
): ReadonlyArray<DraftWithCandidates> {
  return drafts.map((draft) => {
    const candidates: DuplicateCandidate[] = [];
    for (const anchor of existingAnchors) {
      const candidate = matchSingleAnchor(draft, anchor);
      if (candidate !== null) {
        candidates.push(candidate);
      }
    }
    return { draft, duplicateCandidates: candidates };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// internal: 単一 anchor との重複判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * draft と 既存 anchor の 1 対 1 比較
 *
 * 判定優先順:
 *   1. **exact_match**: title + date + startTime 完全一致 (= 強い候補)
 *   2. **same_title_same_day**: title + date 一致 (= title 同じだが時刻違い、 中候補)
 *   3. **same_time**: date + startTime 一致 (= タイトル違うが同時刻、 弱い候補)
 *   4. なし
 *
 * 注: location は 副次的 (= 一致でも 「強く」 はならない、 ただ判定の補強)。
 *     OneOff / Recurring の比較は date と validFrom を区別 (= recurring の validFrom は anchor.date or validFrom と比較)。
 */
function matchSingleAnchor(
  draft: IcsAnchorDraft,
  anchor: ExternalAnchor,
): DuplicateCandidate | null {
  // draft の date 取得 (= one_off / recurring 両方)
  const draftDate =
    draft.anchorKind === "one_off" ? draft.date : draft.validFrom;
  if (draftDate === undefined) return null;

  // anchor の date 取得
  const anchorDate =
    anchor.anchorKind === "one_off" ? anchor.date : anchor.validFrom;
  if (anchorDate === undefined) return null;

  // date 一致確認 (= 異 date は重複候補にならない)
  if (draftDate !== anchorDate) return null;

  const sameStartTime = draft.startTime === anchor.startTime;
  const sameTitle = draft.title.trim() === anchor.title.trim();

  if (sameTitle && sameStartTime) {
    return {
      reason: "exact_match",
      existingAnchorId: anchor.id,
      existingTitle: anchor.title,
    };
  }

  if (sameTitle) {
    return {
      reason: "same_title_same_day",
      existingAnchorId: anchor.id,
      existingTitle: anchor.title,
    };
  }

  if (sameStartTime) {
    return {
      reason: "same_time",
      existingAnchorId: anchor.id,
      existingTitle: anchor.title,
    };
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UI helper: reason → 日本語短文
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DuplicateReason → 日本語表示用文字列 (= modal badge 表示用)
 */
export function describeDuplicateReason(reason: DuplicateReason): string {
  switch (reason) {
    case "exact_match":
      return "同じ予定が既にあります";
    case "same_title_same_day":
      return "同じタイトルの予定が同じ日にあります";
    case "same_time":
      return "同じ時刻に別の予定があります";
    default:
      return "重複候補あり";
  }
}
