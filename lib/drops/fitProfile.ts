import type { GarmentFitProfile } from "@/types/body-color";
import type { ShoeWidthCode } from "@/lib/shoeWidth";
import type { FitGuideId } from "@/lib/drops/fitGuide";

export type FitCategoryMain =
  | "outerwear"
  | "tops"
  | "bottoms"
  | "shoes"
  | "bag"
  | "accessory"
  | "other";

export type FitFormValueMap = Record<string, string>;

type FitOption = {
  value: string;
  label: string;
};

type FitFieldBase = {
  key: string;
  label: string;
  help?: string;
  required?: boolean;
};

export type FitSelectField = FitFieldBase & {
  type: "select";
  options: FitOption[];
};

export type FitNumberField = FitFieldBase & {
  type: "number";
  unit: string;
  placeholder?: string;
  reference?: "user" | "product";
  conditionalSubcategories?: string[];
  readOnly?: boolean;
};

export type FitField = FitSelectField | FitNumberField;

export type FitProfileConfig = {
  categoryMain: FitCategoryMain | "";
  subcategoryId: string;
  guideId: FitGuideId | null;
  attributeFields: FitSelectField[];
  measurementSections: Array<{
    key: string;
    title: string;
    description?: string;
    fields: FitNumberField[];
  }>;
  requiredKeys: string[];
  completenessTitle: string;
};

const APPAREL_INTENDED_FIT_OPTIONS: FitOption[] = [
  { value: "slim", label: "タイト" },
  { value: "regular", label: "ジャスト" },
  { value: "relaxed", label: "リラックス" },
  { value: "oversized", label: "オーバー" },
];

const SCALE3_OPTIONS: FitOption[] = [
  { value: "0", label: "低い" },
  { value: "1", label: "普通" },
  { value: "2", label: "高い" },
];

const SOCKS_OPTIONS: FitOption[] = [
  { value: "thin", label: "薄手" },
  { value: "normal", label: "普通" },
  { value: "thick", label: "厚手" },
];

const SIZE_FEEL_OPTIONS: FitOption[] = [
  { value: "just", label: "ジャスト" },
  { value: "small", label: "やや小さめ" },
  { value: "large", label: "やや大きめ" },
];

const PRESSURE_OPTIONS: FitOption[] = [
  { value: "loose", label: "ゆるい" },
  { value: "normal", label: "普通" },
  { value: "tight", label: "タイト" },
];

const RIGIDITY_OPTIONS: FitOption[] = [
  { value: "soft", label: "やわらかい" },
  { value: "normal", label: "普通" },
  { value: "firm", label: "硬め" },
];

const defaultAttributeFields: FitSelectField[] = [
  {
    key: "intended_fit",
    label: "サイズ感",
    type: "select",
    options: APPAREL_INTENDED_FIT_OPTIONS,
    required: true,
  },
  {
    key: "fit_layering",
    label: "レイヤー余白",
    type: "select",
    options: [
      { value: "0", label: "薄手向け" },
      { value: "1", label: "標準" },
      { value: "2", label: "重ね着向け" },
    ],
  },
  {
    key: "fit_stretch",
    label: "伸縮性",
    type: "select",
    options: SCALE3_OPTIONS,
  },
  {
    key: "fit_rigidity",
    label: "生地の硬さ",
    type: "select",
    options: SCALE3_OPTIONS.map((option, index) => ({
      value: option.value,
      label: index === 0 ? "やわらかい" : index === 1 ? "普通" : "硬め",
    })),
  },
  {
    key: "fit_drape",
    label: "落ち感",
    type: "select",
    options: SCALE3_OPTIONS.map((option, index) => ({
      value: option.value,
      label: index === 0 ? "少ない" : index === 1 ? "普通" : "強い",
    })),
  },
];

const shoeAttributeFields: FitSelectField[] = [
  {
    key: "intended_fit",
    label: "サイズ感",
    type: "select",
    options: SIZE_FEEL_OPTIONS,
    required: true,
  },
  {
    key: "fit_layering",
    label: "ソックス厚み",
    type: "select",
    options: SOCKS_OPTIONS,
    required: true,
  },
  {
    key: "fit_stretch",
    label: "ホールド感",
    type: "select",
    options: SCALE3_OPTIONS,
    required: true,
  },
  {
    key: "fit_rigidity",
    label: "アッパーの硬さ",
    type: "select",
    options: RIGIDITY_OPTIONS,
  },
  {
    key: "fit_drape",
    label: "甲の圧迫感",
    type: "select",
    options: PRESSURE_OPTIONS,
  },
];

