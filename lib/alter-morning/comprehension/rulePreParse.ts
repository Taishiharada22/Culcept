/**
 * L1.0 Rule Pre-Parse — Comprehension-First v1.3+ Wave 2
 *
 * 設計書: docs/alter-morning-comprehension-first-wave2-design.md §5
 *
 * 責務:
 *   L1.1 LLM の前段で、rule で確実に取れる情報のみを決定論的に抽出する。
 *   hint として L1.1 の prompt に渡す（LLM は override 可能、強制ではない）。
 *
 * Wave 2 スコープ（§5.4 最小 / CEO 承認済み）:
 *   1. 数字時刻 (`9時`, `09:00`, `9:30`, `14時30分`, `14:30`)
 *   2. 明示的起点 (`自宅から`, `ホテルから`, `家を出る`, `会社を出る`)
 *
 * 除外（Wave 3 以降で検討）:
 *   - 曖昧語（「朝」「サドヤ」等） — 誤爆リスク高い
 *   - 活動名 / place_ref — LLM の仕事
 *
 * 設計原則:
 *   - 保守的: 迷ったら抽出しない（false positive より取りこぼしを優先）
 *   - 純関数: 副作用なし、LLM 呼び出しなし
 *   - 出力は index 情報込み（prompt 構築時のハイライト用）
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ExtractedSpan<T = string> {
  /** 抽出した正規化済みの値（"09:00", "自宅" 等） */
  value: T;
  /** 発話から切り出した生文字列（"9時", "自宅から" 等） */
  span: string;
  /** utterance 内での開始 index */
  index: number;
}

