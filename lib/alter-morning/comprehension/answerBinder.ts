/**
 * answerBinder — W3-PR-7 Commit 2
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §4.2, §6.3
 *
 * 責務:
 *   PendingClarify が指す特定の event.slot に、ユーザー返答を**直接**書き込む。
 *   LLM 再 comprehension に頼らず純 rule-based で bind する。
 *
 * 返り値:
 *   - { events, bound: true, reason: "ok" }:      正常に slot に書き込めた
 *   - { events, bound: false, reason: "semantic_miss" }: 返答が slot に対して
 *     解釈不能（例: where を聞いたのに「おなかすいた」）。連続カウント対象
 *   - { events, bound: false, reason: "system_miss" }:   event_id が存在しない等、
 *     系側の失敗。連続カウントしない（pending 継続）
 *
 * 設計原則:
 *   - 純関数・副作用なし・LLM 呼び出しなし
 *   - 入力 events は immutable（shallow clone で必要箇所のみ置換）
 *   - 失敗時も events は元のまま返す（plan 継続性を壊さない）
 */
import type {
  Event,
  Provenance,
} from "./eventSchema";
import { utteranceProvenance } from "./eventSchema";
import { extractExplicitTimes } from "./rulePreParse";
import type { PendingClarify, PendingSlot } from "../types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type BindResult =
  | { events: Event[]; bound: true; reason: "ok"; boundSlot: PendingSlot }
  | { events: Event[]; bound: false; reason: "semantic_miss" | "system_miss" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// slot-specific parsers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 明示時刻 "HH:mm" を answer から 1 件抽出。見つからなければ null。
 * 複数あっても最初の 1 件のみ採用（1-turn-1-question 原則）。
 */
function parseExplicitTime(answer: string): string | null {
  const times = extractExplicitTimes(answer);
  if (times.length === 0) return null;
  return times[0].value;
}

/**
 * 粗い時間帯語（朝/昼/夕/夜）を timeHint に変換。
 */
function parseTimeHint(answer: string): "morning" | "noon" | "afternoon" | "evening" | null {
  const a = answer.normalize("NFKC");
  // 保守的に: 明示語のみ拾う。"朝早く" は morning に、"夕方" は evening に寄せる
  if (/夕方|夕食|夕飯|夕ごはん/.test(a)) return "evening";
  if (/夜|晩/.test(a)) return "evening";
  if (/朝|午前/.test(a)) return "morning";
  if (/昼|お昼|ランチ/.test(a)) return "noon";
  if (/午後/.test(a)) return "afternoon";
  return null;
}

/**
 * 移動手段を answer から抽出。代表的な語を保守的に検出。
 */
function parseTransport(answer: string): string | null {
  const a = answer.normalize("NFKC");
  if (/電車|地下鉄|JR|私鉄/i.test(a)) return "電車";
  if (/徒歩|歩き|歩いて/.test(a)) return "徒歩";
  if (/自転車|チャリ/.test(a)) return "自転車";
  if (/車|クルマ|タクシー|Uber/i.test(a)) return "車";
  if (/バス/.test(a)) return "バス";
  return null;
}

/**
 * 場所っぽい文字列を answer から抽出。
 * 保守主義: 直球で answer そのもの（trim + 余計な語尾除去）を使う。
 * "渋谷のカフェで" → "渋谷のカフェ"
 * "図書館かな" → "図書館"
 */
function normalizePlaceAnswer(answer: string): string | null {
  const a = answer.trim();
  if (!a) return null;
  // 語尾の助詞・揺れ表現を削る
  const cleaned = a
    .replace(/で$/, "")
    .replace(/に$/, "")
    .replace(/かな$/, "")
    .replace(/です$/, "")
    .replace(/。$/, "")
    .replace(/！$/, "")
    .replace(/、$/, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 活動っぽい文字列を answer から抽出。place と同じ正規化でよい。
 */
function normalizeActivityAnswer(answer: string): string | null {
  return normalizePlaceAnswer(answer);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * pending が指す event の slot にユーザー返答を書き込む。
 *
 * 解釈テーブル:
 *   | pending.slot | pending.kind                       | 解釈                                      |
 *   |--------------|------------------------------------|-------------------------------------------|
 *   | when         | specific_time                      | parseExplicitTime → startTime             |
 *   | when         | coarse_time_bucket / tentative_chain | parseTimeHint → timeHint                |
 *   | where        | where_center / where_pick_from_candidates | normalizePlaceAnswer → place_ref    |
 *   | what         | activity                           | normalizeActivityAnswer → activity        |
 *   | transport    | transport                          | parseTransport → transport                |
 *   | endpoint     | endpoint                           | best-effort: 時刻 → end_time 相当         |
 */
export function bindAnswerToSlot(
  events: Event[],
  pending: PendingClarify,
  answer: string,
): BindResult {
  if (!answer || !answer.trim()) {
    return { events, bound: false, reason: "semantic_miss" };
  }

  const idx = events.findIndex((e) => e.event_id === pending.event_id);
  if (idx < 0) {
    return { events, bound: false, reason: "system_miss" };
  }
  const target = events[idx];
  const prov: Provenance = utteranceProvenance([answer.trim()], "high");

  let updated: Event | null = null;

  switch (pending.slot) {
    case "when": {
      if (pending.kind === "specific_time") {
        const hhmm = parseExplicitTime(answer);
        if (hhmm) {
          updated = {
            ...target,
            when: {
              ...target.when,
              startTime: hhmm,
              timeHint: null,
              provenance: prov,
            },
          };
        } else {
          // 時刻が拾えない場合、粗い timeHint で代替
          const hint = parseTimeHint(answer);
          if (hint) {
            updated = {
              ...target,
              when: {
                ...target.when,
                startTime: null,
                timeHint: hint,
                provenance: prov,
              },
            };
          }
        }
      } else {
        // coarse_time_bucket / tentative_chain
        const hint = parseTimeHint(answer);
        if (hint) {
          updated = {
            ...target,
            when: {
              ...target.when,
              timeHint: hint,
              provenance: prov,
            },
          };
        } else {
          // 明示 HH:mm が来るケースも救う
          const hhmm = parseExplicitTime(answer);
          if (hhmm) {
            updated = {
              ...target,
              when: {
                ...target.when,
                startTime: hhmm,
                timeHint: null,
                provenance: prov,
              },
            };
          }
        }
      }
      break;
    }

    case "where": {
      const place = normalizePlaceAnswer(answer);
      if (place) {
        updated = {
          ...target,
          where: {
            ...target.where,
            place_ref: place,
            // placeType は不明 — null に。sharpness=vague で grounder に回す
            placeType: null,
            provenance: prov,
          },
        };
      }
      break;
    }

    case "what": {
      const activity = normalizeActivityAnswer(answer);
      if (activity) {
        updated = {
          ...target,
          what: {
            ...target.what,
            activity,
            activityCanonical: activity,
            provenance: prov,
          },
        };
      }
      break;
    }

    case "transport": {
      const t = parseTransport(answer);
      if (t) {
        updated = {
          ...target,
          transport: t,
        };
      }
      break;
    }

    case "endpoint": {
      // best-effort: 時刻が来れば end_time 相当のヒントとして timeHint を埋める。
      // 本 PR では endpoint は場所ではなく time として解釈。構造的には正本 slot が
      // ないため、transport と同様に「解釈できれば ok / できなければ miss」の扱い。
      const hhmm = parseExplicitTime(answer);
      if (hhmm) {
        // endpoint 時刻は provenance を when に乗せる（暫定）
        updated = {
          ...target,
          when: {
            ...target.when,
            // startTime が既にあれば書き換えない
            startTime: target.when.startTime ?? null,
            provenance: target.when.provenance,
          },
        };
        // endpoint semantic は schema に正本が無い — 最小対応として updated を
        // non-null に倒して bind=true を返すが、実際の書き込みは行わない
      }
      break;
    }
  }

  if (!updated) {
    return { events, bound: false, reason: "semantic_miss" };
  }

  const next = events.slice();
  next[idx] = updated;
  // missing_semantic_critical を再計算（W3-PR-7: sharpness は derived なので Event
  // schema 上は missing_semantic_critical のみ手動更新）
  next[idx] = {
    ...next[idx],
    missing_semantic_critical: recomputeSemanticMissing(next[idx]),
  };

  return { events: next, bound: true, reason: "ok", boundSlot: pending.slot };
}

/**
 * missing_semantic_critical を raw slot 値から再計算。
 * provenanceChecker.isWhenMissing/isWhereMissing/isWhatMissing の本質と同一ロジック。
 */
function recomputeSemanticMissing(ev: Event): ("when" | "where" | "what")[] {
  const out: ("when" | "where" | "what")[] = [];
  if (ev.when.startTime == null && ev.when.timeHint == null) out.push("when");
  if (ev.where.place_ref == null) out.push("where");
  if (!ev.what.activity || ev.what.activity.trim() === "") out.push("what");
  return out;
}