const pantsMeasurementSections: FitProfileConfig["measurementSections"] = [
  {
    key: "product_measurements",
    title: "計測数値",
    description: "パンツの平置き実寸に合わせて入力します。",
    fields: [
      { key: "waist_cm", label: "ウエスト", type: "number", unit: "cm", reference: "product" },
      { key: "hip_cm", label: "ヒップ", type: "number", unit: "cm", reference: "product" },
      { key: "thigh_width_cm", label: "わたり幅", type: "number", unit: "cm", reference: "product" },
      { key: "rise_cm", label: "股上", type: "number", unit: "cm", reference: "product" },
      { key: "inseam_cm", label: "股下", type: "number", unit: "cm", reference: "product" },
      { key: "hem_width_cm", label: "裾幅", type: "number", unit: "cm", reference: "product" },
      { key: "total_length_cm", label: "総丈", type: "number", unit: "cm", reference: "product" },
    ],
  },
];

const skirtMeasurementSections: FitProfileConfig["measurementSections"] = [
  {
    key: "product_measurements",
    title: "計測数値",
    description: "スカートの平置き実寸に合わせて入力します。",
    fields: [
      { key: "waist_cm", label: "ウエスト", type: "number", unit: "cm", reference: "product" },
      { key: "hip_cm", label: "ヒップ", type: "number", unit: "cm", reference: "product" },
      { key: "total_length_cm", label: "総丈", type: "number", unit: "cm", reference: "product" },
      { key: "hem_width_cm", label: "裾幅", type: "number", unit: "cm", reference: "product" },
    ],
  },
];

const shoeMeasurementSections: FitProfileConfig["measurementSections"] = [
  {
    key: "user_reference",
    title: "足の目安（ユーザー基準）",
    description: "ユーザーの足実寸や推奨サイズの目安です。",
    fields: [
      {
        key: "recommended_foot_length_cm",
        label: "推奨足長",
        type: "number",
        unit: "cm",
        reference: "user",
        required: true,
      },
      {
        key: "recommended_foot_girth_cm",
        label: "推奨足囲",
        type: "number",
        unit: "cm",
        reference: "user",
        required: true,
      },
      {
        key: "recommended_width",
        label: "推奨ワイズ",
        type: "number",
        unit: "",
        reference: "user",
        readOnly: true,
      },
    ],
  },
  {
    key: "product_measurements",
    title: "靴の実寸（商品基準）",
    description: "商品の実寸を入力してください。",
    fields: [
      { key: "insole_length_cm", label: "インソール長", type: "number", unit: "cm", reference: "product" },
      { key: "shoe_width_cm", label: "靴幅", type: "number", unit: "cm", reference: "product" },
      {
        key: "heel_height_cm",
        label: "ヒール高",
        type: "number",
        unit: "cm",
        reference: "product",
        conditionalSubcategories: ["subcategory.shoes.heal"],
      },
      {
        key: "shaft_height_cm",
        label: "筒丈",
        type: "number",
        unit: "cm",
        reference: "product",
        conditionalSubcategories: ["subcategory.shoes.boots"],
      },
      {
        key: "opening_circumference_cm",
        label: "履き口周囲",
        type: "number",
        unit: "cm",
        reference: "product",
        conditionalSubcategories: ["subcategory.shoes.boots"],
      },
    ],
  },
];

export const ALL_FIT_FORM_KEYS = [
  "style_category_main",
  "style_subcategory_id",
  "intended_fit",
  "fit_layering",
  "fit_stretch",
  "fit_rigidity",
  "fit_drape",
  "waist_cm",
  "hip_cm",
  "thigh_width_cm",
  "rise_cm",
  "inseam_cm",
  "hem_width_cm",
  "total_length_cm",
  "recommended_foot_length_cm",
  "recommended_foot_girth_cm",
  "recommended_width",
  "recommended_width_size",
  "insole_length_cm",
  "shoe_width_cm",
  "heel_height_cm",
  "shaft_height_cm",
  "opening_circumference_cm",
  "shoe_width_audience",
] as const;

export type UserFootReference = {
  foot_length_cm?: number | null;
  foot_girth_cm?: number | null;
  foot_width_cm?: number | null;
  derived_width_size?: ShoeWidthCode | string | null;
};

