type UnknownRecord = Record<string, unknown>;

export type BodyFieldDef = {
  key: string;
  label: string;
  unit: string;
  description: string;
  placeholder: string;
  overlayId?: string;
  step: string;
  category: "frame" | "balance" | "limbs" | "foot";
};

export type BodyAxisDef = {
  key: string;
  label: string;
  description: string;
};

export type BodyComparisonRow = {
  key: string;
  label: string;
  mineNum: number | null;
  average: number;
  diff: number | null;
};

export type DiagnosisRuleBucket = {
  materials: string[];
  silhouettes: string[];
  lengths: string[];
  necklines: string[];
  thickness: string[];
  textures: string[];
  patterns: string[];
  colors: string[];
};

export type DiagnosisSummaryFactor = {
  key: string;
  label: string;
  contribution: number;
  reason: string;
};

export type MyStyleDiagnosis = {
  id: string;
  generated_at: string;
  updated_at: string;
  jp_3type: "straight" | "wave" | "natural";
  jp_3type_label: string;
  jp_7type: "classic" | "casual" | "dramatic" | "high_fashion" | "soft_classic" | "romantic" | "lovely";
  jp_7type_label: string;
  label_confidence: number;
  quality_score: number;
  pc_season: string | null;
  pc_season_label: string | null;
  pc_base: "warm" | "cool" | "neutral" | null;
  summary: {
    headline: string;
    description: string;
    top_factors: DiagnosisSummaryFactor[];
  };
  style_rules: {
    recommended: DiagnosisRuleBucket;
    avoid: DiagnosisRuleBucket;
  };
  face_aware_rules?: {
    recommended_necklines: string[];
    avoid_necklines: string[];
    face_shape: string | null;
  };
  hair_aware_rules?: {
    recommended_top_styles: string[];
    notes: string;
    hair_length: string | null;
  };
  color_warmth_adjustment?: "warm_boost" | "cool_boost" | null;
};

export const BODY_FIELD_DEFS: BodyFieldDef[] = [
  {
    key: "stature",
    label: "身長",
    unit: "cm",
    description: "頭頂から床までの全高。比率計算の基準になります。",
    placeholder: "例: 160",
    step: "01",
    category: "frame",
  },
  {
    key: "shoulder_breadth",
    label: "肩幅",
    unit: "cm",
    description: "肩峰から肩峰まで。肩の張り感とフレーム感を見ます。",
    placeholder: "例: 38",
    overlayId: "zone_shoulder",
    step: "02",
    category: "frame",
  },
  {
    key: "chest_circ",
    label: "胸囲",
    unit: "cm",
    description: "自然呼吸の状態で最も高い位置を一周して測ります。",
    placeholder: "例: 82",
    overlayId: "zone_ribcage",
    step: "03",
    category: "frame",
  },
  {
    key: "waist_circ",
    label: "ウエスト",
    unit: "cm",
    description: "一番くびれる位置を水平に一周します。",
    placeholder: "例: 64",
    overlayId: "line_waist_height",
    step: "04",
    category: "balance",
  },
  {
    key: "hip_circ",
    label: "ヒップ",
    unit: "cm",
    description: "ヒップの最も高い位置を一周して測ります。",
    placeholder: "例: 90",
    overlayId: "zone_pelvic_width",
    step: "05",
    category: "balance",
  },
  {
    key: "inseam",
    label: "股下",
    unit: "cm",
    description: "内股の付け根から内くるぶし付近までを測ります。",
    placeholder: "例: 72",
    overlayId: "line_inseam",
    step: "06",
    category: "limbs",
  },
  {
    key: "rise",
    label: "股上",
    unit: "cm",
    description: "前中心のウエスト位置から股の交点まで。",
    placeholder: "例: 25",
    overlayId: "line_rise",
    step: "07",
    category: "balance",
  },
  {
    key: "sleeve_length",
    label: "袖丈",
    unit: "cm",
    description: "肩先から手首まで。腕の長さ感に効きます。",
    placeholder: "例: 56",
    overlayId: "line_sleeve",
    step: "08",
    category: "limbs",
  },
  {
    key: "thigh_circ",
    label: "太もも",
    unit: "cm",
    description: "付け根に近い最も太い位置を一周して測ります。",
    placeholder: "例: 52",
    overlayId: "zone_thigh",
    step: "09",
    category: "limbs",
  },
  {
    key: "calf_circ",
    label: "ふくらはぎ",
    unit: "cm",
    description: "最も太い位置を一周して測ります。",
    placeholder: "例: 33",
    overlayId: "zone_calf",
    step: "10",
    category: "limbs",
  },
  {
    key: "torso_depth",
    label: "胴の厚み",
    unit: "cm",
    description: "胸郭の前後の厚み感です。分からない場合は後回しで構いません。",
    placeholder: "例: 20",
    overlayId: "zone_ribcage",
    step: "11",
    category: "frame",
  },
  {
    key: "foot_length_cm",
    label: "足長",
    unit: "cm",
    description: "かかとから最も長いつま先まで。",
    placeholder: "例: 23.5",
    step: "12",
    category: "foot",
  },
  {
    key: "foot_girth_cm",
    label: "足囲",
    unit: "cm",
    description: "親指と小指の付け根を通る一番張る位置。",
    placeholder: "例: 22.5",
    step: "13",
    category: "foot",
  },
  {
    key: "foot_width_cm",
    label: "足幅",
    unit: "cm",
    description: "足の最も幅広い部分を横一直線で。",
    placeholder: "例: 9.2",
    step: "14",
    category: "foot",
  },
];

