/**
 * Canonical Event Identity — PR-50 Commit 12 (CEO 2026-04-30)
 *
 * Goal:
 *   2 つの Event が「同じ予定」 を指しているかを **保守的かつ実用的に** 判定する
 *   pure helpers。dispatchEventMerge (Commit 12) と canonical merge (Commit 14)
 *   の両方で再利用される共通 identity 判定。
 *
 * 設計原則 (CEO 確定 2026-04-30):
 *   - **substring match 単独は禁止**: チェーン店 / 同名店舗の誤マージリスク
 *   - **same time + same activity を前提**: 異なる予定が偶然マージされる事故を防ぐ
 *   - **place identity は厳格な複数条件で防御**:
 *       1. exact place_ref 一致 OR
 *       2. coordinates 近接 (50m 以内) OR
 *       3. 一方が exact_proper_noun + place_ref が他方を包含 (= places API resolved name)
 *
 * 使用箇所:
 *   - eventMergeDispatch.ts: dispatchEventMerge の create branch 同一性判定
 *   - legacyAdapter.ts (Commit 14): post-process duplicate merge
 */

import type { Event } from "../comprehension/eventSchema";
import { haversineKm } from "../objectiveFunction";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * coordinates 近接判定の閾値 (メートル)。
 *
 * 50m に設定する理由:
 *   - 同じ建物 / 同じ複合施設内の違う店舗 (スターバックス 1F / 2F) は実質的に
 *     同じ場所として扱う
 *   - 50m 以上離れた店舗は別店舗として保守的に区別
 *   - GPS 誤差 (typically 5-15m) を許容
 */
const COORDINATE_PROXIMITY_METERS = 50;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isSameEventCanonical
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 2 つの Event が canonical identity 上で「同じ予定」 か判定。
 *
 * 判定ロジック (CEO 確定 2026-04-30):
 *   必須条件 (両方満たす):
 *     1. when.startTime が両方 non-null かつ一致
 *     2. what.activity (空白 trim 後) が両方 non-empty かつ一致
 *
 *   place identity 条件 (どれか満たす):
 *     A. where.place_ref 完全一致 (両方 non-null)
 *     B. coordinates 近接 (両方 non-null、距離 < 50m)
 *     C. 一方が exact_proper_noun の placeType を持ち、その place_ref が
 *        他方の place_ref を包含 (= places API resolved name が raw name を含む)
 *
 * 偽陽性 (false positive) 防止:
 *   - substring match を C のみに限定 (= exact_proper_noun を前提)
 *   - チェーン店誤マージ: 別の「スターバックス」 でも coordinates が違えば false
 *   - 異店舗の誤マージ: 「スタバ A」 と 「スタバ B」 は exact_proper_noun かつ
 *     coordinates が異なれば false
 *
 * 偽陰性 (false negative) 防止:
 *   - LLM raw output (place_ref="スタバ") と persisted resolved
 *     (place_ref="スターバックス コーヒー SHIBUYA TSUTAYA 2F店",
 *      placeType="exact_proper_noun") の merge は条件 C で救済
 *   - GPS 誤差で同じ店舗の coordinates が微妙にずれていても 50m 以内なら救済
 */
