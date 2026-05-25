/**
 * Anchor Overlap Detection helper (Phase 2-E)
 *
 * 設計書: docs/alter-plan-phase2-e-time-overlap-mini-design.md
 *
 * 役割:
 *   同日内 timed anchor の時刻重なりを検出する pure helper。
 *   CalendarTab / FlowTab / MapTab すべてで本 helper のみを使い、
 *   独自判定を書かない (Phase 2-D C3 Cross-tab 単一仕様ルール踏襲)。
 *
 * 不変原則 (mini design §2, §4):
 *   - 警告ではなく「気付き」
 *   - rigidity / priority による優先度判定なし、全 anchor 対等
 *   - 半開区間 [start, end) 交差判定 (touching は overlap しない)
 *   - 自身とは比較しない
 *   - startTime + endTime 両方有効、start < end の anchor のみ対象
 *   - malformed / null / start >= end は defensive skip
 *   - server 通信なし、外部送信なし (= sensitive anchor も判定対象、UI 側で文言だけで表示)
 *
 * Complexity: O(n²) pairwise、anchor 数 typical < 50 で問題なし。
 *   Future sweepline (O(n log n)) 化は scope 外 (mini design §14)。
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal time parsing (defensive)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 時刻文字列を minutes (0-1439) に変換 (private、defensive)。
 *
 * 仕様 (mini design §7):
 *   - 想定: "HH:MM" 形式 (ExternalAnchor.startTime のコメント「HH:mm 形式 or ISO 8601」 より)
 *   - 秒部分 ":SS" は tolerant (HH:MM:SS も受ける、秒は無視)
 *   - 1-2 桁 hour 許容 ("9:00" / "09:00" 両方)
 *   - 範囲: h ∈ [0,23], m ∈ [0,59]
 *
 * Defensive:
 *   - null / undefined / 空 / whitespace-only → null
 *   - 形式不正 ("abc" / "9-00" / ISO 8601 等) → null
 *   - 範囲外 (25:00, 23:99 等) → null
 *
 * 既存 `minutesOf` (in tabs/_helpers.ts) との関係:
 *   既存 `minutesOf` は `Number(h) || 0` で silent fallback (malformed → 0 として返す)。
 *   本 helper はそれより strict な defensive 仕様のため、独自実装 (再利用しない)。
 *
 * @returns minutes (0-1439) または null (= overlap 判定対象外)
 */
function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const trimmed = time.trim();
  if (!trimmed) return null;
  // HH:MM、HH:MM:SS、1-2 桁 hour、2 桁 minute (秒は無視)
  const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 同日内 timed anchor の重なり検出 (Pure)。
 *
 * @param anchorsForDay 1 日分の anchor (recurring 展開済 / exception_dates 除外済)
 * @returns 他 anchor と時刻が重なる anchor id の Set。空集合あり得る。
 *
 * Note:
 *   - 入力は同日 anchor 前提 (= helper は日付チェックしない、呼び出し側責任)
 *   - sensitive 区別なく判定 (時刻重なりは外部送信でも内容開示でもない、UI 側で privacy 維持)
 */
export function detectTimedAnchorOverlaps(
  anchorsForDay: ReadonlyArray<ExternalAnchor>,
): Set<string> {
  // 1. timed なものだけ抽出 + minutes 化 (1 回計算、後の pairwise で再変換しない)
  const timed: Array<{ id: string; start: number; end: number }> = [];
  for (const a of anchorsForDay) {
    const start = toMinutes(a.startTime);
    const end = toMinutes(a.endTime);
    if (start === null || end === null) continue; // untimed / malformed skip
    if (start >= end) continue; // zero-duration / inverted (midnight cross) skip
    timed.push({ id: a.id, start, end });
  }

  // 2. pairwise 交差 (O(n²))。anchor 数 typical < 50 で問題なし
  const overlapping = new Set<string>();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]!;
      const b = timed[j]!;
      // 半開区間 [start, end) 交差: a.start < b.end ∧ b.start < a.end
      if (a.start < b.end && b.start < a.end) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }
  return overlapping;
}

/**
 * 個別 anchor の overlap 判定 convenience (Set.has wrap)。
 *
 * 大量呼び出しでは `detectTimedAnchorOverlaps` + `overlapSet.has(id)` が効率的。
 * 本 helper は 1 anchor のみ判定したい場面 (e.g. SelectedAnchorCard 単独) のための糖衣。
 */
export function isAnchorOverlapping(
  anchor: ExternalAnchor,
  overlappingIds: ReadonlySet<string>,
): boolean {
  return overlappingIds.has(anchor.id);
}
