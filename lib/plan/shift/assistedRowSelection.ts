/**
 * Assisted row selection — pure 座標 model（SR B1b-2C-1）
 *
 * 役割: full画像上で「日付ヘッダ帯（headerBand）」と「本人行帯（personRowBand）」を
 *   ユーザーが指定する UX の、UI 非依存の座標契約・validation・正規化・crop region 計算・
 *   localStorage key/payload 規約を提供する。
 *
 * 設計核心（CEO 補正・2026-05-31）:
 *   - 画像本体（Blob/base64/dataURI/raw bytes）は contract に**含めない**（型で構造的に禁止）。
 *     localStorage に置くのは座標 trace + 軽 metadata のみ:
 *       imageFingerprint / imageW / imageH / headerBand top,bottom /
 *       personRowBand top,bottom / updatedAt。
 *   - **headerBand は contract 上必須**（day-keyed 抽出の生命線）。初期値は自動推定可だが、
 *     最終的にユーザーが明示確認する前提で、両 band の validation を CTA gate に使う。
 *   - 自動セル分割はしない（列方向は VLM に委ねる・B1b-1R2 教訓）。本 phase は y 方向のみ扱う。
 *
 * 不変原則: pure（IO / LLM / DB / canvas / DOM / Date / random / env / Web Crypto なし）。
 *   throw しない（validation は明示的な ok/issue 形式で返す）。
 *
 * 参考: B1b-1R2 で観測したテンプレ寸法（1860x846）。本 model は寸法を hardcode しない。
 */

/** 縦方向の帯（画像座標、px）。top < bottom。 */
export interface BandY {
  top: number;
  bottom: number;
}

/** 帯の妥当性（band 単独・画像高さ依存）。 */
export interface BandIssue {
  field: "top" | "bottom" | "order" | "bounds" | "height";
  message: string;
}

/**
 * day列中心 X（S-geo-2・案A-1）。day1 と月末日の **ヘッダ列中心** の x（px）。
 * **画像本体ではない座標のみ**（buildShiftGridGeometry が gridLeft/colWidth を逆算する入力）。
 */
export interface DayColumns {
  firstDayCenterX: number;
  lastDayCenterX: number;
}

/**
 * グリッド校正（S-geo・全列オーバーレイで人間が合わせ込んだ最終 geometry の X 成分）。
 * **座標値のみ**（画像本体・base64・dataURI 等は型で構造的に含まない）。
 * `imageW/imageH/dayCount` は**適用時の誤適用防止コンテキスト**: 校正時とは違う画像・違う月日数に
 * 誤って再利用しないよう、resolve 時に現コンテキストと一致する場合だけ採用する。
 */
export interface GridCalibration {
  /** 校正後の day1 セル左端 x(px)。 */
  gridLeft: number;
  /** 校正後の 1 列幅(px)。> 0。 */
  colWidth: number;
  /** 由来。全列オーバーレイの手動合わせ込み。 */
  source: "manual_overlay";
  /** 校正時の元画像 px 幅（現画像と不一致なら無視）。 */
  imageW: number;
  /** 校正時の元画像 px 高（現画像と不一致なら無視）。 */
  imageH: number;
  /** 校正時の対象月日数（現 dayCount と不一致なら無視）。 */
  dayCount: number;
  /** 任意: ISO 文字列。**pure module は生成しない**（UI 側が後段で渡す）。 */
  calibratedAt?: string;
}

/**
 * 1 画像分の assisted row selection。
 * **画像本体（Blob/base64/dataURI 等）は含まない**（型で構造的に禁止）。
 */
export interface AssistedRowSelection {
  /** 元画像 px 幅 */
  imageW: number;
  /** 元画像 px 高さ */
  imageH: number;
  /** 日付ヘッダ帯（contract 上必須）。 */
  headerBand: BandY;
  /** 本人行帯（contract 上必須）。 */
  personRowBand: BandY;
  /** 任意: day列中心 X（S-geo-2・案A-1）。座標のみ・画像本体非依存。 */
  dayColumns?: DayColumns;
  /** 任意: グリッド校正（全列オーバーレイの最終 geometry X 成分）。座標のみ・誤適用防止コンテキスト付き。 */
  gridCalibration?: GridCalibration;
  /** 任意: pure FNV-1a 32bit ハッシュ（画像 byte 不要・size+wh+optional fingerprint をキー化する用途）。 */
  imageFingerprint?: string;
  /** 任意: ISO 文字列。記録時に外部から渡す（pure module は now を生成しない）。 */
  updatedAt?: string;
}

