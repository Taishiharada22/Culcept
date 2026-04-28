/**
 * L2 Modify Router — Comprehension-First v1.3+ Wave 1
 *
 * 設計書: docs/alter-morning-comprehension-first-v1.3plus.md §2.4, §9 Q-D
 *
 * 責務:
 *   - Turn 2+ の modify event が持つ自然言語 target_ref（"朝の予定", "ランチ" 等）
 *     から既存 event_id を deterministic に解決する
 *   - L1 LLM は内部 ID を扱わない方針（Q-D 決定: 後者採用）
 *
 * 解決戦略（優先順位）:
 *   1. time bucket ヒント（"朝"/"昼"/"午後"/"夜"/"ランチ"/"夕食" 等）
 *      → startTime / timeHint から deriveTimeHintFromStartTime で逆引き一致
 *   2. activity 文字列部分一致（"打ち合わせ", "カフェ" 等）
 *      → event.what.activity / activityCanonical の substring 一致
 *   3. place 文字列部分一致（"サドヤの予定" 等）
 *      → event.where.place_ref の substring 一致
 *   4. 順序表現（"最初の", "次の", "最後の"）
 *      → events 配列の位置
 *
 * 同点時は最初にマッチしたものを採用し、target_ref_confidence を medium にする。
 *
 * 純関数。副作用なし。LLM 呼び出しなし。
 */