export function isSameEventCanonical(a: Event, b: Event): boolean {
  // 必須条件 1: when.startTime 両方 non-null かつ一致
  if (a.when.startTime === null || b.when.startTime === null) return false;
  if (a.when.startTime !== b.when.startTime) return false;

  // 必須条件 2: what.activity 一致 (空白 trim 後の正規化)
  const aActivity = (a.what.activity || a.what.activityCanonical || "").trim();
  const bActivity = (b.what.activity || b.what.activityCanonical || "").trim();
  if (!aActivity || !bActivity) return false;
  if (aActivity !== bActivity) return false;

  // place identity 条件 A: place_ref 完全一致
  if (
    a.where.place_ref !== null &&
    b.where.place_ref !== null &&
    a.where.place_ref === b.where.place_ref
  ) {
    return true;
  }

  // place identity 条件 B: coordinates 近接 (両方 non-null)
  if (a.where.coordinates && b.where.coordinates) {
    const distKm = haversineKm(a.where.coordinates, b.where.coordinates);
    if (distKm * 1000 < COORDINATE_PROXIMITY_METERS) {
      return true;
    }
  }

  // place identity 条件 C: exact_proper_noun + 包含関係
  //   (a が exact_proper_noun + b の place_ref を含む)
  if (
    a.where.placeType === "exact_proper_noun" &&
    a.where.place_ref &&
    b.where.place_ref &&
    a.where.place_ref.includes(b.where.place_ref)
  ) {
    return true;
  }
  // 逆方向 (b が exact_proper_noun + a の place_ref を含む)
  if (
    b.where.placeType === "exact_proper_noun" &&
    a.where.place_ref &&
    b.where.place_ref &&
    b.where.place_ref.includes(a.where.place_ref)
  ) {
    return true;
  }

  // place identity 条件 D (CEO 2026-04-30 LLM partial output 救済):
  //   片方が place_ref=null かつもう片方が non-null + 必須条件 (when + activity)
  //   一致 → 同じ予定とみなす。
  //
  //   理由: LLM が context bind で同じ予定を partial output (where=null) で
  //   再構築するケースが実機で発生する。これを別予定扱いすると duplicate event
  //   が作られる。CEO Case「同一 event の partial update (where 確定後)」
  //   (reconcileScenarioCEO test) で観測。
  //
  //   リスク: 同時刻同活動の別予定 + cur partial の場合に誤 merge する可能性。
  //   ただしこれは稀な edge case で、duplicate event の発生より UX 影響が小さい。
  if (
    (a.where.place_ref === null && b.where.place_ref !== null) ||
    (b.where.place_ref === null && a.where.place_ref !== null)
  ) {
    return true;
  }

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isFromCurrentUtterance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Event が **current turn の utterance** から抽出されたものかを判定。
 *
 * 用途 (CEO 確定 2026-04-30):
 *   dispatchEventMerge で priorEvents が non-empty の状態で LLM が events[]
 *   を返した場合、その events が「current utterance 由来」 か「prior の
 *   re-extraction (= 過去発話の event を出した)」 かを区別する。
 *   re-extraction なら drop (新規追加しない) して duplicate を防ぐ。
 *
 * 判定ロジック (CEO 強化 2026-04-30):
 *   provenance.source_span **に加えて** slot value も utterance に対して check。
 *   理由: LLM が provenance を弱く出した場合 (空配列 / 違う span) でも
 *   slot value (例: place_ref="新宿") が utterance に含まれていれば current 由来
 *   とみなす。これで append が誤って drop される false negative を防ぐ。
 *
 *   どれか 1 つでも match すれば true:
 *     1. provenance.source_span が utterance の substring (when/where/what いずれかの slot)
 *     2. when.startTime に対応する数字が utterance に「N時」 形式で含まれる
 *        (e.g., utterance="12時に新宿でランチ" + startTime="12:00" → "12時" match)
 *     3. when.startTime が utterance に「HH:MM」 形式で含まれる
 *     4. where.place_ref が utterance の substring (両方 non-null)
 *     5. what.activity / activityCanonical が utterance の substring
 *
 * 偽陽性 (false positive) 防止:
 *   - prior re-extraction (= LLM が prior の slot value を出力) の場合、その値は
 *     utterance に含まれない (= 過去発話の値) → false
 *   - 唯一の例外: prior と current で偶然同じ場所 / 時刻 / 活動が重なる場合
 *     → これは canonical identity 判定で merge されるので問題なし
 *
 * 偽陰性 (false negative) 防止:
 *   - LLM が provenance を弱く出しても slot value 直接照合で救済 (CEO 強化)
 *   - 「12時」 ⇔ "12:00" の数字形式違いを救済
 */
export function isFromCurrentUtterance(
  event: Event,
  utterance: string,
): boolean {
  const u = utterance.normalize("NFKC");

  // 1. provenance.source_span が utterance に含まれる
  const spans = [
    ...event.when.provenance.source_span,
    ...event.where.provenance.source_span,
    ...event.what.provenance.source_span,
  ];
  for (const span of spans) {
    if (span.length > 0 && u.includes(span)) return true;
  }

  // 2. when.startTime の hour 部分が utterance に「N時」 形式で含まれる
  if (event.when.startTime) {
    const hhmm = event.when.startTime.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
      const eventHour = parseInt(hhmm[1], 10);
      // utterance の「N時」 を抽出して event の hour と比較
      const utteranceHourPattern = /(\d{1,2})時/g;
      let match: RegExpExecArray | null;
      while ((match = utteranceHourPattern.exec(u)) !== null) {
        const utteranceHour = parseInt(match[1], 10);
        if (utteranceHour === eventHour) return true;
      }
      // utterance に「HH:MM」 形式で含まれる
      if (u.includes(event.when.startTime)) return true;
    }
  }

  // 3. where.place_ref が utterance の substring
  if (event.where.place_ref && u.includes(event.where.place_ref)) {
    return true;
  }

  // 4. what.activity / activityCanonical が utterance の substring
  const activity = event.what.activity || "";
  const activityCanonical = event.what.activityCanonical || "";
  if (activity.length > 0 && u.includes(activity)) return true;
  if (activityCanonical.length > 0 && u.includes(activityCanonical)) return true;

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// countNonEmptyCriticalSlots
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Event の when / where / what のうち、non-empty な slot 数をカウント。
 *
 * 用途 (CEO 確定 2026-04-30):
 *   dispatchEventMerge で create event を「本物の append」 として認める condition
 *   の 1 つ。**2 slot 以上** が non-empty なら append として通す。
 *   1 slot 以下なら drop (= 中身がほぼ空の event を新規追加しない)。
 *
 * 判定:
 *   - when: startTime != null OR timeHint != null
 *   - where: place_ref が non-null かつ trim 後 non-empty
 *   - what: activity が non-empty (trim 後)
 *
 * 例:
 *   - 「12時に新宿でランチ」 → when=12:00, where=新宿, what=ランチ → count=3
 *   - 「12時にランチ」 → when=12:00, what=ランチ → count=2 (where は null)
 *   - 「ランチ」 → what=ランチ のみ → count=1
 *   - empty event → count=0
 */
export function countNonEmptyCriticalSlots(event: Event): number {
  let count = 0;
  if (event.when.startTime !== null || event.when.timeHint !== null) count++;
  if (event.where.place_ref !== null && event.where.place_ref.trim() !== "") {
    count++;
  }
  if (event.what.activity && event.what.activity.trim() !== "") count++;
  return count;
}