/** localStorage に置く payload（画像本体を含まないことを型で保証）。 */
export interface AssistedRowSelectionStored {
  imageFingerprint: string;
  imageW: number;
  imageH: number;
  headerBand: BandY;
  personRowBand: BandY;
  /** 任意: day列中心 X（座標のみ・S-geo-2）。 */
  dayColumns?: DayColumns;
  /** 任意: グリッド校正（座標 + 誤適用防止コンテキストのみ・S-geo persist）。 */
  gridCalibration?: GridCalibration;
  updatedAt: string;
}

/** 全体検証結果。両 band が valid なら ok。 */
export interface SelectionValidation {
  ok: boolean;
  /** CTA active 可（=両 band が valid）。 */
  ctaActive: boolean;
  headerIssues: BandIssue[];
  personRowIssues: BandIssue[];
  /** band 同士の関係（推奨: header は person row より上） */
  orderingIssue: BandIssue | null;
}

/** band 既定（自動推定）に使う比率定数 */
export const DEFAULT_PERSON_ROW_RATIO = 0.06; // 画像高さの 6%
export const DEFAULT_HEADER_RATIO = 0.05; // 同 5%
export const DEFAULT_HEADER_OFFSET_RATIO = 0.005; // person row 上 0.5%

/** Band が単独で valid か。bounds は画像高さ依存。 */
export function validateBand(band: BandY, imageH: number): BandIssue[] {
  const issues: BandIssue[] = [];
  if (!Number.isFinite(band.top))
    issues.push({ field: "top", message: "top is not a finite number" });
  if (!Number.isFinite(band.bottom))
    issues.push({ field: "bottom", message: "bottom is not a finite number" });
  if (issues.length) return issues;
  if (band.top >= band.bottom)
    issues.push({ field: "order", message: "top must be < bottom" });
  if (band.top < 0 || band.bottom > imageH)
    issues.push({
      field: "bounds",
      message: "band must lie within [0, imageH]",
    });
  if (band.bottom - band.top < 4)
    issues.push({ field: "height", message: "band height must be >= 4px" });
  return issues;
}

/** Selection 全体の validation（両 band 必須 + 並び順チェック）。 */
export function validateSelection(s: AssistedRowSelection): SelectionValidation {
  const headerIssues = validateBand(s.headerBand, s.imageH);
  const personRowIssues = validateBand(s.personRowBand, s.imageH);
  let orderingIssue: BandIssue | null = null;
  // header は person row より上（top<top）を推奨。重なりや逆順は ordering issue。
  if (!headerIssues.length && !personRowIssues.length) {
    if (s.headerBand.top >= s.personRowBand.top)
      orderingIssue = {
        field: "order",
        message: "headerBand must start above personRowBand",
      };
    else if (s.headerBand.bottom > s.personRowBand.top + 1)
      orderingIssue = {
        field: "order",
        message: "headerBand must not overlap personRowBand",
      };
  }
  const ok =
    !headerIssues.length && !personRowIssues.length && orderingIssue === null;
  return { ok, ctaActive: ok, headerIssues, personRowIssues, orderingIssue };
}

// ─────────────────────────────────────────────────────────────
// day列中心 X validation（S-geo-2・案A-1）
// ─────────────────────────────────────────────────────────────

/** day列中心 X の妥当性（field + メッセージ）。 */
export interface DayColumnsIssue {
  field: "missing" | "firstDayCenterX" | "lastDayCenterX" | "order" | "span";
  message: string;
}

/** 2 点が「画像上の day列中心ペア」として近すぎない最小間隔(px)。 */
export const MIN_DAY_COLUMN_SPAN = 8;

/**
 * day列中心 X（day1中心 / 月末日中心）が画像上の 2 点として成立するか（pure）。
 * `dayCount` 依存の詳細（colWidth/gridLeft の妥当性）は buildShiftGridGeometry 側。
 * ここでは「2 点が finite・範囲 [0,imageW]・順序 first<last・最小間隔」だけを見る。
 */