const LEGACY_SUBCATEGORY_ALIASES: Record<string, string> = {
  "subcategory.sneaker": "subcategory.shoes.sneakers",
  "subcategory.boot": "subcategory.shoes.boots",
  "subcategory.derby": "subcategory.shoes.derby",
  "subcategory.sandals": "subcategory.shoes.sandals",
  "subcategory.loafer": "subcategory.shoes.derby",
  "subcategory.heel": "subcategory.shoes.heal",
  "subcategory.heels": "subcategory.shoes.heal",
  "subcategory.bottoms.skirts": "subcategory.bottoms.skirt",
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeCategoryMain(value: unknown): FitCategoryMain | "" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "outer") return "outerwear";
  if (
    normalized === "outerwear" ||
    normalized === "tops" ||
    normalized === "bottoms" ||
    normalized === "shoes" ||
    normalized === "bag" ||
    normalized === "accessory" ||
    normalized === "other"
  ) {
    return normalized;
  }
  return "";
}

export function normalizeSubcategoryId(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return LEGACY_SUBCATEGORY_ALIASES[normalized] ?? normalized;
}

export function getGuideIdForSelection(
  categoryMain: FitCategoryMain | "",
  subcategoryId: string
): FitGuideId | null {
  if (categoryMain === "bottoms") {
    if (subcategoryId === "subcategory.bottoms.skirt" || subcategoryId === "subcategory.bottoms.skirt") {
      return "bottoms_skirt";
    }
    return "bottoms_pants";
  }
  if (categoryMain === "shoes") {
    if (subcategoryId === "subcategory.shoes.boots") return "shoes_boots";
    if (subcategoryId === "subcategory.shoes.heal") return "shoes_heal";
    return "shoes_leather";
  }
  return null;
}

export function isFieldVisibleForSubcategory(field: FitNumberField, subcategoryId: string) {
  if (!field.conditionalSubcategories?.length) return true;
  return field.conditionalSubcategories.includes(subcategoryId);
}

export function getFitProfileConfig(
  categoryMainInput: unknown,
  subcategoryIdInput: unknown
): FitProfileConfig {
  const categoryMain = normalizeCategoryMain(categoryMainInput);
  const subcategoryId = normalizeSubcategoryId(subcategoryIdInput);

  if (categoryMain === "shoes") {
    return {
      categoryMain,
      subcategoryId,
      guideId: getGuideIdForSelection(categoryMain, subcategoryId),
      attributeFields: shoeAttributeFields,
      measurementSections: shoeMeasurementSections,
      requiredKeys: [
        "intended_fit",
        "fit_layering",
        "fit_stretch",
        "recommended_foot_length_cm",
        "recommended_foot_girth_cm",
      ],
      completenessTitle: "靴フィット入力",
    };
  }

  if (categoryMain === "bottoms" && subcategoryId === "subcategory.bottoms.skirt") {
    return {
      categoryMain,
      subcategoryId,
      guideId: "bottoms_skirt",
      attributeFields: defaultAttributeFields,
      measurementSections: skirtMeasurementSections,
      requiredKeys: ["intended_fit", "waist_cm", "hip_cm", "total_length_cm"],
      completenessTitle: "スカート計測",
    };
  }

  if (categoryMain === "bottoms") {
    return {
      categoryMain,
      subcategoryId,
      guideId: "bottoms_pants",
      attributeFields: defaultAttributeFields,
      measurementSections: pantsMeasurementSections,
      requiredKeys: ["intended_fit", "waist_cm", "hip_cm", "rise_cm", "inseam_cm"],
      completenessTitle: "パンツ計測",
    };
  }

  return {
    categoryMain,
    subcategoryId,
    guideId: null,
    attributeFields: defaultAttributeFields,
    measurementSections: [],
    requiredKeys: ["intended_fit"],
    completenessTitle: "フィット入力",
  };
}