export const BODY_AXIS_DEFS: BodyAxisDef[] = [
  { key: "vertical_line", label: "縦の長さ感", description: "上重心か、縦の伸びが強いか。" },
  { key: "shoulder_width", label: "肩幅感", description: "肩の張り出しとフレーム感。" },
  { key: "shoulder_slope", label: "肩傾斜", description: "なで肩か、水平寄りか。" },
  { key: "ribcage_width", label: "胸郭横幅", description: "上半身の横広がり感。" },
  { key: "torso_depth", label: "胴の厚み", description: "前後方向の厚み感。" },
  { key: "pelvis_width", label: "骨盤幅", description: "腰回りの横広がり。" },
  { key: "joint_size", label: "関節サイズ", description: "手首・足首などの骨感。" },
  { key: "bone_sharpness", label: "骨の鋭さ", description: "関節やフレームの見え方。" },
  { key: "leg_ratio", label: "脚比率", description: "脚長寄りか、胴長寄りか。" },
  { key: "arm_ratio", label: "腕比率", description: "袖バランスに効く腕の長さ感。" },
  { key: "waist_position", label: "ウエスト位置", description: "ハイウエスト寄りか、ロー寄りか。" },
  { key: "posture_round_shoulders", label: "巻き肩傾向", description: "前肩・丸みの出方。" },
  { key: "pelvic_tilt", label: "骨盤傾き", description: "前傾・後傾の傾向。" },
  { key: "mobility_upper", label: "上半身可動感", description: "肩まわりのしなやかさ。" },
];

export const JP3_OPTIONS = ["straight", "wave", "natural"] as const;
export const JP7_OPTIONS = ["classic", "casual", "dramatic", "high_fashion", "soft_classic", "romantic", "lovely"] as const;

export const JP3_LABELS: Record<(typeof JP3_OPTIONS)[number], string> = {
  straight: "ストレート",
  wave: "ウェーブ",
  natural: "ナチュラル",
};

export const JP7_LABELS: Record<(typeof JP7_OPTIONS)[number], string> = {
  classic: "クラシック",
  casual: "カジュアル",
  dramatic: "ドラマティック",
  high_fashion: "ハイファッション",
  soft_classic: "ソフトクラシック",
  romantic: "ロマンティック",
  lovely: "ラブリー",
};

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeBirthDateInput(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return raw;
}

