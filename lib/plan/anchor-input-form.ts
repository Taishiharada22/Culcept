/**
 * Anchor Input Form Helpers (W1-X1)
 *
 * Add Anchor Modal の form state を CreateExternalAnchorInput に変換する pure 関数群。
 * UI ロジックではなく、「form の生入力 → API への送信形」の変換 + client-side validation に閉じる。
 *
 * 設計書: docs/alter-plan-w1x1-mini-design.md §5
 *
 * 不変原則:
 *   1. すべて pure（副作用なし、現在時刻参照なし、入力 mutate なし）
 *   2. validation は W1-4pre-1 の validateCreateExternalAnchorInput を最終ゲートとして再利用
 *      （SoT を一本化、client / API で同一形が出る）
 *   3. weekday → RRULE は W1-4pre-2 の buildWeekdayRRule を再利用
 *   4. 出力は CreateExternalAnchorInput (validated) または errors 配列
 *
 * 範囲外:
 *   - 編集 (PATCH/PUT) 用の input 変換
 *   - DraftPlan / generator
 *   - exception dates の UI 入力
 */

import type { AnchorRigidity, AnchorSensitiveCategory } from "./external-anchor";
import type {
  AnchorInputValidationError,
  CreateExternalAnchorInput,
} from "./external-anchor-input";
import { validateCreateExternalAnchorInput } from "./external-anchor-input";
import type { LocationCategory } from "./location-category";
import { buildWeekdayRRule, canonicalizeWeekdays, type Weekday } from "./weekday-template";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Form state types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AnchorFormKind = "one_off" | "recurring";

/**
 * AddAnchorModal の internal form state。
 * UI 側で useState する shape を全て string ベースで持つ
 * (input field は基本 string、未入力 = "")。
 *
 * undefined / null を許容しないことで、controlled input の警告を回避する。
 */
export interface AnchorFormState {
  kind: AnchorFormKind;

  /** 共通必須 */
  title: string;
  startTime: string; // HH:MM

  /** 共通 optional */
  endTime: string;    // HH:MM、空文字なら未指定
  rigidity: AnchorRigidity | "";
  locationCategory: LocationCategory | "";
  locationText: string;
  sensitiveCategory: AnchorSensitiveCategory | "";
  sourceType: "manual" | "template" | "";

  /** one_off 専用 */
  date: string; // YYYY-MM-DD

  /** recurring 専用 */
  validFrom: string;            // YYYY-MM-DD
  validUntil: string;           // YYYY-MM-DD、空文字なら未指定
  selectedWeekdays: Weekday[];  // canonical 化前で OK
}

/**
 * 新規 form の初期値。
 * default rigidity は空 (radio 強制選択)、kind は one_off。
 */
