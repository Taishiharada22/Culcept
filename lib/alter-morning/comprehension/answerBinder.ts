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
import { blockingForEvent } from "../planning/blockingSlots";
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
 *
 * PR-50 Commit 7 (CEO 2026-04-30): export 化。
 *   deterministicOperationSynth.ts でも transport token 判定に再利用する。
 *   transport vocabulary を 1 箇所 (本関数 + parseTransportExact) に集約する
 *   ことで、新しい token の追加 (e.g., 「自家用車」「タクシー」 等) を
 *   answerBinder と synth の両方に一括反映できる。
 *
 * 検出方式: **contains-based** (answer 文字列に token が含まれるか)。
 *   - 「電車で行く」 → "電車" を返す (本関数の旧仕様維持)
 *   - 「9時に電車で渋谷」 → "電車" を返す
 *   contains 方式は answerBinder の文脈 (pendingClarify 回答) では正しい:
 *   answer 文字列の中に transport を表す語があれば bind 対象。
 *
 * 完全一致が必要な場合は parseTransportExact を使う (synth 層、utterance 全体
 * が transport token のみであることを保証する用途)。
 */
export function parseTransport(answer: string): string | null {
  const a = answer.normalize("NFKC");
  if (/電車|地下鉄|JR|私鉄/i.test(a)) return "電車";
  if (/徒歩|歩き|歩いて/.test(a)) return "徒歩";
  if (/自転車|チャリ/.test(a)) return "自転車";
  if (/車|クルマ|タクシー|Uber/i.test(a)) return "車";
  if (/バス/.test(a)) return "バス";
  return null;
}

/**
 * 移動手段を **完全一致** で抽出。synth 層の transport-only 判定用。
 *
 * PR-50 Commit 7 (CEO 2026-04-30):
 *   parseTransport (contains-based) と異なり、token 全体が transport
 *   vocabulary に等しいことを要求する。
 *   - 「電車」 → "電車"
 *   - 「電車で行く」 → null (動詞含む)
 *   - 「9時に電車」 → null (時刻含む)
 *
 * 戻り値: 正規化済 transport (parseTransport と同じ vocabulary)。
 *   - 電車 / 地下鉄 / JR / 私鉄 → "電車"
 *   - 徒歩 / 歩き → "徒歩"
 *   - 自転車 / チャリ → "自転車"
 *   - 車 / クルマ / タクシー / Uber → "車"
 *   - バス → "バス"
 *
 * caller 側で句読点 / 助詞を除去してから渡すこと。本関数は受け取った文字列
 * 全体が token に一致することのみを check する。
 */
export function parseTransportExact(token: string): string | null {
  const t = token.normalize("NFKC");
  if (/^(電車|地下鉄|JR|私鉄)$/i.test(t)) return "電車";
  if (/^(徒歩|歩き|歩いて)$/.test(t)) return "徒歩";
  if (/^(自転車|チャリ)$/.test(t)) return "自転車";
  if (/^(車|クルマ|タクシー|Uber)$/i.test(t)) return "車";
  if (/^バス$/.test(t)) return "バス";
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W3-PR-8: undecided 語彙（where answer として受け入れない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO 指示 2026-04-22: 「決めてない」「任せる」「おすすめで」等の未決意表明を
// where answer として bind してはならない（震源 3）。
// これらは semantic_miss として扱い、pendingClarify を維持する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 未決意表明語彙。where answer への bind 前に検査する。
 * whereVagueClassifier の UNDECIDED_VOCAB を拡張（return 表現含む）。
 */
const UNDECIDED_WHERE_ANSWER: ReadonlySet<string> = new Set([
  "決めてない",
  "決まってない",
  "まだ",
  "未定",
  "どこでもいい",
  "どこでも",
  "どこか",
  "わからない",
  "わかんない",
  "たぶん",
  "おすすめで",
  "おすすめ",
  "任せる",
  "まかせる",
]);

/**
 * answer が where slot に対して undecided 語彙かどうか。
 *
 * 判定:
 *   1. trim + 末尾句読点/感嘆符を削って完全一致
 *   2. 先頭一致: "どこでもいいよ" "任せるよ" のような助詞付きも拾う
 *
 * 語尾助詞揺れを許容しすぎると固有名詞まで拾うので、
 * 先頭一致は UNDECIDED_WHERE_ANSWER 集合にあるトークンのみ対象。
 */
function isUndecidedWhereAnswer(answer: string): boolean {
  const trimmed = answer.trim().replace(/[。.！!？?\s]+$/, "");
  if (!trimmed) return false;
  if (UNDECIDED_WHERE_ANSWER.has(trimmed)) return true;
  for (const token of UNDECIDED_WHERE_ANSWER) {
    if (trimmed.startsWith(token)) return true;
  }
  return false;
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
      // W3-PR-8 震源 3 修復: undecided 語彙は bind 前に拒否する（CEO 2026-04-22）
      //   「決めてない」「任せる」「おすすめで」等を where answer として採用しない。
      //   pendingClarify を維持し、semanticMissCount は呼び出し側で inc される。
      if (isUndecidedWhereAnswer(answer)) {
        return { events, bound: false, reason: "semantic_miss" };
      }
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

  // ── W3-PR-8 invariant: 単一 event のみ更新されていること ──
  //   bind は対象 event 1 件だけに作用するはず。他 event に shallow reference
  //   を持つ map 操作等で破れていないかを保守的に検査する。
  //
  //   dev/test: 違反で throw
  //   prod: log のみ（UX 保全。既存 bind 動作を流用、会話は壊さない）
  const mutatedIndexes: number[] = [];
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== events[i]) mutatedIndexes.push(i);
  }
  if (mutatedIndexes.length !== 1 || mutatedIndexes[0] !== idx) {
    const msg = `answerBinder invariant violation: expected only events[${idx}] to mutate, got [${mutatedIndexes.join(",")}]`;
    if (process.env.NODE_ENV !== "production") {
      throw new Error(msg);
    }
    console.error(msg);
  }

  // ── W3-PR-8 bind 後 sharpness 再評価（captured vs resolved の分離、最小版）──
  //   bind 成功後も blockingForEvent が true のままなら「captured ≠ resolved」。
  //   例: where slot に「そのへん」と入れた場合、place_ref は埋まったが
  //        whereSharpness=vague のままで phase は依然 clarifying。
  //   PR-8 ではログ出力のみ。次 PR で Event schema に resolutionStatus 型を
  //   追加して capturedAsAnchor / resolvedAsFixed を区別する（設計書 §3.6）。
  if (blockingForEvent(next[idx])) {
    console.log(
      `[answerBinder] slot bound but still blocking (captured ≠ resolved): event=${next[idx].event_id} slot=${pending.slot}`,
    );
  }

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
