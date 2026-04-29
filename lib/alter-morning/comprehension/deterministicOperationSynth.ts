/**
 * Deterministic Operation Synthesizer — PR-50 Commit 7 (CEO 2026-04-30)
 *
 * Goal:
 *   LLM 出力に依存せず、**utterance pattern が明確な発話** を deterministic に
 *   PlanOperation に変換する synth 層。
 *
 * 設計原則 (CEO 確定 2026-04-30):
 *   - **deterministic pattern hit > LLM 出力**:
 *       「9時を10時に変更」「電車」「徒歩」「車」 等の意味が一意な発話は
 *       LLM の判断に任せず、コード側で modify operation を生成する。
 *       LLM が同じ turn で append 等を出していても **deterministic を優先**
 *       (LLM の append duplicate を排除する)。
 *
 *   - **責務分離**:
 *       synth = 意味の補正 / 変換
 *       validation = 構造の検証
 *       dispatch = 適用
 *       本ファイルは synth 層のみ。validation / dispatch には触らない。
 *
 * Commit 7 (本ファイル初版): utterance pattern → deterministic operations
 * Commit 8 (将来追加): LLM operations inspector (transport-only duplicate
 *   append → modify 変換)。本 commit では実装しない。Layer 2 が hit しない turn は
 *   LLM operations をそのまま採用する。
 *
 * scope (CEO 限定 2026-04-30):
 *   - 時刻変更 (「N時を M時に変更」「N時にして」 等)
 *   - transport-only (「電車」「徒歩」「車」 等の単独発話)
 *
 * scope 外 (将来 PR):
 *   - 場所変更 (「サドヤから新宿に」)
 *   - 削除 / キャンセル (「ランチをキャンセル」)
 */

import type { Event } from "./eventSchema";
import type { PlanOperation } from "./planOperation";
import { parseTransportExact } from "./answerBinder";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 公開 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SynthesisContext {
  utterance: string;
  priorEvents: Event[];
  /** LLM が parsePlanOperations 後に出した operations (空 OK) */
  llmOperations: PlanOperation[];
}

export type SynthesisSource =
  | "llm"
  | "llm_transformed"
  | "deterministic"
  | "deterministic_overrides_llm"
  | "none";

export interface SynthesisResult {
  /** 確定された最終 operations (validation 直前のもの) */
  operations: PlanOperation[];
  /** どこから来たか (trace 用) */
  synthesisSource: SynthesisSource;
}

/**
 * synth 層メイン entry (Commit 7 段階)。
 *
 * 優先順位:
 *   1. utterance pattern hit (deterministic) → LLM ops を上書きして採用
 *   2. LLM operations 非空 → そのまま採用 (Commit 8 で transform 機能追加予定)
 *   3. operations なし (none)
 */