export interface RulePreParseHints {
  /** 明示時刻（HH:mm 正規化済み） */
  explicit_times: ExtractedSpan<string>[];
  /** 明示起点（"自宅" / "ホテル" / "会社" / "実家" 等に正規化） */
  explicit_start_points: ExtractedSpan<string>[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時刻抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 対応パターン:
 *   - "9:00", "09:00", "9:30", "23:59"    — colon 形式
 *   - "9時", "14時", "9時半", "9時30分"    — 日本語形式
 *
 * 非対応（曖昧なので rule では取らない）:
 *   - "朝9時" の「朝」— LLM の仕事
 *   - "9時ごろ" の「ごろ」— LLM の仕事（certainty=tentative 判定）
 *   - 半角/全角数字のゆらぎ — NFKC で事前正規化
 */
const TIME_COLON_RE = /(\d{1,2}):(\d{2})/g;
const TIME_JP_HALF_RE = /(\d{1,2})時半/g;                   // 9時半 → 09:30
const TIME_JP_MINUTE_RE = /(\d{1,2})時(\d{1,2})分/g;         // 9時30分 → 09:30
const TIME_JP_HOUR_RE = /(\d{1,2})時(?!半|\d|分)/g;          // 9時 → 09:00（半/数字/分 が続かない）

function normHH(hh: number, mm: number): string | null {
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function extractExplicitTimes(utterance: string): ExtractedSpan<string>[] {
  if (!utterance) return [];
  // NFKC で半角/全角を統一してから match
  const normalized = utterance.normalize("NFKC");

  const results: ExtractedSpan<string>[] = [];
  const claimed: Array<{ start: number; end: number }> = [];

  function overlaps(start: number, end: number): boolean {
    return claimed.some((c) => !(end <= c.start || start >= c.end));
  }

  function claim(start: number, end: number) {
    claimed.push({ start, end });
  }

  // 優先順位: minute > half > hour > colon
  //   "9時30分" を先に食って "9時" が重ねて食わないように

  let m: RegExpExecArray | null;

  TIME_JP_MINUTE_RE.lastIndex = 0;
  while ((m = TIME_JP_MINUTE_RE.exec(normalized)) !== null) {
    const val = normHH(Number(m[1]), Number(m[2]));
    if (val && !overlaps(m.index, m.index + m[0].length)) {
      results.push({ value: val, span: m[0], index: m.index });
      claim(m.index, m.index + m[0].length);
    }
  }

  TIME_JP_HALF_RE.lastIndex = 0;
  while ((m = TIME_JP_HALF_RE.exec(normalized)) !== null) {
    const val = normHH(Number(m[1]), 30);
    if (val && !overlaps(m.index, m.index + m[0].length)) {
      results.push({ value: val, span: m[0], index: m.index });
      claim(m.index, m.index + m[0].length);
    }
  }

  TIME_JP_HOUR_RE.lastIndex = 0;
  while ((m = TIME_JP_HOUR_RE.exec(normalized)) !== null) {
    const val = normHH(Number(m[1]), 0);
    if (val && !overlaps(m.index, m.index + m[0].length)) {
      results.push({ value: val, span: m[0], index: m.index });
      claim(m.index, m.index + m[0].length);
    }
  }

  TIME_COLON_RE.lastIndex = 0;
  while ((m = TIME_COLON_RE.exec(normalized)) !== null) {
    const val = normHH(Number(m[1]), Number(m[2]));
    if (val && !overlaps(m.index, m.index + m[0].length)) {
      results.push({ value: val, span: m[0], index: m.index });
      claim(m.index, m.index + m[0].length);
    }
  }

  // index 昇順で返す
  return results.sort((a, b) => a.index - b.index);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 明示起点抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Wave 2 で扱う明示起点。known_base に限定（辞書拡張しない / Q-1=A）。
 *
 * パターン:
 *   - "〜から" 形式: "自宅から" / "ホテルから" / "会社から" / "実家から" / "オフィスから" / "家から"
 *   - "〜を出る" 形式: "家を出る" / "ホテルを出る" / "会社を出る"
 *
 * 正規化ラベル:
 *   - "自宅" / "家" → "自宅"
 *   - "ホテル" → "ホテル"
 *   - "会社" / "オフィス" → "会社"
 *   - "実家" → "実家"
 */
/**
 * 順序注意: 長い pattern を先に配置し、span claim で短い substring を抑制する。
 *   - "実家" を "家" より先に処理しないと、"実家から" で "家" が先にマッチして
 *     "自宅" に正規化されてしまう。
 *   - "オフィス" を "会社" より先に配置。
 */
const START_POINT_LABELS: Array<{ pattern: string; normalized: string }> = [
  { pattern: "オフィス", normalized: "会社" },
  { pattern: "ホテル", normalized: "ホテル" },
  { pattern: "自宅", normalized: "自宅" },
  { pattern: "実家", normalized: "実家" },
  { pattern: "会社", normalized: "会社" },
  { pattern: "家", normalized: "自宅" },
];

// "〜から" 形式
const FROM_SUFFIX_RE = /から/;
// "〜を出る" 形式（「出発」「出ます」「出よう」等も許容）
const DEPART_VERB_RE = /を(出|出発|でる|でます|出ます|出よう|でよう)/;

export function extractExplicitStartPoints(utterance: string): ExtractedSpan<string>[] {
  if (!utterance) return [];
  const normalized = utterance.normalize("NFKC");

  const results: ExtractedSpan<string>[] = [];
  const claimed: Array<{ start: number; end: number }> = [];

  function overlaps(start: number, end: number): boolean {
    return claimed.some((c) => !(end <= c.start || start >= c.end));
  }

  for (const { pattern, normalized: label } of START_POINT_LABELS) {
    let searchStart = 0;
    while (true) {
      const idx = normalized.indexOf(pattern, searchStart);
      if (idx === -1) break;
      const after = normalized.slice(idx + pattern.length);

      // "〜から" or "〜を出る" が続くか
      const fromMatch = FROM_SUFFIX_RE.exec(after);
      const departMatch = DEPART_VERB_RE.exec(after);

      let matchLen = 0;
      let matched = false;

      if (fromMatch && fromMatch.index === 0) {
        matchLen = pattern.length + fromMatch[0].length;
        matched = true;
      } else if (departMatch && departMatch.index === 0) {
        matchLen = pattern.length + departMatch[0].length;
        matched = true;
      }

      if (matched && !overlaps(idx, idx + matchLen)) {
        const span = normalized.slice(idx, idx + matchLen);
        results.push({ value: label, span, index: idx });
        claimed.push({ start: idx, end: idx + matchLen });
      }

      searchStart = idx + pattern.length;
    }
  }

  // 同一 label は「最も前に出た 1 件」のみ採用（重複抑制）
  const seen = new Set<string>();
  const dedup: ExtractedSpan<string>[] = [];
  for (const r of results.sort((a, b) => a.index - b.index)) {
    if (seen.has(r.value)) continue;
    seen.add(r.value);
    dedup.push(r);
  }
  return dedup;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主エントリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 発話を rule で pre-parse して hint を返す。
 * L1.1 prompt 構築時に注入する（LLM は override 可能、あくまで hint）。
 */
export function preParseUtterance(utterance: string): RulePreParseHints {
  return {
    explicit_times: extractExplicitTimes(utterance),
    explicit_start_points: extractExplicitStartPoints(utterance),
  };
}

/**
 * Hints を LLM prompt に差し込むための人間可読フォーマット。
 * L1.1 prompt 構築時に呼ぶ。
 */
export function formatHintsForPrompt(hints: RulePreParseHints): string {
  const lines: string[] = [];
  if (hints.explicit_times.length > 0) {
    lines.push(
      `- 明示時刻: ${hints.explicit_times.map((t) => t.value).join(", ")}`,
    );
  }
  if (hints.explicit_start_points.length > 0) {
    lines.push(
      `- 明示起点: ${hints.explicit_start_points.map((s) => s.value).join(", ")}`,
    );
  }
  if (lines.length === 0) return "";
  return [
    "前処理で以下の情報が抽出されました（参考情報）:",
    ...lines,
    "上記は rule で確実に取れた情報です。source_span に入れるときはこれらを優先してください。",
    "ただし、rule に無い情報も発話から自由に抽出してください。",
  ].join("\n");
}
