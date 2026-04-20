/**
 * CoAlter M1 Candidate 2 — Stage 1 narration prefix builder
 *
 * ─────────────────────────────────────────────────────────────────────────
 * [CEO lock 2026-04-20 M1 C2]
 *   - proposalCard.summary / card.summary の **先頭に 1 行だけ** 付ける narrative。
 *   - 入力は Stage1Snapshot。outcome === "failed" のときは必ず null を返す
 *     （=「今日」を示唆しない）。
 *   - mode は TodayMode の 5 値に 1:1 対応。未知 mode は null を返す (fail-closed)。
 *   - implicitIntent は `modeLine + " — " + intent` の形で suffix として任意付与。
 *     UI 側の折返しを考慮して intent は 40 字を超える場合は付けない
 *     （原文を truncate しない = 事実改変しない方針）。
 *   - 副作用なし・pure。invoke route / test から同形で呼べる。
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Stage1Snapshot } from "./types";
import type { TodayMode } from "./understanding/types";

/** TodayMode → narrative 1 行（日本語）。mode を外から追加したときは必ずここに追記する。 */
const MODE_LINE: Record<TodayMode, string> = {
  recover: "今日はペース抑えめの流れ。",
  celebrate: "今日は気分を少し膨らませたい流れ。",
  connect: "今日は近づく時間を優先したい流れ。",
  challenge: "今日は少し踏み込みたい流れ。",
  maintain: "今日は平常運転の流れ。",
};

/** implicitIntent を suffix として付けるかの上限字数（超えたら mode line だけで止める）。 */
const INTENT_MAX_CHARS = 40;

/**
 * Stage1Snapshot から narration 先頭行を組む。
 *
 * 返り値:
 *   - null: failed / mode 欠損 / 未知 mode → 何も付けない（CEO lock）
 *   - string: 1 行。trailing 改行は呼び元が付ける。
 */
export function buildStage1Prefix(stage1: Stage1Snapshot | undefined): string | null {
  if (!stage1) return null;
  if (stage1.outcome === "failed") return null;

  const mode = stage1.todayReading?.mode;
  if (!mode) return null;
  const line = MODE_LINE[mode];
  if (!line) return null;

  const intent = stage1.todayReading.implicitIntent?.trim() ?? "";
  if (intent.length === 0) return line;
  if (intent.length > INTENT_MAX_CHARS) return line;
  return `${line} — ${intent}`;
}

/**
 * 既存 summary に narration を前置したものを返す。
 * prefix が null のときは元の summary をそのまま返す（mutation しない）。
 */
export function prependStage1Prefix(
  summary: string,
  stage1: Stage1Snapshot | undefined,
): string {
  const prefix = buildStage1Prefix(stage1);
  if (!prefix) return summary;
  return `${prefix}\n${summary}`;
}