export function validateDayColumns(
  dc: DayColumns | undefined,
  imageW: number
): DayColumnsIssue[] {
  const issues: DayColumnsIssue[] = [];
  if (!dc) {
    issues.push({ field: "missing", message: "day columns are not set" });
    return issues;
  }
  if (!Number.isFinite(dc.firstDayCenterX))
    issues.push({ field: "firstDayCenterX", message: "must be a finite number" });
  if (!Number.isFinite(dc.lastDayCenterX))
    issues.push({ field: "lastDayCenterX", message: "must be a finite number" });
  if (issues.length) return issues; // finite でなければ以降の比較をしない

  if (dc.firstDayCenterX < 0 || dc.firstDayCenterX > imageW)
    issues.push({ field: "firstDayCenterX", message: "must lie within [0, imageW]" });
  if (dc.lastDayCenterX < 0 || dc.lastDayCenterX > imageW)
    issues.push({ field: "lastDayCenterX", message: "must lie within [0, imageW]" });
  if (dc.firstDayCenterX >= dc.lastDayCenterX)
    issues.push({ field: "order", message: "firstDayCenterX must be < lastDayCenterX" });
  else if (dc.lastDayCenterX - dc.firstDayCenterX < MIN_DAY_COLUMN_SPAN)
    issues.push({ field: "span", message: "the two day-column centers are too close" });
  return issues;
}

// ─────────────────────────────────────────────────────────────
// グリッド校正 validation（S-geo persist・誤適用防止）
// ─────────────────────────────────────────────────────────────

/** 校正適用時の現コンテキスト（誤適用防止の照合先）。 */
export interface GridCalibrationContext {
  imageW: number;
  imageH: number;
  dayCount: number;
}

/** グリッド校正の妥当性（field + メッセージ）。 */
export interface GridCalibrationIssue {
  field:
    | "missing"
    | "gridLeft"
    | "colWidth"
    | "source"
    | "imageW"
    | "imageH"
    | "dayCount";
  message: string;
}

/**
 * グリッド校正が「構造的に妥当」かつ「現コンテキストと整合」するか（pure・throw しない）。
 * - 構造: gridLeft finite / colWidth finite>0 / source=="manual_overlay" / imageW/imageH/dayCount finite。
 * - 整合（誤適用防止）: 校正時の imageW/imageH/dayCount が現コンテキストと一致すること。
 * 1 つでも issue があれば呼出側は校正を**採用しない**（dayColumns fallback へ）。
 * storage 時は context にカ校正自身の imageW/imageH/dayCount を渡せば構造検証のみになる。
 */
export function validateGridCalibration(
  cal: GridCalibration | undefined,
  context: GridCalibrationContext
): GridCalibrationIssue[] {
  const issues: GridCalibrationIssue[] = [];
  if (!cal) {
    issues.push({ field: "missing", message: "grid calibration is not set" });
    return issues;
  }
  // ── 構造 ──
  if (!Number.isFinite(cal.gridLeft))
    issues.push({ field: "gridLeft", message: "must be a finite number" });
  if (!Number.isFinite(cal.colWidth) || cal.colWidth <= 0)
    issues.push({ field: "colWidth", message: "must be a finite number > 0" });
  if (cal.source !== "manual_overlay")
    issues.push({ field: "source", message: 'source must be "manual_overlay"' });
  if (!Number.isFinite(cal.imageW))
    issues.push({ field: "imageW", message: "imageW must be a finite number" });
  if (!Number.isFinite(cal.imageH))
    issues.push({ field: "imageH", message: "imageH must be a finite number" });
  if (!Number.isInteger(cal.dayCount))
    issues.push({ field: "dayCount", message: "dayCount must be an integer" });
  if (issues.length) return issues;
  // ── 誤適用防止: 校正時コンテキスト == 現コンテキスト ──
  if (cal.imageW !== context.imageW)
    issues.push({ field: "imageW", message: "calibration imageW does not match current image" });
  if (cal.imageH !== context.imageH)
    issues.push({ field: "imageH", message: "calibration imageH does not match current image" });
  if (cal.dayCount !== context.dayCount)
    issues.push({ field: "dayCount", message: "calibration dayCount does not match current month" });
  return issues;
}

/** 整数 px に snap し、[0, imageH] に clamp。 */
export function normalizeBand(band: BandY, imageH: number): BandY {
  const top = Math.max(0, Math.min(Math.round(band.top), imageH));
  const bottom = Math.max(0, Math.min(Math.round(band.bottom), imageH));
  return top <= bottom ? { top, bottom } : { top: bottom, bottom: top };
}

/** 両 band を normalize した Selection を返す（pure・元 selection は不変）。 */
export function normalizeSelection(
  s: AssistedRowSelection
): AssistedRowSelection {
  return {
    ...s,
    headerBand: normalizeBand(s.headerBand, s.imageH),
    personRowBand: normalizeBand(s.personRowBand, s.imageH),
  };
}