export function emptyAnchorFormState(): AnchorFormState {
  return {
    kind: "one_off",
    title: "",
    startTime: "",
    endTime: "",
    rigidity: "",
    locationCategory: "",
    locationText: "",
    sensitiveCategory: "",
    sourceType: "",
    date: "",
    validFrom: "",
    validUntil: "",
    selectedWeekdays: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weekday shortcut
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type WeekdayShortcut = "weekdays" | "weekend" | "everyday" | "custom";

const WEEKDAYS_SET: ReadonlyArray<Weekday> = ["MO", "TU", "WE", "TH", "FR"];
const WEEKEND_SET: ReadonlyArray<Weekday> = ["SA", "SU"];
const EVERYDAY_SET: ReadonlyArray<Weekday> = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
];

/** 現在の選択状態から shortcut key を逆引き */
export function detectWeekdayShortcut(
  selected: ReadonlyArray<Weekday>
): WeekdayShortcut {
  const canonical = canonicalizeWeekdays(selected);
  const matches = (target: ReadonlyArray<Weekday>) =>
    canonical.length === target.length &&
    canonical.every((d, i) => d === target[i]);
  if (matches(WEEKDAYS_SET)) return "weekdays";
  if (matches(WEEKEND_SET)) return "weekend";
  if (matches(EVERYDAY_SET)) return "everyday";
  return "custom";
}

/** shortcut key → 曜日配列（canonical 化済み） */
export function shortcutToWeekdays(shortcut: WeekdayShortcut): Weekday[] {
  switch (shortcut) {
    case "weekdays":
      return [...WEEKDAYS_SET];
    case "weekend":
      return [...WEEKEND_SET];
    case "everyday":
      return [...EVERYDAY_SET];
    case "custom":
      return [];
  }
}

/** 1 曜日を toggle してから canonical 化 */
export function toggleWeekday(
  current: ReadonlyArray<Weekday>,
  target: Weekday
): Weekday[] {
  const set = new Set(current);
  if (set.has(target)) set.delete(target);
  else set.add(target);
  return canonicalizeWeekdays(Array.from(set));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// rigidity / locationCategory / sensitive label maps (UI 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const RIGIDITY_OPTIONS: ReadonlyArray<{
  value: AnchorRigidity;
  label: string;
  hint: string;
}> = [
  {
    value: "hard",
    label: "動かせない",
    hint: "歯医者 / 授業 / フライトのように、ずらすと現実が崩れる",
  },
  {
    value: "soft",
    label: "動かせる",
    hint: "ジム / 習い事のように、状況次第で動かせる",
  },
];

export const LOCATION_CATEGORY_OPTIONS: ReadonlyArray<{
  value: LocationCategory;
  label: string;
}> = [
  { value: "home", label: "家" },
  { value: "office", label: "職場" },
  { value: "school", label: "学校" },
  { value: "cafe", label: "カフェ" },
  { value: "outdoor", label: "屋外" },
  { value: "public", label: "公共" },
  { value: "transit", label: "移動" },
  { value: "unknown", label: "未分類" },
];

export const SENSITIVE_CATEGORY_OPTIONS: ReadonlyArray<{
  value: AnchorSensitiveCategory;
  label: string;
}> = [
  { value: "medical", label: "医療" },
  { value: "legal", label: "法務" },
  { value: "exam", label: "試験" },
  { value: "other", label: "その他敏感" },
];

export const SOURCE_TYPE_OPTIONS: ReadonlyArray<{
  value: "manual" | "template";
  label: string;
}> = [
  { value: "manual", label: "手動" },
  { value: "template", label: "テンプレ" },
];

/** kind に応じた default sourceType */
export function defaultSourceTypeForKind(
  kind: AnchorFormKind
): "manual" | "template" {
  return kind === "one_off" ? "manual" : "template";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Build CreateExternalAnchorInput
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type BuildAnchorInputResult =
  | { valid: true; input: CreateExternalAnchorInput }
  | { valid: false; errors: AnchorInputValidationError[] };

/**
 * AnchorFormState → CreateExternalAnchorInput への pure 変換。
 *
 * - rigidity / sourceType / locationCategory 等の "" は未選択として扱う
 * - 必須欠落は errors として返す（throw しない）
 * - 最終的に W1-4pre-1 の validateCreateExternalAnchorInput を通す
 * - recurring 時の selectedWeekdays は buildWeekdayRRule で RRULE 化
 */
export function buildAnchorInputFromForm(
  state: AnchorFormState
): BuildAnchorInputResult {
  const errors: AnchorInputValidationError[] = [];

  // ── common 必須 ──
  if (!state.title || state.title.trim().length === 0) {
    errors.push({
      field: "title",
      code: "required",
      message: "予定名を入力してください",
    });
  }
  if (!state.startTime) {
    errors.push({
      field: "startTime",
      code: "required",
      message: "開始時刻を入力してください",
    });
  }
  if (state.rigidity !== "hard" && state.rigidity !== "soft") {
    errors.push({
      field: "rigidity",
      code: "required",
      message: "動かせなさを選んでください",
    });
  }

  // sourceType default 補完（empty なら kind から default）
  const sourceType =
    state.sourceType === "" ? defaultSourceTypeForKind(state.kind) : state.sourceType;

  // ── 共通 fields の組み立て ──
  const commonBase = {
    title: state.title.trim(),
    startTime: state.startTime,
    rigidity: state.rigidity as AnchorRigidity,
    sourceType,
  };

  // optional fields は undefined 透過 (exactOptionalPropertyTypes 配慮)
  const commonOptional: Partial<{
    endTime: string;
    locationText: string;
    locationCategory: LocationCategory;
    sensitiveCategory: AnchorSensitiveCategory;
  }> = {};
  if (state.endTime) commonOptional.endTime = state.endTime;
  if (state.locationText && state.locationText.trim().length > 0) {
    commonOptional.locationText = state.locationText.trim();
  }
  if (state.locationCategory) {
    commonOptional.locationCategory = state.locationCategory as LocationCategory;
  }
  if (state.sensitiveCategory) {
    commonOptional.sensitiveCategory =
      state.sensitiveCategory as AnchorSensitiveCategory;
  }

  if (state.kind === "one_off") {
    if (!state.date) {
      errors.push({
        field: "date",
        code: "required",
        message: "日付を入力してください",
      });
    }
    if (errors.length > 0) return { valid: false, errors };

    const candidate = {
      anchorKind: "one_off" as const,
      date: state.date,
      ...commonBase,
      ...commonOptional,
    };
    return validateThroughSoT(candidate);
  }

  // recurring
  if (!state.validFrom) {
    errors.push({
      field: "validFrom",
      code: "required",
      message: "開始日を入力してください",
    });
  }
  if (state.selectedWeekdays.length === 0) {
    errors.push({
      field: "recurrenceRule",
      code: "required",
      message: "曜日を 1 つ以上選んでください",
    });
  }
  if (errors.length > 0) return { valid: false, errors };

  const rrule = buildWeekdayRRule(state.selectedWeekdays);
  const recurringExtra: Partial<{ validUntil: string }> = {};
  if (state.validUntil) recurringExtra.validUntil = state.validUntil;

  const candidate = {
    anchorKind: "recurring" as const,
    validFrom: state.validFrom,
    recurrenceRule: rrule,
    ...commonBase,
    ...commonOptional,
    ...recurringExtra,
  };
  return validateThroughSoT(candidate);
}

/** SoT validator (W1-4pre-1) を通して結果型に揃える */
function validateThroughSoT(
  candidate: Record<string, unknown>
): BuildAnchorInputResult {
  const result = validateCreateExternalAnchorInput(candidate);
  if (!result.valid) return { valid: false, errors: result.errors };
  return { valid: true, input: result.input };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Source input (POST 用、anchor と並列で送る)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AnchorFormState から source 入力を組み立てる。
 *
 * W1-X1 では:
 *   - source.sourceType = anchor の sourceType と一致させる
 *   - rawRetention は default ("discarded") に委ねる
 *   - notes は付けない（後の wave で UI 入力可能に）
 */
export function buildSourceInputFromForm(state: AnchorFormState): {
  sourceType: "manual" | "template";
} {
  const sourceType =
    state.sourceType === "" ? defaultSourceTypeForKind(state.kind) : state.sourceType;
  return { sourceType };
}
