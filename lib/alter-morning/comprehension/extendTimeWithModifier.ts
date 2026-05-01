/**
 * extendTimeWithModifier — PR A Commit 2 (CEO 2026-05-02)
 *
 * Goal:
 *   extractExplicitTimes (rulePreParse) は「N時」 を 24h N:00 形式で返すが、
 *   「午後3時」 のような prefix を考慮しないため「午後3時」 → "03:00" となる。
 *   本 helper は時刻 span の直前に「午後/夜/晩」 prefix がある場合に +12 補正する。
 *
 * 不変条件:
 *   - 入力 timeSpans は extractExplicitTimes の戻り値 (immutable, value=HH:MM, index 込み)
 *   - 各 span に対して utterance.slice(0, span.index) の末尾に「午後/夜/晩」 があるか check
 *   - hit AND 入力時の hour ∈ [1, 11] のみ +12 (午後12 は noon、加算しない)
 *   - 既に 13-23 の場合は変換しない (24h format respect)
 *   - 「朝」 prefix は変換不要 (元の値維持)
 *
 * scope (PR A 限定):
 *   - 単一の prefix-時刻ペアのみ
 *   - utterance 全体の時刻表現を扱うわけではない (詳細は extractExplicitTimes が責務)
 */

import type { ExtractedSpan } from "./rulePreParse";

const PM_PREFIX_RE = /(午後|夜|晩)$/;

export function extendTimeWithModifier(
  utterance: string,
  timeSpans: ReadonlyArray<ExtractedSpan<string>>,
): ExtractedSpan<string>[] {
  if (timeSpans.length === 0) return [];

  const normalized = utterance.normalize("NFKC");
  const result: ExtractedSpan<string>[] = [];

  for (const ts of timeSpans) {
    const before = normalized.slice(0, ts.index);
    const pmMatch = PM_PREFIX_RE.exec(before);
    if (!pmMatch) {
      // prefix なし → そのまま
      result.push(ts);
      continue;
    }

    // ts.value は "HH:MM" 形式
    const parts = ts.value.split(":");
    if (parts.length !== 2) {
      result.push(ts); // defensive
      continue;
    }
    const hh = Number(parts[0]);
    const mm = parts[1];
    if (!Number.isFinite(hh)) {
      result.push(ts);
      continue;
    }

    // 1-11 のみ +12 (午後12 は noon、12 のまま)
    // 13-23 は既に午後 → 変換しない
    let newHh = hh;
    if (hh >= 1 && hh <= 11) {
      newHh = hh + 12;
    }
    // hh === 12 → 12:MM のまま (午後12時 = noon)
    // hh === 0 → 0:MM のまま (deepest night、PM 加算しない)

    const newValue = `${String(newHh).padStart(2, "0")}:${mm}`;
    result.push({
      value: newValue,
      span: ts.span,
      index: ts.index,
    });
  }

  return result;
}