export function synthesizeOperations(ctx: SynthesisContext): SynthesisResult {
  // Layer 1: utterance pattern detector (Commit 7 主体)
  const detPatterns = detectDeterministicPatterns(ctx.utterance, ctx.priorEvents);
  if (detPatterns.length > 0) {
    return {
      operations: detPatterns,
      synthesisSource:
        ctx.llmOperations.length > 0
          ? "deterministic_overrides_llm"
          : "deterministic",
    };
  }

  // Layer 2: LLM operations は Commit 8 で inspect & transform を追加予定。
  //   Commit 7 段階では LLM が出した operations をそのまま採用 (= 既存挙動維持)。
  if (ctx.llmOperations.length > 0) {
    return { operations: ctx.llmOperations, synthesisSource: "llm" };
  }

  // 何も無い
  return { operations: [], synthesisSource: "none" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1: utterance pattern detector (Commit 7)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * utterance + priorEvents から deterministic operations を生成する。
 *
 * 検出する pattern:
 *   1. 時刻変更: 「N時を M時に変更」「N:MM を M:MM に」 等の明示的な置換
 *   2. transport-only: utterance 全体が transport token (+ 軽微な助詞) のみ
 *
 * priorEvents が空の場合は空配列を返す (modify 対象がない)。
 */
export function detectDeterministicPatterns(
  utterance: string,
  priorEvents: Event[],
): PlanOperation[] {
  if (priorEvents.length === 0) return [];

  const out: PlanOperation[] = [];

  // 1. 時刻変更 pattern
  const timeChange = detectTimeChange(utterance);
  if (timeChange) {
    out.push({
      type: "modify",
      // targetRef は「N時の予定」 形式。resolveTargetRef + single_event_fallback
      // で解決される。
      targetRef: `${timeChange.fromLabel}の予定`,
      patch: {
        when: {
          startTime: timeChange.toTime,
          endTime: null,
          timeHint: null,
        },
      },
    });
  }

  // 2. transport-only pattern
  const transport = detectTransportOnly(utterance);
  if (transport) {
    out.push({
      type: "modify",
      // targetRef「今日の予定」 は固有 keyword ではないので resolveTargetRef は
      // 失敗する見込み。priorEvents.length === 1 なら single_event_fallback で
      // 解決、複数なら全 prior に対して transport を一斉 patch する想定だが、
      // applyModifyPatchFromOperation は単一 event を返すため、複数 prior に対する
      // 一斉適用は別 PR の課題。Commit 7 段階では single_event_fallback を期待。
      targetRef: "今日の予定",
      patch: { transport },
    });
  }

  return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern: 時刻変更
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TimeChangeMatch {
  /** prior 解決用ラベル (例: "9時") */
  fromLabel: string;
  /** patch 値 (HH:mm) */
  toTime: string;
}

/**
 * 時刻変更 pattern を utterance から抽出。
 *
 * 認識する形式 (明示的なもののみ):
 *   - 「N時を M時に変更」「N時を M時に」 「N時を M時にして」 「N時を M時にずらす」
 *   - 「N:MM を M:MM に」
 *   - 「N時 → M時」「N:MM → M:MM」
 *
 * 認識しない (false positive 防止):
 *   - 「N時から M時まで」 (期間表現)
 *   - 「N時の予定」 (参照のみ)
 *   - 「M時にして」 単独 (from が不明)
 */
function detectTimeChange(utterance: string): TimeChangeMatch | null {
  const u = utterance.normalize("NFKC").trim();
  if (!u) return null;

  // パターン 1: "N時(から|を) M時(に|まで).*(変更|変える|ずらす|して|にする)"
  //   ただし "から〜まで" は期間表現として除外するため別 regex で先に弾く
  if (/(\d{1,2})時(から|〜)(\d{1,2})時(まで)/.test(u)) {
    return null; // 期間表現
  }

  // hour-only: 「9時を10時に」
  const hourMatch = u.match(
    /(\d{1,2})時を(\d{1,2})時(に|へ)(?:変更|変える|ずらす|して|にする|に変更)?/,
  );
  if (hourMatch) {
    const fromHour = parseInt(hourMatch[1], 10);
    const toHour = parseInt(hourMatch[2], 10);
    if (isValidHour(fromHour) && isValidHour(toHour)) {
      return {
        fromLabel: `${fromHour}時`,
        toTime: formatHHmm(toHour, 0),
      };
    }
  }

  // hh:mm: 「9:00 を 10:00 に」
  const hhmmMatch = u.match(
    /(\d{1,2}):(\d{2})を(\d{1,2}):(\d{2})(に|へ)(?:変更|変える|ずらす|して|にする)?/,
  );
  if (hhmmMatch) {
    const fromH = parseInt(hhmmMatch[1], 10);
    const fromM = parseInt(hhmmMatch[2], 10);
    const toH = parseInt(hhmmMatch[3], 10);
    const toM = parseInt(hhmmMatch[4], 10);
    if (
      isValidHour(fromH) &&
      isValidMinute(fromM) &&
      isValidHour(toH) &&
      isValidMinute(toM)
    ) {
      return {
        fromLabel: formatHHmm(fromH, fromM),
        toTime: formatHHmm(toH, toM),
      };
    }
  }

  // 矢印 hour-only: 「9時 → 10時」
  const arrowHourMatch = u.match(/(\d{1,2})時\s*[→⇒]\s*(\d{1,2})時/);
  if (arrowHourMatch) {
    const fromHour = parseInt(arrowHourMatch[1], 10);
    const toHour = parseInt(arrowHourMatch[2], 10);
    if (isValidHour(fromHour) && isValidHour(toHour)) {
      return {
        fromLabel: `${fromHour}時`,
        toTime: formatHHmm(toHour, 0),
      };
    }
  }

  return null;
}

function isValidHour(h: number): boolean {
  return Number.isInteger(h) && h >= 0 && h <= 23;
}

function isValidMinute(m: number): boolean {
  return Number.isInteger(m) && m >= 0 && m <= 59;
}

function formatHHmm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern: transport-only
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * utterance 全体が transport token (+ 軽微な助詞 / 句読点) のみかを判定。
 *
 * 認識する例 (CEO 限定 scope 2026-04-30):
 *   - 「電車」「徒歩」「車」「バス」「自転車」「タクシー」 単独
 *   - 「電車に変更」 (transport + 変更宣言)
 *   - 「徒歩で」 (助詞付き、ただし他の語を含まない)
 *
 * 認識しない (false positive 防止):
 *   - 「電車で行く」 (動詞含む)
 *   - 「9時に電車」 (時刻含む)
 *   - 「電車と徒歩」 (複数 transport)
 *
 * 判定ロジック:
 *   1. utterance を NFKC 正規化 + trim
 *   2. 句読点 / 「に変更」「で」 等の軽微な助詞 / 修飾語を除去して core を抽出
 *   3. core が transport vocabulary に **完全一致** (parseTransportExact) する
 *      ことを確認 (contains-based の parseTransport は false positive)
 *
 * 戻り値: transport vocabulary 正規化後の値 (parseTransportExact の戻り値)。
 */
function detectTransportOnly(utterance: string): string | null {
  const u = utterance.normalize("NFKC").trim();
  if (!u) return null;

  // 句読点 / 助詞 / 「に変更」 等の軽微な修飾語を除去して core token を取り出す
  const core = u
    .replace(/[。.！!？?、,\s]+/g, "")
    .replace(/に変更$/, "")
    .replace(/に変える$/, "")
    .replace(/にする$/, "")
    .replace(/に$/, "")
    .replace(/で$/, "");
  if (!core) return null;

  // 完全一致 check: core 全体が transport vocabulary に等しい
  return parseTransportExact(core);
}

// Layer 2 (LLM operations inspector) は Commit 8 で本ファイルに追加予定。
