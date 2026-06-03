/**
 * シフト表 VLM 抽出 — プロンプト builder（pure）
 *
 * 設計書: docs/alter-plan-shift-import-contract-and-day-indicator-design.md §2
 *
 * VLM = parser。意味解釈させず、本人行の rawCode を「書いてあるまま」読ませる。
 * 実際の VLM 呼び出しは別（B1・CEO gate）。本モジュールは指示文と schema を組むだけ。
 */

export interface ShiftExtractionPromptParams {
  /** 本人名（この行だけ抽出させる） */
  personName: string;
  /** 西暦 */
  year: number;
  /** 月（1-12） */
  month: number;
  /** その月の日数（28-31） */
  daysInMonth: number;
  /** 任意: 既知コード一覧（凡例。読み取りの参照に渡すが意味判定はさせない） */
  knownCodes?: string[];
}

/**
 * 抽出指示文を組む。VLM には「rawCode をそのまま読む」だけを厳命する。
 */
export function buildShiftExtractionPrompt(
  params: ShiftExtractionPromptParams
): string {
  const { personName, year, month, daysInMonth, knownCodes } = params;
  const ym = `${year}-${String(month).padStart(2, "0")}`;

  const lines: string[] = [
    "あなたはシフト表（勤務表）の画像を読み取る抽出器です。意味の解釈はせず、書いてある記号を正確に読むことだけが仕事です。",
    "",
    `# 対象`,
    `- 人物: 「${personName}」の行のみを抽出してください（他の人の行は無視）。`,
    `- 期間: ${ym}（${daysInMonth}日まで）。日付列は 1 から ${daysInMonth} です。`,
    "",
    `# ルール`,
    `- 各日について、セルに書かれた記号（rawCode）を**そのまま**読み取ってください。略号の意味（休み/勤務など）は判定しないでください。`,
    `- 例: "E-18" を "E" に縮めない。"HREQ" を "H" にしない。大文字小文字・ハイフンも原文どおり。`,
    `- 空セル（何も書かれていない）は rawCode を空文字 "" にしてください。`,
    `- セルの塗り色があれば colorHint に色名（例: "green", "blue", "pink", "white"）を入れてください。`,
    `- 読み取り信頼度を confidence（0.0〜1.0）で添えてください。曖昧なセルは低めに。`,
    `- rowLabel には読み取った人物名をそのまま入れてください（本人照合用）。`,
  ];

  if (knownCodes && knownCodes.length > 0) {
    lines.push(
      "",
      `# 参考（凡例に存在する記号。ただし意味判定はせず、読み取りの参考のみ）`,
      `- ${knownCodes.join(" / ")}`
    );
  }

  lines.push(
    "",
    `# 出力`,
    `- JSON 配列のみ。各要素は {"date":"${ym}-01" 形式, "rawCode":"...", "rowLabel":"...", "colorHint":"...", "confidence":0.0} 。`,
    `- ${daysInMonth} 日分すべて（空セルも "" で）出力してください。`,
    `- JSON 以外の説明文は出力しないでください。`
  );

  return lines.join("\n");
}

/**
 * structured output 用の JSON schema（B1 で VLM に grammar 制約として渡す）。
 * Anthropic Structured Outputs（2025-11 GA）でセル配列を強制する。
 */
export const SHIFT_EXTRACTION_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      date: { type: "string", description: "YYYY-MM-DD" },
      rawCode: { type: "string", description: "原文の記号。空セルは空文字" },
      rowLabel: { type: "string" },
      colorHint: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["date", "rawCode", "rowLabel"],
    additionalProperties: false,
  },
} as const;

// ─────────────────────────────────────────────────────────────
// B1a-v2: day-keyed（列アンカー）プロンプト
//
// B1a 第1走の +1 列シフト対策。配列順でなく「印字日番号」に紐づけて読ませる。
// ─────────────────────────────────────────────────────────────

export interface DayKeyedExtractionPromptParams
  extends ShiftExtractionPromptParams {
  /** 任意: chunk 対象の日範囲 [from, to]（指定時はこの範囲のみ出力） */
  dayRange?: [number, number];
}

/**
 * day-keyed 抽出指示文。各セルをヘッダの印字日番号にアンカーさせる。
 */
export function buildDayKeyedExtractionPrompt(
  params: DayKeyedExtractionPromptParams
): string {
  const { personName, year, month, daysInMonth, knownCodes, dayRange } = params;
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const from = dayRange ? dayRange[0] : 1;
  const to = dayRange ? dayRange[1] : daysInMonth;

  const lines: string[] = [
    "あなたはシフト表（勤務表）の画像を読み取る抽出器です。意味の解釈はせず、書いてある記号を正確に読むことだけが仕事です。",
    "",
    `# 対象`,
    `- 人物: 「${personName}」の行のみ（他の人の行は無視）。`,
    `- 期間: ${ym}。対象は ${from}日〜${to}日。`,
    "",
    `# 列アンカー（最重要）`,
    `- 表の一番上の行に印字された「日番号(1〜${daysInMonth})」を必ず読み、各セルをその**日番号に紐づけて**出力してください。`,
    `- **配列の順番や位置で日付を推測しないでください**。必ずヘッダの印字番号と照合する。`,
    `- ${from}日から${to}日まで、**1日も飛ばさず重複させず**、各日ちょうど1件ずつ出力してください。`,
    `- ある列の日番号が読み取れない場合は、その日の confidence を下げてください。`,
    "",
    `# 記号ルール`,
    `- セルの記号(rawCode)を**そのまま**読む。意味(休み/勤務)は判定しない。`,
    `- "E-18" を "E" に縮めない。"HREQ" を "H" にしない。大文字小文字・ハイフンも原文どおり。`,
    `- 読み取り信頼度 confidence(0.0〜1.0) を添える。`,
    `- rowLabel には読み取った人物名をそのまま入れる。`,
    "",
    `# 空セルの扱い（最重要・絶対厳守）`,
    `- その日番号の真下のセルが**空（何も書かれていない）なら rawCode を空文字 "" に**してください。`,
    `- **空の日があるのは正常**です（その日は勤務が割り当てられていないだけ）。無理にコードを入れないでください。`,
    `- **空セルを隣の日の値で埋めないでください**。各日のコードは、その日番号の真下のセル「だけ」から読む。`,
    `- 空セルを飛ばして次以降を前に詰める読み方は**禁止**。空の日も飛ばさず "" で必ず1件出力してください。`,
  ];

  if (knownCodes && knownCodes.length > 0) {
    lines.push(
      "",
      `# 参考（凡例の記号。意味判定はせず読み取りの参考のみ）`,
      `- ${knownCodes.join(" / ")}`
    );
  }

  lines.push(
    "",
    `# 出力`,
    `- JSON 配列のみ。各要素は {"day": 整数(${from}-${to}), "rawCode": "...", "rowLabel": "...", "confidence": 0.0}。`,
    `- ${from}日〜${to}日の全日（${to - from + 1}件）を出力。`,
    `- JSON 以外の説明文は出力しない。`
  );

  return lines.join("\n");
}

/** day-keyed structured output schema */
export const DAY_KEYED_EXTRACTION_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      day: { type: "integer", description: "ヘッダの印字日番号" },
      rawCode: { type: "string", description: "原文の記号。空セルは空文字" },
      rowLabel: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["day", "rawCode", "rowLabel"],
    additionalProperties: false,
  },
} as const;
