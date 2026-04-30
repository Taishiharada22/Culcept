/**
 * L2.6 Party Annotator — Comprehension-First v1.3+ Wave 3 (W3-PR-2)
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md §6
 *
 * 責務:
 *   Event.who が空の event に対し、ユーザーの頻繁共起者 baseline から
 *   「誰と行きそうか」の **候補** を添える annotation 層。
 *
 * 設計原則（Q-4=A 確定、C-2 固定）:
 *   1. plan graph の Event.who を **絶対に書き換えない**（annotation のみ）
 *   2. narration に自動注入しない（C-2）— Wave 4+ で別設計
 *   3. 断定しない。常に複数候補 + score で保持
 *   4. user baseline が空なら空 annotation（provider 未接続 / 新規ユーザーに優しい）
 *   5. 純関数。副作用なし。LLM 呼び出しなし
 *
 * 本関数は Rendezvous の relation graph には一切触れない（別ドメイン）。
 */

import type { Event } from "../comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーの過去記録から得られる頻繁共起者 baseline。
 *
 * 例:
 *   [
 *     { name: "田中", activityAffinity: { "ランチ": 0.8, "コーヒー": 0.4 } },
 *     { name: "鈴木", activityAffinity: { "ミーティング": 0.9 } },
 *   ]
 *
 * 本 PR では呼び出し側が stub を供給する。Wave 4+ で Rendezvous / Calendar
 * baseline との統合を検討（scope 外）。
 */
export interface PartyBaselineEntry {
  /** 人名（表示用） */
  name: string;
  /**
   * 活動との親和度 0-1。
   * 例: { "ランチ": 0.8 } → この人はランチで一緒になることが多い
   * 活動キーは Event.what.activityCanonical と一致させる想定。
   */
  activityAffinity: Record<string, number>;
  /** 全体の共起頻度 0-1（活動を問わない背景確率） */
  baseFrequency?: number;
}

export interface PartyCandidate {
  name: string;
  /** 候補スコア 0-1 */
  score: number;
  /** 根拠（"activity=ランチ" / "baseFrequency" 等） */
  basis: string[];
}

export interface PartyAnnotation {
  event_id: string;
  /** 候補リスト（score 降順）。断定ではなく候補として保持 */
  candidates: PartyCandidate[];
  /**
   * plan graph の Event.who が既に埋まっているか。
   * true なら annotation は「補完」ではなく「参考」として扱う。
   */
  has_explicit_who: boolean;
  confidence: "low" | "medium" | "high";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_CANDIDATES = 3;
const SCORE_THRESHOLD = 0.15;

/**
 * event と baseline entry 1 件のスコアを計算。
 *
 * スコアは activity 親和度（ある時）と baseFrequency の max を取る（max は
 * 加算より安全。複数の根拠がある時は basis に両方を載せる）。
 */
function scoreEntry(
  ev: Event,
  entry: PartyBaselineEntry,
): { score: number; basis: string[] } {
  const basis: string[] = [];
  let score = 0;

  const activityKey = ev.what.activityCanonical || ev.what.activity || "";
  if (activityKey && entry.activityAffinity[activityKey] !== undefined) {
    const aff = entry.activityAffinity[activityKey];
    if (aff > score) score = aff;
    basis.push(`activity=${activityKey}:${aff.toFixed(2)}`);
  }

  if (entry.baseFrequency !== undefined && entry.baseFrequency > 0) {
    if (entry.baseFrequency > score) score = entry.baseFrequency;
    basis.push(`baseFrequency:${entry.baseFrequency.toFixed(2)}`);
  }

  return { score, basis };
}

function deriveConfidence(
  candidates: PartyCandidate[],
  baselineSize: number,
): PartyAnnotation["confidence"] {
  if (baselineSize === 0) return "low";
  if (candidates.length === 0) return "low";
  const top = candidates[0];
  if (top.score >= 0.6) return "high";
  if (top.score >= 0.3) return "medium";
  return "low";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * events に対し PartyAnnotation を生成する。
 *
 * 契約:
 *   - events / baseline を書き換えない
 *   - event.who が既に埋まっている場合は has_explicit_who=true で候補は空
 *   - baseline が空の場合は空 candidate で通す（error にしない）
 *   - candidates は score 降順、top {MAX_CANDIDATES} まで
 */
export function annotateParty(
  events: Event[],
  baseline: PartyBaselineEntry[],
): PartyAnnotation[] {
  return events.map((ev) => {
    const hasExplicit = ev.who.length > 0;

    // 既に who が埋まっていれば候補生成は不要（UI 側では参考情報にすら出さない）
    if (hasExplicit) {
      return {
        event_id: ev.event_id,
        candidates: [],
        has_explicit_who: true,
        confidence: "low" as const,
      };
    }

    const scored = baseline
      .map((entry) => {
        const { score, basis } = scoreEntry(ev, entry);
        return { name: entry.name, score, basis };
      })
      .filter((c) => c.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);

    return {
      event_id: ev.event_id,
      candidates: scored,
      has_explicit_who: false,
      confidence: deriveConfidence(scored, baseline.length),
    };
  });
}