/**
 * person row tap 位置（画像 y）から、header / personRow の初期 band を自動推定する。
 * 比率はテンプレ寸法に hardcode せず、画像高さに対する割合で決定（汎用性）。
 */
export function suggestBandsFromTap(
  tapY: number,
  imageH: number,
  options?: { personRowRatio?: number; headerRatio?: number; offsetRatio?: number }
): { headerBand: BandY; personRowBand: BandY } {
  const personRatio = options?.personRowRatio ?? DEFAULT_PERSON_ROW_RATIO;
  const headerRatio = options?.headerRatio ?? DEFAULT_HEADER_RATIO;
  const offsetRatio = options?.offsetRatio ?? DEFAULT_HEADER_OFFSET_RATIO;
  const personH = Math.max(8, Math.round(imageH * personRatio));
  const headerH = Math.max(8, Math.round(imageH * headerRatio));
  const offset = Math.max(2, Math.round(imageH * offsetRatio));
  const personRowBand = normalizeBand(
    { top: tapY - personH / 2, bottom: tapY + personH / 2 },
    imageH
  );
  // header は person row の直上、画像内に収まるよう clamp
  const headerBottom = Math.max(0, personRowBand.top - offset);
  const headerBand = normalizeBand(
    { top: headerBottom - headerH, bottom: headerBottom },
    imageH
  );
  return { headerBand, personRowBand };
}

