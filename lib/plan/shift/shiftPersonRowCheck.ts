/**
 * 本人行 cross-check（pure・golden-free）— SR A2A（VLM 抽出精度トラック）
 *
 * 役割: VLM が返した行ラベル（rowLabel・読み取った人名）を、期待する本人ラベル（ownerLabel・
 *   辞書由来「原田 大志」等）と緩く突き合わせ、**本人行を取り違えていないか**を判定する。
 *
 * 設計核心（CEO 補正・2026-06-05）:
 *   - band を隣接行にずらすと「隣の人のシフト」を本人として silent に抽出する（F7）。
 *     rowLabel を照合して「本人行が怪しい」を **保存前の高優先 warning** として出す。
 *   - **最初は hard block しない**（rowLabel 自体も VLM 由来 → いきなり block は false-block リスク）。
 *     mismatch = high-priority warning まで。hard 化は smoke 後の CEO 判断。
 *   - 一致判定は既存 `filterByPersonRow`（空白除去後の包含）と整合させ、さらに NFKC で
 *     全角/半角差も吸収する（CEO: 全角/半角/空白差を normalize して一致扱い）。
 *
 * 不変原則: pure（IO / LLM / DB / Date / random / env なし）・**throw しない**・deterministic。
 *   ※ 本 module は **判定のみ**。rowLabel の経路接続（VLM 出力→review への持ち回り）・UI 表示は別ステップ。
 */

/** 本人行の照合結果。 */
export type PersonRowStatus = "match" | "missing" | "mismatch";

/** A2A の重大度（**block は常に false**。hard 化は smoke 後 CEO 判断）。 */
export type PersonRowSeverity = "none" | "note" | "warning";

export interface PersonRowCheckResult {
  status: PersonRowStatus;
  /** none=一致 / note=rowLabel 欠落（低優先・止めない）/ warning=不一致（高優先・止めない）。 */
  severity: PersonRowSeverity;
  /** A2A は決して保存を hard block しない（false 固定）。 */
  block: false;
  /** 比較に使った正規化後の owner（全角/半角/空白を吸収）。 */
  ownerNormalized: string;
  /** 比較に使った正規化後の row。 */
  rowNormalized: string;
  /** needs_review トーンの safe copy。 */
  message: string;
}

/**
 * 人名ラベルを正規化する（pure・throw しない）。
 *   - NFKC で 全角英数字/記号 → 半角・全角スペース(U+3000) → 半角スペース化。
 *   - 続けて **全空白を除去**（既存 filterByPersonRow と整合: "原田 大志" / "原田大志" / "原田　大志" を同一化）。
 *   - 非 string は ""。
 */
export function normalizePersonLabel(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.normalize("NFKC").replace(/\s+/g, "");
}

/**
 * rowLabel（VLM が読んだ人名）を ownerLabel（期待する本人）と照合する（pure）。
 *   - rowLabel 空/欠落 → status="missing"・severity="note"（低優先・**止めない**）。
 *   - 正規化後に包含一致（row が owner を含む = 既存 filterByPersonRow と同方向）→ status="match"。
 *   - それ以外 → status="mismatch"・severity="warning"（高優先・**止めない**＝保存前に強い確認）。
 * 一切 throw しない。block は常に false。
 */
export function crossCheckRowLabel(input: {
  ownerLabel: unknown;
  rowLabel: unknown;
}): PersonRowCheckResult {
  const ownerNormalized = normalizePersonLabel(input?.ownerLabel);
  const rowNormalized = normalizePersonLabel(input?.rowLabel);

  if (rowNormalized === "") {
    return {
      status: "missing",
      severity: "note",
      block: false,
      ownerNormalized,
      rowNormalized,
      message:
        "読み取った行に人名がありません。本人の行を読み取れているか原稿で確認してください。",
    };
  }

  // 既存 filterByPersonRow（row.includes(owner)）と同方向の包含一致。
  const match = ownerNormalized !== "" && rowNormalized.includes(ownerNormalized);
  if (match) {
    return {
      status: "match",
      severity: "none",
      block: false,
      ownerNormalized,
      rowNormalized,
      message: "読み取った行は本人の行と一致しています。",
    };
  }

  const rowRaw = typeof input?.rowLabel === "string" ? input.rowLabel : "";
  const ownerRaw = typeof input?.ownerLabel === "string" ? input.ownerLabel : "";
  return {
    status: "mismatch",
    severity: "warning",
    block: false,
    ownerNormalized,
    rowNormalized,
    message: `読み取った行「${rowRaw}」が本人「${ownerRaw}」と一致しません。別の人の行を読み取っている可能性があります。保存前に確認してください。`,
  };
}