import type { Event, ProvenanceConfidence } from "../comprehension/eventSchema";
import { deriveTimeHintFromStartTime } from "./timeSolver";
import { normalizeForMatch } from "../comprehension/provenanceChecker";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Time bucket 語彙
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TIME_BUCKET_KEYWORDS: Record<string, "morning" | "noon" | "afternoon" | "evening"> = {
  "朝": "morning",
  "午前": "morning",
  "朝食": "morning",
  "朝ごはん": "morning",
  "モーニング": "morning",
  "昼": "noon",
  "ランチ": "noon",
  "昼食": "noon",
  "昼ごはん": "noon",
  "正午": "noon",
  "午後": "afternoon",
  "夕方": "evening",
  "夜": "evening",
  "夕食": "evening",
  "晩御飯": "evening",
  "夕飯": "evening",
  "ディナー": "evening",
  "晩": "evening",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 順序表現
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ORDINAL_KEYWORDS: Record<string, "first" | "last" | "second"> = {
  "最初": "first",
  "1つ目": "first",
  "一つ目": "first",
  "最後": "last",
  "ラスト": "last",
  "2つ目": "second",
  "二つ目": "second",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TargetRefResolution {
  event_id: string | null;
  confidence: ProvenanceConfidence | null;
  /** どの戦略で解決したか（デバッグ / ログ用） */
  strategy: "time_bucket" | "activity" | "place" | "ordinal" | "none";
}

/**
 * 既存 events（L1 で確定済み）の中から target_ref が指す event を特定する。
 *
 * @param targetRef  L1 LLM が出力した自然言語ヒント（"朝の予定"等）
 * @param existing   これまでのターンで確定した events（Create 済み）
 */
export function resolveTargetRef(
  targetRef: string,
  existing: Event[],
): TargetRefResolution {
  if (!targetRef || existing.length === 0) {
    return { event_id: null, confidence: null, strategy: "none" };
  }

  const normRef = normalizeForMatch(targetRef);

  // ── Strategy 1a: explicit hour match (CEO 2026-04-28 PR #41a Commit 9) ──
  //   target_ref に「9時」「10時の予定」「07:30の予定」 等の明示時刻が含まれる場合、
  //   prior events の startTime と数値 hour で比較して一致を見つける。
  //   time_bucket strategy の中で先に走らせる (より specific なため)。
  //
  //   理由 (CEO directive):
  //     detectModifyIntent が target_ref="9時の予定" を生成するが、既存
  //     TIME_BUCKET_KEYWORDS には「9時」が無いため Strategy 1 で resolve しない。
  //     explicit hour match を追加することで「9時の予定」 が high confidence で
  //     resolve できるようにする。
  //
  //   pattern: "(\\d{1,2})時" (e.g., "9時", "10時", "21時")
  //   normalized 後の文字列に hour pattern があれば、existing events から
  //   startTime の hour 部分が一致する event を探す。
  const explicitHourMatch = normRef.match(/(\d{1,2})時/);
  if (explicitHourMatch) {
    const hour = parseInt(explicitHourMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      const matches = existing.filter((e) => {
        if (!e.when.startTime) return false;
        const parts = e.when.startTime.split(":");
        if (parts.length < 1) return false;
        const startHour = parseInt(parts[0], 10);
        return Number.isFinite(startHour) && startHour === hour;
      });
      if (matches.length === 1) {
        return {
          event_id: matches[0].event_id,
          confidence: "high",
          strategy: "time_bucket",
        };
      }
      if (matches.length > 1) {
        return {
          event_id: matches[0].event_id,
          confidence: "medium",
          strategy: "time_bucket",
        };
      }
      // hour 一致なし → time_bucket keyword strategy に fall-through
    }
  }

  // Strategy 1b: time bucket keyword (朝/昼/夜 等)
  for (const [kw, bucket] of Object.entries(TIME_BUCKET_KEYWORDS)) {
    if (normRef.includes(normalizeForMatch(kw))) {
      // 直接 timeHint 一致優先
      const directMatches = existing.filter((e) => e.when.timeHint === bucket);
      if (directMatches.length === 1) {
        return {
          event_id: directMatches[0].event_id,
          confidence: "high",
          strategy: "time_bucket",
        };
      }
      if (directMatches.length > 1) {
        return {
          event_id: directMatches[0].event_id,
          confidence: "medium",
          strategy: "time_bucket",
        };
      }
      // 逆引き fallback: startTime → timeHint
      const derived = existing.filter(
        (e) => deriveTimeHintFromStartTime(e.when.startTime) === bucket,
      );
      if (derived.length === 1) {
        return {
          event_id: derived[0].event_id,
          confidence: "high",
          strategy: "time_bucket",
        };
      }
      if (derived.length > 1) {
        return {
          event_id: derived[0].event_id,
          confidence: "medium",
          strategy: "time_bucket",
        };
      }
    }
  }

  // Strategy 2: activity 部分一致
  for (const ev of existing) {
    const act = normalizeForMatch(ev.what.activity);
    const actC = normalizeForMatch(ev.what.activityCanonical);
    if (act && normRef.includes(act)) {
      return { event_id: ev.event_id, confidence: "high", strategy: "activity" };
    }
    if (actC && normRef.includes(actC)) {
      return { event_id: ev.event_id, confidence: "high", strategy: "activity" };
    }
  }

  // Strategy 3: place 部分一致
  for (const ev of existing) {
    if (!ev.where.place_ref) continue;
    const place = normalizeForMatch(ev.where.place_ref);
    if (place && normRef.includes(place)) {
      return { event_id: ev.event_id, confidence: "high", strategy: "place" };
    }
  }

  // Strategy 4: 順序表現
  for (const [kw, ord] of Object.entries(ORDINAL_KEYWORDS)) {
    if (normRef.includes(normalizeForMatch(kw))) {
      if (ord === "first" && existing.length >= 1) {
        return {
          event_id: existing[0].event_id,
          confidence: "medium",
          strategy: "ordinal",
        };
      }
      if (ord === "last" && existing.length >= 1) {
        return {
          event_id: existing[existing.length - 1].event_id,
          confidence: "medium",
          strategy: "ordinal",
        };
      }
      if (ord === "second" && existing.length >= 2) {
        return {
          event_id: existing[1].event_id,
          confidence: "medium",
          strategy: "ordinal",
        };
      }
    }
  }

  return { event_id: null, confidence: "low", strategy: "none" };
}

/**
 * modify event に target_ref_confidence を注入する（solver 前処理）。
 *
 * 入力 modify event に target_ref_confidence が既にセット済みならそれを尊重。
 * 未セット or null の場合に resolveTargetRef で解決し書き込む。
 */
export function annotateTargetRefConfidence(
  ev: Event,
  existing: Event[],
): Event {
  if (ev.turn_mode !== "modify") return ev;
  if (ev.target_ref_confidence != null) return ev;
  if (!ev.target_ref) {
    return { ...ev, target_ref_confidence: "low" };
  }
  const res = resolveTargetRef(ev.target_ref, existing);
  return { ...ev, target_ref_confidence: res.confidence ?? "low" };
}