/** crop region（左幅は全幅・上下は band）。VLM へ送る 2 帯の取り出しに使う pure 矩形。 */
export interface CropRegionPx {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface AssistedCropRegions {
  header: CropRegionPx;
  personRow: CropRegionPx;
}

/** valid な selection から 2 帯の crop region を算出。invalid なら null。 */
export function computeCropRegions(
  s: AssistedRowSelection
): AssistedCropRegions | null {
  const v = validateSelection(s);
  if (!v.ok) return null;
  return {
    header: {
      left: 0,
      top: s.headerBand.top,
      width: s.imageW,
      height: s.headerBand.bottom - s.headerBand.top,
    },
    personRow: {
      left: 0,
      top: s.personRowBand.top,
      width: s.imageW,
      height: s.personRowBand.bottom - s.personRowBand.top,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Fingerprint（pure・Web Crypto / Date / random なし）
// 画像本体を保存させないため、File metadata（size + wh + name 末尾）から決定論ハッシュを作る。
// 衝突可能性はあるが「同一画像の再開時に座標を復元する」用途には十分。
// ─────────────────────────────────────────────────────────────

/** FNV-1a 32bit（pure 文字列ハッシュ）。 */
export function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** File から fingerprint key を作る（base64/blob を保存しない）。size+wh+name_tail を ハッシュ。 */
export function buildImageFingerprint(input: {
  size: number;
  imageW: number;
  imageH: number;
  nameTail?: string;
}): string {
  const tail = (input.nameTail ?? "").slice(-32);
  const key = `${input.size}|${input.imageW}x${input.imageH}|${tail}`;
  return `${input.size}_${input.imageW}x${input.imageH}_${fnv1a32(key)}`;
}

// ─────────────────────────────────────────────────────────────
// localStorage payload 規約（画像本体は含まない・型で禁止）
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = "aneurasync:plan:shift:assistedRow:v1:";

/** image fingerprint から localStorage key を作る（pure・per-image）。 */
export function makeStorageKey(imageFingerprint: string): string {
  return `${STORAGE_KEY_PREFIX}${imageFingerprint}`;
}

/** 永続化対象 fields だけを抽出（画像本体・dataURI 等を構造的に弾く）。 */
export function toStoredPayload(
  s: AssistedRowSelection,
  updatedAt: string
): AssistedRowSelectionStored | null {
  if (!s.imageFingerprint) return null;
  const v = validateSelection(s);
  if (!v.ok) return null;
  const stored: AssistedRowSelectionStored = {
    imageFingerprint: s.imageFingerprint,
    imageW: s.imageW,
    imageH: s.imageH,
    headerBand: s.headerBand,
    personRowBand: s.personRowBand,
    updatedAt,
  };
  // day列中心 X は valid な時のみ載せる（座標のみ・画像本体は型で構造的に乗らない）。
  if (s.dayColumns && validateDayColumns(s.dayColumns, s.imageW).length === 0) {
    stored.dayColumns = {
      firstDayCenterX: s.dayColumns.firstDayCenterX,
      lastDayCenterX: s.dayColumns.lastDayCenterX,
    };
  }
  // グリッド校正は **構造的に valid な時のみ** 座標 + 誤適用防止コンテキスト + source を載せる
  // （self-context で構造検証のみ・apply 時の match は resolve で照合）。raw 画像は型で乗らない。
  if (
    s.gridCalibration &&
    validateGridCalibration(s.gridCalibration, {
      imageW: s.gridCalibration.imageW,
      imageH: s.gridCalibration.imageH,
      dayCount: s.gridCalibration.dayCount,
    }).length === 0
  ) {
    const c = s.gridCalibration;
    stored.gridCalibration = {
      gridLeft: c.gridLeft,
      colWidth: c.colWidth,
      source: "manual_overlay",
      imageW: c.imageW,
      imageH: c.imageH,
      dayCount: c.dayCount,
      ...(typeof c.calibratedAt === "string"
        ? { calibratedAt: c.calibratedAt }
        : {}),
    };
  }
  return stored;
}

/**
 * untyped JSON（localStorage 由来）を防御的に検証して AssistedRowSelectionStored に。
 * 失敗時は null。画像本体らしき extra field は黙って捨てる（拡張時の漏出抑制）。
 */
export function parseStoredPayload(
  raw: unknown
): AssistedRowSelectionStored | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const headerBand = o.headerBand as Partial<BandY> | undefined;
  const personRowBand = o.personRowBand as Partial<BandY> | undefined;
  if (
    typeof o.imageFingerprint !== "string" ||
    typeof o.imageW !== "number" ||
    typeof o.imageH !== "number" ||
    typeof o.updatedAt !== "string" ||
    !headerBand ||
    !personRowBand ||
    typeof headerBand.top !== "number" ||
    typeof headerBand.bottom !== "number" ||
    typeof personRowBand.top !== "number" ||
    typeof personRowBand.bottom !== "number"
  )
    return null;
  const out: AssistedRowSelectionStored = {
    imageFingerprint: o.imageFingerprint,
    imageW: o.imageW,
    imageH: o.imageH,
    headerBand: { top: headerBand.top, bottom: headerBand.bottom },
    personRowBand: { top: personRowBand.top, bottom: personRowBand.bottom },
    updatedAt: o.updatedAt,
  };
  // day列中心 X は **座標(number)のみ**読む。raw 画像/base64/dataURI/blob 等の余計な field は
  // 一切読まない（out に明示 field しか入れない＝黙って捨てる設計を維持）。
  const dcRaw = o.dayColumns as Partial<DayColumns> | undefined;
  if (
    dcRaw &&
    typeof dcRaw.firstDayCenterX === "number" &&
    typeof dcRaw.lastDayCenterX === "number"
  ) {
    const dc: DayColumns = {
      firstDayCenterX: dcRaw.firstDayCenterX,
      lastDayCenterX: dcRaw.lastDayCenterX,
    };
    if (validateDayColumns(dc, out.imageW).length === 0) out.dayColumns = dc;
  }
  // グリッド校正は **number / "manual_overlay" / 任意 string のみ**読む。
  // raw 画像/base64/dataURI/blob 等の余計な field は一切読まない（out に明示 field のみ＝黙って捨てる）。
  const gcRaw = o.gridCalibration as Partial<GridCalibration> | undefined;
  if (
    gcRaw &&
    typeof gcRaw.gridLeft === "number" &&
    typeof gcRaw.colWidth === "number" &&
    gcRaw.source === "manual_overlay" &&
    typeof gcRaw.imageW === "number" &&
    typeof gcRaw.imageH === "number" &&
    typeof gcRaw.dayCount === "number"
  ) {
    const gc: GridCalibration = {
      gridLeft: gcRaw.gridLeft,
      colWidth: gcRaw.colWidth,
      source: "manual_overlay",
      imageW: gcRaw.imageW,
      imageH: gcRaw.imageH,
      dayCount: gcRaw.dayCount,
      ...(typeof gcRaw.calibratedAt === "string"
        ? { calibratedAt: gcRaw.calibratedAt }
        : {}),
    };
    // 自身のコンテキストで構造検証（self-context ＝ match は通り構造のみ判定）。
    if (
      validateGridCalibration(gc, {
        imageW: gc.imageW,
        imageH: gc.imageH,
        dayCount: gc.dayCount,
      }).length === 0
    )
      out.gridCalibration = gc;
  }
  // 構造検証も通す（範囲は imageH 依存・persisted 値の sanity）
  const v = validateSelection({
    imageW: out.imageW,
    imageH: out.imageH,
    headerBand: out.headerBand,
    personRowBand: out.personRowBand,
  });
  return v.ok ? out : null;
}