export function buildInitialFitValues(initialFit: GarmentFitProfile | null | undefined): FitFormValueMap {
  const values: FitFormValueMap = {};
  for (const key of ALL_FIT_FORM_KEYS) values[key] = "";

  const pattern = initialFit?.pattern ?? {};
  const fabric = initialFit?.fabric ?? {};

  values.style_category_main = normalizeCategoryMain(
    pattern.category_main ?? initialFit?.category ?? ""
  );
  values.style_subcategory_id = normalizeSubcategoryId(pattern.subcategory_id ?? "");
  values.intended_fit = toText(initialFit?.intended_fit ?? fabric.intended_fit ?? "");
  values.fit_layering = toText(fabric.fit_layering ?? fabric.layering ?? "");
  values.fit_stretch = toText(fabric.fit_stretch ?? fabric.stretch ?? "");
  values.fit_rigidity = toText(fabric.fit_rigidity ?? fabric.rigidity ?? "");
  values.fit_drape = toText(fabric.fit_drape ?? fabric.drape ?? "");

  values.waist_cm = toText(pattern.waist_cm ?? "");
  values.hip_cm = toText(pattern.hip_cm ?? "");
  values.thigh_width_cm = toText(pattern.thigh_width_cm ?? pattern.thigh_cm ?? "");
  values.rise_cm = toText(pattern.rise_cm ?? "");
  values.inseam_cm = toText(pattern.inseam_cm ?? "");
  values.hem_width_cm = toText(pattern.hem_width_cm ?? "");
  values.total_length_cm = toText(pattern.total_length_cm ?? pattern.length_cm ?? "");

  values.recommended_foot_length_cm = toText(
    pattern.recommended_foot_length_cm ?? pattern.foot_length_cm ?? ""
  );
  values.recommended_foot_girth_cm = toText(
    pattern.recommended_foot_girth_cm ?? pattern.foot_girth_cm ?? ""
  );
  values.recommended_width = toText(
    pattern.recommended_width ?? pattern.recommended_width_size ?? fabric.recommended_width ?? ""
  );
  values.recommended_width_size = values.recommended_width;
  values.insole_length_cm = toText(pattern.insole_length_cm ?? "");
  values.shoe_width_cm = toText(pattern.shoe_width_cm ?? pattern.foot_width_cm ?? "");
  values.heel_height_cm = toText(pattern.heel_height_cm ?? "");
  values.shaft_height_cm = toText(pattern.shaft_height_cm ?? "");
  values.opening_circumference_cm = toText(pattern.opening_circumference_cm ?? "");
  values.shoe_width_audience = toText(pattern.shoe_width_audience ?? "");

  return values;
}

export function getSubmittedFitValues(formData: FormData): FitFormValueMap {
  const values: FitFormValueMap = {};
  for (const key of ALL_FIT_FORM_KEYS) {
    values[key] = toText(formData.get(key));
  }
  values.style_category_main = normalizeCategoryMain(values.style_category_main);
  values.style_subcategory_id = normalizeSubcategoryId(values.style_subcategory_id);
  return values;
}

function parseMaybeNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildGarmentFitPayload(values: FitFormValueMap) {
  const categoryMain = normalizeCategoryMain(values.style_category_main);
  const subcategoryId = normalizeSubcategoryId(values.style_subcategory_id);
  const config = getFitProfileConfig(categoryMain, subcategoryId);

  const pattern: Record<string, string | number> = {};
  const fabric: Record<string, string | number> = {};

  if (categoryMain) pattern.category_main = categoryMain;
  if (subcategoryId) pattern.subcategory_id = subcategoryId;
  if (config.guideId) pattern.guide_id = config.guideId;

  for (const section of config.measurementSections) {
    for (const field of section.fields) {
      if (!isFieldVisibleForSubcategory(field, subcategoryId)) continue;
      const raw = toText(values[field.key]);
      if (!raw) continue;
      if (field.key === "recommended_width") {
        pattern.recommended_width = raw;
        pattern.recommended_width_size = raw;
        continue;
      }
      const parsed = parseMaybeNumber(raw);
      pattern[field.key] = parsed ?? raw;
    }
  }

  if (values.shoe_width_audience) {
    pattern.shoe_width_audience = values.shoe_width_audience;
  }

  for (const field of config.attributeFields) {
    const raw = toText(values[field.key]);
    if (!raw) continue;
    if (field.key === "intended_fit") continue;
    fabric[field.key] = raw;
  }

  const hasFitValues =
    Boolean(categoryMain) ||
    Object.keys(pattern).length > 0 ||
    Object.keys(fabric).length > 0 ||
    Boolean(values.intended_fit);

  if (!hasFitValues) return null;

  return {
    category: categoryMain || null,
    intended_fit: values.intended_fit || null,
    pattern,
    fabric,
  };
}

export function calculateFitCompleteness(config: FitProfileConfig, values: FitFormValueMap) {
  const missingLabels: string[] = [];
  let requiredFilled = 0;
  for (const key of config.requiredKeys) {
    const value = toText(values[key]);
    const field =
      config.attributeFields.find((candidate) => candidate.key === key) ??
      config.measurementSections.flatMap((section) => section.fields).find((candidate) => candidate.key === key);
    if (value) {
      requiredFilled += 1;
    } else if (field) {
      missingLabels.push(field.label);
    }
  }

  const requiredTotal = config.requiredKeys.length;
  const percent = requiredTotal === 0 ? 100 : Math.round((requiredFilled / requiredTotal) * 100);
  return { requiredFilled, requiredTotal, percent, missingLabels };
}