export function computeAgeFromBirthDate(value: unknown) {
  const normalized = normalizeBirthDateInput(value);
  if (!normalized) return null;
  const now = new Date();
  const birth = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const birthdayPassed =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

export function normalizeBodyMeasurements(input: unknown) {
  const source = isRecord(input) ? input : {};
  const out: Record<string, number> = {};
  for (const field of BODY_FIELD_DEFS) {
    const numeric = readFiniteNumber(source[field.key]);
    if (numeric == null) continue;
    out[field.key] = numeric;
  }
  return out;
}

export function normalizeBodyAxes(input: unknown) {
  const source = isRecord(input) ? input : {};
  const out: Record<string, number> = {};
  for (const axis of BODY_AXIS_DEFS) {
    const numeric = readFiniteNumber(source[axis.key]);
    if (numeric == null) continue;
    out[axis.key] = clamp(Math.round(numeric), 0, 2);
  }
  return out;
}

function toRatioBand(value: number | null, low: number, high: number) {
  if (value == null) return 1;
  if (value <= low) return 0;
  if (value >= high) return 2;
  return 1;
}

function average(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function cloneRules(bucket: DiagnosisRuleBucket): DiagnosisRuleBucket {
  return {
    materials: [...bucket.materials],
    silhouettes: [...bucket.silhouettes],
    lengths: [...bucket.lengths],
    necklines: [...bucket.necklines],
    thickness: [...bucket.thickness],
    textures: [...bucket.textures],
    patterns: [...bucket.patterns],
    colors: [...bucket.colors],
  };
}

const BODY_TEMPLATE_RULES: Record<(typeof JP3_OPTIONS)[number], { recommended: DiagnosisRuleBucket; avoid: DiagnosisRuleBucket }> = {
  straight: {
    recommended: {
      materials: ["高密度コットン", "梳毛ウール", "ハリのあるツイル"],
      silhouettes: ["Iライン", "ジャストサイズ", "直線的なセットアップ"],
      lengths: ["標準丈", "腰位置が見える短めジャケット", "膝上で切れないミドル丈"],
      necklines: ["Vネック", "シャツカラー", "浅めのUネック"],
      thickness: ["中厚", "厚すぎないハリ感"],
      textures: ["なめらか", "フラット", "表面が整った素材"],
      patterns: ["無地", "細ストライプ", "控えめな幾何"],
      colors: [],
    },
    avoid: {
      materials: ["薄すぎるシフォン", "ふわふわ過多", "ざっくり粗編みだけ"],
      silhouettes: ["膨張するオーバーサイズ", "上半身に丸みが集中する形"],
      lengths: ["中途半端なボックス丈", "ヒップで止まる重い丈"],
      necklines: ["フリル襟", "詰まりすぎたハイネックのみ"],
      thickness: ["極端な厚盛り", "重ねすぎ"],
      textures: ["起毛しすぎ", "甘いギャザー感"],
      patterns: ["大ぶりフラワー", "盛りすぎディテール"],
      colors: [],
    },
  },
  wave: {
    recommended: {
      materials: ["落ち感のあるブラウス地", "薄手ニット", "軽いツイル"],
      silhouettes: ["コンパクトトップス", "ウエストマーク", "Xライン"],
      lengths: ["短め丈", "腰位置を高く見せる丈", "足首が見える軽さ"],
      necklines: ["ボートネック", "浅V", "コンパクトな丸首"],
      thickness: ["薄手", "軽量", "重く見えない層"],
      textures: ["やわらかい表面", "微光沢", "繊細な凹凸"],
      patterns: ["小さめ柄", "細かいドット", "やわらかな曲線柄"],
      colors: [],
    },
    avoid: {
      materials: ["重すぎるキャンバス", "硬い厚手デニム", "ごついレザー"],
      silhouettes: ["重い直線Iラインだけ", "腰位置が落ちるビッグシルエット"],
      lengths: ["ロング一辺倒", "重いフルレングスのみ"],
      necklines: ["首が詰まりすぎる厚手タートル", "大きすぎる開き"],
      thickness: ["厚盛り", "重量感が強い積層"],
      textures: ["粗野すぎる表面", "ハードすぎる凹凸"],
      patterns: ["大きすぎる柄", "重いブロック柄"],
      colors: [],
    },
  },
  natural: {
    recommended: {
      materials: ["リネン", "ざっくりニット", "ドライなウール"],
      silhouettes: ["ゆとりのある縦長", "ラフなストレート", "フレームを活かす余白"],
      lengths: ["ロング丈", "ヒップをまたぐ丈", "ざっくり羽織れる丈"],
      necklines: ["オープンカラー", "深めV", "ラフなクルー"],
      thickness: ["中厚から厚手", "素材感のある層"],
      textures: ["粗さのある表面", "ドライタッチ", "ムラ感"],
      patterns: ["大きめストライプ", "大胆な幾何", "ラフなチェック"],
      colors: [],
    },
    avoid: {
      materials: ["薄すぎるシアーだけ", "繊細すぎるサテンのみ", "かっちりしすぎる薄地"],
      silhouettes: ["ぴったりしすぎる細身", "余白のないコンパクト"],
      lengths: ["中途半端な短丈", "フレームを切るだけの丈"],
      necklines: ["小さすぎる丸首", "詰まりきった襟元"],
      thickness: ["頼りない薄さ", "骨感に負ける軽さ"],
      textures: ["つるつる一辺倒", "甘い細工だけ"],
      patterns: ["細かすぎる小紋", "装飾過多の小柄"],
      colors: [],
    },
  },
};

const ESSENCE_RULE_PATCH: Record<(typeof JP7_OPTIONS)[number], { recommended?: Partial<DiagnosisRuleBucket>; avoid?: Partial<DiagnosisRuleBucket> }> = {
  classic: {
    recommended: {
      silhouettes: ["端正なジャストフィット", "均整の取れたレイヤー"],
      patterns: ["細ストライプ", "控えめチェック"],
    },
  },
  casual: {
    recommended: {
      materials: ["デニム", "チノ", "洗いざらしコットン"],
      silhouettes: ["抜け感のあるレギュラー", "肩の力が抜けた重ね着"],
    },
  },
  dramatic: {
    recommended: {
      silhouettes: ["ロングIライン", "シャープな縦落ち"],
      necklines: ["深めV", "鋭いラペル"],
    },
    avoid: {
      silhouettes: ["甘い丸みだけ", "幼く見えるコンパクト"],
    },
  },
  high_fashion: {
    recommended: {
      silhouettes: ["モードなロング丈", "余白を活かすオーバーサイズ"],
      patterns: ["大胆なコントラスト", "グラフィカルな切り替え"],
    },
  },
  soft_classic: {
    recommended: {
      silhouettes: ["やわらかなジャストサイズ", "丸みのあるベーシック"],
      textures: ["なめらかな表面", "きれいめドレープ"],
    },
  },
  romantic: {
    recommended: {
      necklines: ["緩やかな曲線ネック", "やわらかな開き"],
      textures: ["しっとりした表面", "繊細な光沢"],
      patterns: ["曲線柄", "フローラル小柄"],
    },
  },
  lovely: {
    recommended: {
      lengths: ["コンパクト丈", "軽さの出る短め丈"],
      patterns: ["小さめ柄", "可憐な反復柄"],
    },
  },
};

const SEASON_RULES: Record<string, { label: string; base: "warm" | "cool"; recommended: string[]; avoid: string[] }> = {
  spring: {
    label: "Spring",
    base: "warm",
    recommended: ["アイボリー", "コーラル", "ライトキャメル", "ターコイズ"],
    avoid: ["青みの強い黒", "灰みの強いラベンダー", "くすみ過多のカーキ"],
  },
  summer: {
    label: "Summer",
    base: "cool",
    recommended: ["ローズピンク", "ラベンダー", "スカイブルー", "ソフトグレー"],
    avoid: ["黄みの強いオレンジ", "強すぎるカーキ", "硬いブラック"],
  },
  autumn: {
    label: "Autumn",
    base: "warm",
    recommended: ["テラコッタ", "オリーブ", "キャメル", "ブロンズ"],
    avoid: ["青白いパステル", "クリアすぎる白", "冷たいシルバー"],
  },
  winter: {
    label: "Winter",
    base: "cool",
    recommended: ["ブラック", "ピュアホワイト", "ロイヤルブルー", "マゼンタ"],
    avoid: ["黄みの強いベージュ", "ぼんやりしたアースカラー", "にごったパステル"],
  },
};

const FACE_SHAPE_NECKLINE_MAP: Record<string, { recommended: string[]; avoid: string[] }> = {
  round: { recommended: ["Vネック", "Uネック", "深めのスクエアネック"], avoid: ["クルーネック", "タートルネック"] },
  oval: { recommended: ["ほぼすべてのネックライン"], avoid: [] },
  oblong: { recommended: ["ボートネック", "ワイドネック", "オフショルダー"], avoid: ["Vネック", "深い開き"] },
  square: { recommended: ["ラウンドネック", "Uネック", "スクープネック"], avoid: ["スクエアネック"] },
  heart: { recommended: ["Vネック", "スクープネック"], avoid: ["ボートネック", "ワイドネック"] },
  inverted_triangle: { recommended: ["Uネック", "スクープネック", "丸首"], avoid: ["ボートネック", "オフショルダー"] },
};

const HAIR_LENGTH_STYLE_MAP: Record<string, { recommended_tops: string[]; notes: string }> = {
  veryshort: { recommended_tops: ["タートルネック", "ハイネック", "モックネック"], notes: "首元を活かしたデザインが映える" },
  short: { recommended_tops: ["クルーネック", "ハイネック", "シャツ襟"], notes: "首周りのディテールが見えやすい" },
  bob: { recommended_tops: ["ボートネック", "Vネック"], notes: "鎖骨ラインを見せるとバランスが良い" },
  medium: { recommended_tops: ["オープンカラー", "Vネック"], notes: "肩周りにゆとりのあるデザインと好相性" },
  semilong: { recommended_tops: ["Vネック", "ヘンリーネック"], notes: "縦ラインを強調するとスッキリ" },
  long: { recommended_tops: ["Vネック", "オフショルダー", "ワイドネック"], notes: "開きのあるネックラインで抜け感を" },
};

type DerivedMetrics = {
  legRatio: number | null;
  shoulderHipRatio: number | null;
  waistHipRatio: number | null;
  armRatio: number | null;
  riseRatio: number | null;
};

export function computeDerivedMetrics(measurementsInput: unknown): DerivedMetrics {
  const measurements = normalizeBodyMeasurements(measurementsInput);
  const stature = measurements.stature ?? null;
  const inseam = measurements.inseam ?? null;
  const shoulderBreadth = measurements.shoulder_breadth ?? null;
  const hipCirc = measurements.hip_circ ?? null;
  const waistCirc = measurements.waist_circ ?? null;
  const sleeveLength = measurements.sleeve_length ?? null;
  const rise = measurements.rise ?? null;
  return {
    legRatio: stature && inseam ? inseam / stature : null,
    shoulderHipRatio: shoulderBreadth && hipCirc ? shoulderBreadth / hipCirc : null,
    waistHipRatio: waistCirc && hipCirc ? waistCirc / hipCirc : null,
    armRatio: stature && sleeveLength ? sleeveLength / stature : null,
    riseRatio: stature && rise ? rise / stature : null,
  };
}

export function computeBodyAverageDrift(args: {
  measurements?: unknown;
  birthDate?: unknown;
  weightKg?: unknown;
}) {
  const measurements = normalizeBodyMeasurements(args.measurements);
  const stature = measurements.stature ?? null;
  const weightKg = readFiniteNumber(args.weightKg);
  const age = computeAgeFromBirthDate(args.birthDate);
  const statureBase = stature ?? 160;
  const weightDelta = weightKg == null ? 0 : (weightKg - 52) * 0.45;
  const ageFactor = age == null ? 0 : clamp((age - 28) / 18, -0.4, 0.6);

  const baselines: Array<{ key: string; label: string; average: number; mineNum: number | null }> = [
    {
      key: "shoulder_breadth",
      label: "肩幅",
      average: statureBase * 0.235 + ageFactor * 0.5,
      mineNum: measurements.shoulder_breadth ?? null,
    },
    {
      key: "chest_circ",
      label: "胸囲",
      average: statureBase * 0.515 + weightDelta,
      mineNum: measurements.chest_circ ?? null,
    },
    {
      key: "waist_circ",
      label: "ウエスト",
      average: statureBase * 0.41 + weightDelta * 0.7,
      mineNum: measurements.waist_circ ?? null,
    },
    {
      key: "hip_circ",
      label: "ヒップ",
      average: statureBase * 0.54 + weightDelta * 0.55,
      mineNum: measurements.hip_circ ?? null,
    },
    {
      key: "inseam",
      label: "股下",
      average: statureBase * 0.455,
      mineNum: measurements.inseam ?? null,
    },
    {
      key: "sleeve_length",
      label: "袖丈",
      average: statureBase * 0.355,
      mineNum: measurements.sleeve_length ?? null,
    },
  ];

  return {
    age,
    rows: baselines.map((row) => ({
      key: row.key,
      label: row.label,
      mineNum: row.mineNum,
      average: Number(row.average.toFixed(1)),
      diff: row.mineNum == null ? null : Number((row.mineNum - row.average).toFixed(1)),
    })) as BodyComparisonRow[],
  };
}

function coerceAxisValue(axes: Record<string, number>, key: string, fallback: number) {
  const value = axes[key];
  return typeof value === "number" && Number.isFinite(value) ? clamp(Math.round(value), 0, 2) : fallback;
}

function buildAxisSet(axesInput: unknown, measurementsInput: unknown) {
  const axes = normalizeBodyAxes(axesInput);
  const derived = computeDerivedMetrics(measurementsInput);

  const verticalLine = coerceAxisValue(axes, "vertical_line", toRatioBand(derived.legRatio, 0.44, 0.49));
  const shoulderWidth = coerceAxisValue(axes, "shoulder_width", toRatioBand(derived.shoulderHipRatio, 0.39, 0.45));
  const torsoDepth = coerceAxisValue(axes, "torso_depth", toRatioBand(derived.waistHipRatio, 0.72, 0.79));
  const legRatio = coerceAxisValue(axes, "leg_ratio", toRatioBand(derived.legRatio, 0.44, 0.49));
  const armRatio = coerceAxisValue(axes, "arm_ratio", toRatioBand(derived.armRatio, 0.33, 0.36));
  const waistPosition = coerceAxisValue(axes, "waist_position", toRatioBand(derived.riseRatio, 0.15, 0.165));

  return {
    vertical_line: verticalLine,
    shoulder_width: shoulderWidth,
    shoulder_slope: coerceAxisValue(axes, "shoulder_slope", 1),
    ribcage_width: coerceAxisValue(axes, "ribcage_width", shoulderWidth),
    torso_depth: torsoDepth,
    pelvis_width: coerceAxisValue(axes, "pelvis_width", shoulderWidth <= 0 ? 2 : 1),
    joint_size: coerceAxisValue(axes, "joint_size", 1),
    bone_sharpness: coerceAxisValue(axes, "bone_sharpness", 1),
    leg_ratio: legRatio,
    arm_ratio: armRatio,
    waist_position: waistPosition,
    posture_round_shoulders: coerceAxisValue(axes, "posture_round_shoulders", 1),
    pelvic_tilt: coerceAxisValue(axes, "pelvic_tilt", 1),
    mobility_upper: coerceAxisValue(axes, "mobility_upper", 1),
  };
}

function buildFactorMap(axisSet: ReturnType<typeof buildAxisSet>) {
  return {
    straight: [
      {
        key: "torso_depth",
        label: "胴の厚み",
        contribution: axisSet.torso_depth / 2,
        reason: "前後の厚みがあるほど、直線的で詰まりすぎない服が安定します。",
      },
      {
        key: "shoulder_width",
        label: "肩幅感",
        contribution: axisSet.shoulder_width / 2,
        reason: "肩フレームがあるほど、ハリのあるベーシックが映えやすくなります。",
      },
      {
        key: "vertical_line",
        label: "縦の長さ感",
        contribution: axisSet.vertical_line / 2,
        reason: "縦の伸びがあると I ラインの服がまとまりやすくなります。",
      },
    ],
    wave: [
      {
        key: "waist_position",
        label: "ウエスト位置",
        contribution: axisSet.waist_position / 2,
        reason: "腰位置が高いほど、コンパクトで軽い設計が似合いやすくなります。",
      },
      {
        key: "mobility_upper",
        label: "上半身可動感",
        contribution: axisSet.mobility_upper / 2,
        reason: "柔らかさがあるほど、落ち感や曲線ディテールが馴染みます。",
      },
      {
        key: "leg_ratio",
        label: "脚比率",
        contribution: axisSet.leg_ratio / 2,
        reason: "脚比率が高いと、丈を軽くしても全体バランスを保ちやすくなります。",
      },
    ],
    natural: [
      {
        key: "joint_size",
        label: "関節サイズ",
        contribution: axisSet.joint_size / 2,
        reason: "関節の骨感があるほど、素材感と余白のある服が自然に見えます。",
      },
      {
        key: "bone_sharpness",
        label: "骨の鋭さ",
        contribution: axisSet.bone_sharpness / 2,
        reason: "骨のフレームが見えると、ラフで立体的な服が馴染みます。",
      },
      {
        key: "pelvis_width",
        label: "骨盤幅",
        contribution: axisSet.pelvis_width / 2,
        reason: "腰回りのフレームがあると、ゆとりのあるシルエットが安定します。",
      },
    ],
  };
}

function deriveSeasonBase(colorProfile: unknown) {
  const profile = isRecord(colorProfile) ? colorProfile : {};
  const labels = isRecord(profile.labels) ? profile.labels : {};
  const cpv = isRecord(profile.cpv) ? profile.cpv : {};

  const seasonRaw =
    String(labels.season4 ?? labels.season ?? profile.pc_season ?? "")
      .trim()
      .toLowerCase() || null;

  const undertone = readFiniteNumber(cpv.undertone);
  let base: "warm" | "cool" | "neutral" | null = null;
  if (seasonRaw && seasonRaw in SEASON_RULES) {
    base = SEASON_RULES[seasonRaw].base;
  } else if (undertone != null) {
    if (undertone > 0.15) base = "warm";
    else if (undertone < -0.15) base = "cool";
    else base = "neutral";
  }

  return {
    season: seasonRaw,
    seasonLabel: seasonRaw && SEASON_RULES[seasonRaw] ? SEASON_RULES[seasonRaw].label : seasonRaw,
    base,
  };
}

function applyRulePatch(target: DiagnosisRuleBucket, patch: Partial<DiagnosisRuleBucket> | undefined) {
  if (!patch) return target;
  return {
    materials: uniqueList([...target.materials, ...(patch.materials ?? [])]),
    silhouettes: uniqueList([...target.silhouettes, ...(patch.silhouettes ?? [])]),
    lengths: uniqueList([...target.lengths, ...(patch.lengths ?? [])]),
    necklines: uniqueList([...target.necklines, ...(patch.necklines ?? [])]),
    thickness: uniqueList([...target.thickness, ...(patch.thickness ?? [])]),
    textures: uniqueList([...target.textures, ...(patch.textures ?? [])]),
    patterns: uniqueList([...target.patterns, ...(patch.patterns ?? [])]),
    colors: uniqueList([...target.colors, ...(patch.colors ?? [])]),
  };
}

export function buildMyStyleDiagnosis(args: {
  userId?: string | null;
  bodyProfile?: unknown;
  colorProfile?: unknown;
  measurements?: unknown;
  bodyUpdatedAt?: string | null;
  colorUpdatedAt?: string | null;
  facePhenotype?: { phenotype?: { face_shape?: { primary?: string } } | null; completed_categories?: string[] | null } | null;
  hairPhenotype?: { length?: string; texture?: string; color?: string } | null;
  faceType?: { primary_type?: string; warmth_score?: number; structure_score?: number } | null;
}) {
  const bodyProfile = isRecord(args.bodyProfile) ? args.bodyProfile : {};
  const measurements = normalizeBodyMeasurements(args.measurements);
  const axisSet = buildAxisSet(bodyProfile.cfv, measurements);
  const derived = computeDerivedMetrics(measurements);
  const comparison = computeBodyAverageDrift({
    measurements,
    birthDate: isRecord(bodyProfile.display_labels) ? bodyProfile.display_labels.birth_date : null,
    weightKg: isRecord(bodyProfile.display_labels) ? bodyProfile.display_labels.weight_kg : null,
  });

  const straightScore = average([
    axisSet.torso_depth / 2,
    axisSet.shoulder_width / 2,
    axisSet.vertical_line / 2,
    1 - Math.abs(axisSet.waist_position - 1) * 0.45,
    axisSet.joint_size >= 1 ? 0.7 : 0.45,
  ]);
  const waveScore = average([
    axisSet.waist_position / 2,
    axisSet.mobility_upper / 2,
    axisSet.leg_ratio / 2,
    1 - axisSet.shoulder_width / 2,
    1 - axisSet.torso_depth / 2,
  ]);
  const naturalScore = average([
    axisSet.joint_size / 2,
    axisSet.bone_sharpness / 2,
    axisSet.pelvis_width / 2,
    axisSet.shoulder_width / 2,
    axisSet.vertical_line >= 1 ? 0.7 : 0.45,
  ]);

  const typeScores = [
    { key: "straight" as const, score: straightScore },
    { key: "wave" as const, score: waveScore },
    { key: "natural" as const, score: naturalScore },
  ].sort((a, b) => b.score - a.score);

  const bestType = typeScores[0]?.key ?? "straight";
  const runnerUp = typeScores[1]?.score ?? 0;
  const separation = clamp((typeScores[0]?.score ?? 0) - runnerUp, 0, 1);

  let jp7: MyStyleDiagnosis["jp_7type"] = "classic";
  if (bestType === "straight") {
    if (axisSet.vertical_line >= 2 && axisSet.bone_sharpness >= 1) jp7 = "dramatic";
    else if (axisSet.shoulder_slope >= 2 || axisSet.mobility_upper >= 2) jp7 = "soft_classic";
    else jp7 = "classic";
  } else if (bestType === "wave") {
    if (axisSet.mobility_upper >= 2 && axisSet.bone_sharpness <= 1) jp7 = "romantic";
    else if (axisSet.waist_position >= 2 || axisSet.leg_ratio >= 2) jp7 = "lovely";
    else jp7 = "soft_classic";
  } else {
    if (axisSet.vertical_line >= 2 && axisSet.bone_sharpness >= 2) jp7 = "high_fashion";
    else if (axisSet.joint_size >= 2 || axisSet.pelvis_width >= 2) jp7 = "casual";
    else jp7 = "high_fashion";
  }

  const labels = isRecord(bodyProfile.display_labels) ? bodyProfile.display_labels : {};
  const overrideJp3 = String(labels.jp_3type_override ?? "").trim().toLowerCase();
  const overrideJp7 = String(labels.jp_7type_override ?? "").trim().toLowerCase();
  const appliedJp3 = (JP3_OPTIONS as readonly string[]).includes(overrideJp3) ? (overrideJp3 as MyStyleDiagnosis["jp_3type"]) : bestType;
  const appliedJp7 = (JP7_OPTIONS as readonly string[]).includes(overrideJp7) ? (overrideJp7 as MyStyleDiagnosis["jp_7type"]) : jp7;

  const completionScore = Math.round(
    clamp(
      (Object.keys(measurements).length / BODY_FIELD_DEFS.length) * 70 +
        (Object.keys(normalizeBodyAxes(bodyProfile.cfv)).length / BODY_AXIS_DEFS.length) * 30,
      0,
      100,
    ),
  );
  const qualityScore = Math.round(clamp(completionScore * 0.7 + separation * 30, 10, 99));
  const labelConfidence = Number(clamp(0.35 + completionScore / 200 + separation * 0.25, 0.4, 0.96).toFixed(3));

  const factors = buildFactorMap(axisSet)[appliedJp3]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((factor) => ({
      ...factor,
      contribution: Number(factor.contribution.toFixed(3)),
    }));

  const baseRules = BODY_TEMPLATE_RULES[appliedJp3];
  const recommended = applyRulePatch(cloneRules(baseRules.recommended), ESSENCE_RULE_PATCH[appliedJp7].recommended);
  const avoid = applyRulePatch(cloneRules(baseRules.avoid), ESSENCE_RULE_PATCH[appliedJp7].avoid);

  const seasonInfo = deriveSeasonBase(args.colorProfile);
  if (seasonInfo.season && SEASON_RULES[seasonInfo.season]) {
    recommended.colors = uniqueList([...recommended.colors, ...SEASON_RULES[seasonInfo.season].recommended]);
    avoid.colors = uniqueList([...avoid.colors, ...SEASON_RULES[seasonInfo.season].avoid]);
  } else if (seasonInfo.base === "warm") {
    recommended.colors = uniqueList([...recommended.colors, "アイボリー", "キャメル", "ウォームグレー"]);
    avoid.colors = uniqueList([...avoid.colors, "青みの強いブラック", "冷たいシルバー"]);
  } else if (seasonInfo.base === "cool") {
    recommended.colors = uniqueList([...recommended.colors, "ピュアホワイト", "ブルーグレー", "ネイビー"]);
    avoid.colors = uniqueList([...avoid.colors, "黄みの強いベージュ", "オレンジブラウン"]);
  }

  const seasonPhrase = seasonInfo.seasonLabel ? `${seasonInfo.seasonLabel}(${seasonInfo.base ?? "-"})` : "カラー未入力";
  const headline = `${JP3_LABELS[appliedJp3]} × ${JP7_LABELS[appliedJp7]} / ${seasonPhrase}`;
  const description = [
    `${JP3_LABELS[appliedJp3]}の骨格傾向をベースに、${JP7_LABELS[appliedJp7]}寄りの見え方で組み立てています。`,
    seasonInfo.seasonLabel
      ? `${seasonInfo.seasonLabel} の色域を優先すると、素材と色の両方でまとまりやすくなります。`
      : "カラー未入力のため、色は仮置きの推奨です。",
    comparison.rows[0]?.diff != null
      ? `平均との差分は参考比較として扱い、丈・余白・素材厚の調整に反映しています。`
      : "平均との差分は入力が揃うと自動で精度が上がります。",
  ].join(" ");

  // --- Face-aware neckline rules ---
  const facePhenotype = args.facePhenotype ?? null;
  const faceShape = facePhenotype?.phenotype?.face_shape?.primary?.toLowerCase() ?? null;
  const faceNecklineEntry = faceShape ? FACE_SHAPE_NECKLINE_MAP[faceShape] ?? null : null;
  const faceAwareRules = faceNecklineEntry
    ? {
        recommended_necklines: faceNecklineEntry.recommended,
        avoid_necklines: faceNecklineEntry.avoid,
        face_shape: faceShape,
      }
    : undefined;

  // Merge face-aware necklines into main style_rules
  if (faceNecklineEntry) {
    recommended.necklines = uniqueList([...recommended.necklines, ...faceNecklineEntry.recommended]);
    avoid.necklines = uniqueList([...avoid.necklines, ...faceNecklineEntry.avoid]);
  }

  // --- Hair-aware top style rules ---
  const hairPhenotype = args.hairPhenotype ?? null;
  const hairLength = hairPhenotype?.length?.toLowerCase() ?? null;
  const hairStyleEntry = hairLength ? HAIR_LENGTH_STYLE_MAP[hairLength] ?? null : null;
  const hairAwareRules = hairStyleEntry
    ? {
        recommended_top_styles: hairStyleEntry.recommended_tops,
        notes: hairStyleEntry.notes,
        hair_length: hairLength,
      }
    : undefined;

  // --- Warmth-based color adjustment ---
  const faceTypeData = args.faceType ?? null;
  const warmthScore = faceTypeData?.warmth_score ?? null;
  let colorWarmthAdjustment: "warm_boost" | "cool_boost" | null = null;
  if (warmthScore != null) {
    if (warmthScore > 0.3) {
      colorWarmthAdjustment = "warm_boost";
      recommended.colors = uniqueList([...recommended.colors, "アイボリー", "コーラル", "キャメル"]);
    } else if (warmthScore < -0.3) {
      colorWarmthAdjustment = "cool_boost";
      recommended.colors = uniqueList([...recommended.colors, "ピュアホワイト", "ブルーグレー", "ラベンダー"]);
    }
  }

  const idSeed = `${args.userId ?? "guest"}:${args.bodyUpdatedAt ?? "body"}:${args.colorUpdatedAt ?? "color"}`;
  const generatedAt = new Date().toISOString();

  return {
    id: idSeed,
    generated_at: generatedAt,
    updated_at: generatedAt,
    jp_3type: appliedJp3,
    jp_3type_label: JP3_LABELS[appliedJp3],
    jp_7type: appliedJp7,
    jp_7type_label: JP7_LABELS[appliedJp7],
    label_confidence: labelConfidence,
    quality_score: qualityScore,
    pc_season: seasonInfo.season,
    pc_season_label: seasonInfo.seasonLabel,
    pc_base: seasonInfo.base,
    summary: {
      headline,
      description,
      top_factors: factors,
    },
    style_rules: {
      recommended,
      avoid,
    },
    face_aware_rules: faceAwareRules,
    hair_aware_rules: hairAwareRules,
    color_warmth_adjustment: colorWarmthAdjustment,
  } satisfies MyStyleDiagnosis;
}

