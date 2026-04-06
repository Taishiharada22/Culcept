/**
 * baselineContext.ts — Baseline Context Normalization Layer (④-C)
 *
 * Raw demographic data (gender, DOB, prefecture) を Alter が安全に利用できる
 * 正規化されたコンテキストに変換する。
 *
 * 設計原則:
 * - demographics → life_stage / gender_mode / area_type の3層に変換
 * - ステレオタイプ強化の防止（ガードレール内蔵）
 * - relevance scoring: ドメインごとに high/medium/low で注入量を制御
 * - prefer_not_to_say は完全に尊重（null 扱い、推論なし）
 * - teen（未成年）セーフガード: 恋愛・性的文脈を自動抑制
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type Gender = "male" | "female" | "non_binary" | "prefer_not_to_say";

/**
 * 詳細ライフステージ — 年齢だけでなく社会的文脈を反映
 * school_or_work_status が提供されれば、年齢推定よりそちらを優先する
 */
export type LifeStage =
  | "junior_high"       // 13-15: 中学生
  | "high_school"       // 16-18: 高校生
  | "university"        // 19-22: 大学・専門学校
  | "new_grad"          // 23-25: 新卒・社会参入期
  | "working_adult"     // 26-34: 社会人（キャリア形成期）
  | "established"       // 35-44: 成熟期
  | "mature"            // 45-54: 再評価期
  | "senior";           // 55+: 統合期

/** 上位分類: school_centered / transition_phase / work_centered */
export type SocialPhase =
  | "school_centered"     // junior_high, high_school
  | "transition_phase"    // university, new_grad
  | "work_centered";      // working_adult, established, mature, senior

/** 法的段階 */
export type LegalStage = "minor" | "adult";

export type GenderMode =
  | "masculine_typical"
  | "feminine_typical"
  | "non_binary_fluid"
  | "undisclosed";

export type AreaType =
  | "metro"       // 東京23区, 大阪市, 名古屋市 etc.
  | "urban"       // 政令指定都市・県庁所在地
  | "suburban"    // 首都圏・近畿圏の郊外
  | "regional"    // 地方都市
  | "rural"       // 町村部
  | "unknown";

/** 移動手段の傾向 */
export type MobilityContext =
  | "walk_train"       // 徒歩+公共交通メイン
  | "car_dependent"    // 車メイン
  | "mixed"            // 混合
  | "unknown";

export type RelevanceLevel = "high" | "medium" | "low" | "none";

/** 環境文脈タグ */
export type EnvironmentTag =
  | "commute_heavy"            // 通勤・通学に時間がかかりやすい
  | "local_visibility_high"    // 地域コミュニティの可視性が高い
  | "late_night_constraint"    // 夜間行動の選択肢が限られる
  | "community_density_high"   // 人間関係密度が高い
  | "weather_constraint"       // 天候が生活に影響しやすい
  | "choice_abundance";        // 選択肢が豊富

/** Alter が使う正規化済みベースラインコンテキスト */
export interface BaselineContext {
  lifeStage: LifeStage | null;
  socialPhase: SocialPhase | null;
  legalStage: LegalStage | null;
  age: number | null;
  genderMode: GenderMode;
  areaType: AreaType;
  mobilityContext: MobilityContext;
  environmentTags: EnvironmentTag[];
  prefecture: string | null;
  /** teen セーフガードが有効かどうか */
  isMinor: boolean;
}

/** ドメイン別の relevance 判定結果 */
export interface BaselineRelevance {
  lifeStage: RelevanceLevel;
  gender: RelevanceLevel;
  area: RelevanceLevel;
}

// 入力型
export interface BaselineInput {
  gender?: Gender | null;
  dateOfBirth?: string | Date | null;  // ISO string or Date
  prefecture?: string | null;
  /** 明示的自己申告（年齢推定より優先） */
  schoolOrWorkStatus?: "junior_high" | "high_school" | "vocational" | "university" | "working" | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 大都市圏の都道府県 */
const METRO_PREFECTURES = new Set([
  "東京都",
]);

/** 都市部に分類される県 */
const URBAN_PREFECTURES = new Set([
  "神奈川県", "大阪府", "愛知県", "福岡県",
  "北海道", "京都府", "兵庫県", "広島県",
  "宮城県",
]);

/** 首都圏・近畿圏郊外 */
const SUBURBAN_PREFECTURES = new Set([
  "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県",
  "奈良県", "滋賀県", "和歌山県", "三重県",
]);

/** 降雪・天候制約が強い県 */
const WEATHER_CONSTRAINT_PREFECTURES = new Set([
  "北海道", "青森県", "岩手県", "秋田県", "山形県",
  "新潟県", "富山県", "石川県", "福井県", "長野県",
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core: deriveBaselineContext
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Raw baseline data を正規化されたコンテキストに変換する。
 * prefer_not_to_say やデータ欠損は安全にフォールバックする。
 */
export function deriveBaselineContext(input: BaselineInput): BaselineContext {
  const age = computeAge(input.dateOfBirth);
  const lifeStage = deriveLifeStageDetailed(age, input.schoolOrWorkStatus);
  const socialPhase = lifeStage ? deriveSocialPhase(lifeStage) : null;
  const legalStage = age !== null ? deriveLegalStage(age) : null;
  const genderMode = deriveGenderMode(input.gender);
  const areaType = deriveAreaType(input.prefecture);
  const mobilityContext = deriveMobilityContext(areaType);
  const environmentTags = deriveEnvironmentTags(areaType, input.prefecture);
  const isMinor = legalStage === "minor" || socialPhase === "school_centered";

  return {
    lifeStage,
    socialPhase,
    legalStage,
    age,
    genderMode,
    areaType,
    mobilityContext,
    environmentTags,
    prefecture: input.prefecture ?? null,
    isMinor,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Teen Safeguard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 未成年セーフガード: ドメインに応じてベースラインの注入自体を抑制する。
 *
 * - relationship ドメイン: 恋愛は学校・SNS・同級生前提に限定。性的文脈は完全禁止
 * - career ドメイン: 注入OK（進路相談は有用）
 * - lifestyle/health: 注入OK（ただしガードレール付加）
 * - general/self_understanding: 注入OK
 *
 * @returns true = 注入を許可, false = 注入を抑制
 */
export function shouldInjectBaseline(
  context: BaselineContext,
  domain: QueryDomainForBaseline,
): boolean {
  // 未成年でなければ常に許可
  if (!context.isMinor) return true;

  // 未成年でも全ドメインで注入は許可する（ガードレールで制御）
  return true;
}

/**
 * 未成年の場合に追加するガードレール行を生成する。
 */
export function buildTeenSafeguardLines(context: BaselineContext, domain: QueryDomainForBaseline): string[] {
  if (!context.isMinor) return [];

  const lines: string[] = [];
  lines.push("");
  lines.push("## 未成年保護ガードレール（最優先で厳守）");
  lines.push("- このユーザーは未成年である。以下のルールは他の全ての指示に優先する");
  lines.push("- 性的な文脈・表現・助言は一切禁止");
  lines.push("- 「攻めろ」「押せ」などの積極的アプローチ助言を抑制する");
  lines.push("- 恋愛相談では学校生活・SNS・同級生の距離感・噂の広がりを前提にする");
  lines.push("- 金銭負担の大きい提案を避ける");
  lines.push("- 保護者・学校・安全の観点を必要に応じて考慮する");
  lines.push("- 夜間外出・1対1の密室的状況への誘導を含む提案は禁止");

  if (domain === "relationship") {
    lines.push("- 恋愛の助言は「境界線の引き方」「安全な距離感」「対等な関係」を軸にする");
    lines.push("- 年齢差のある関係への肯定的助言は禁止");
  }

  if (domain === "career") {
    lines.push("- 進路は「まだ試行の幅がある」前提で返す。決めつけない");
    lines.push("- 平日日中の可動性を低く見積もる（学校が前提）");
  }

  return lines;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Relevance Scoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type QueryDomainForBaseline =
  | "career"
  | "relationship"
  | "lifestyle"
  | "health"
  | "self_understanding"
  | "general";

/**
 * ドメインごとにベースライン要素の relevance を判定する。
 * high → プロンプトに明示的に注入
 * medium → 間接的参照（「この年代では〜」程度）
 * low → 注入しない（性格データのみで判断）
 * none → データ不存在
 */
export function scoreBaselineRelevance(
  context: BaselineContext,
  domain: QueryDomainForBaseline,
): BaselineRelevance {
  // life_stage の relevance
  const lifeStageRelevance: RelevanceLevel = (() => {
    if (!context.lifeStage) return "none";
    switch (domain) {
      case "career":
      case "relationship":
        return "high";
      case "lifestyle":
      case "health":
        return "medium";
      case "self_understanding":
      case "general":
        return "low";
      default:
        return "low";
    }
  })();

  // gender の relevance
  const genderRelevance: RelevanceLevel = (() => {
    if (context.genderMode === "undisclosed") return "none";
    switch (domain) {
      case "relationship":
        return "high";
      case "health":
        return "medium";
      case "career":
      case "lifestyle":
        return "low";
      case "self_understanding":
      case "general":
        return "low";
      default:
        return "low";
    }
  })();

  // area の relevance
  const areaRelevance: RelevanceLevel = (() => {
    if (context.areaType === "unknown") return "none";
    switch (domain) {
      case "lifestyle":
        return "high";
      case "career":
      case "relationship":
        return "medium";
      case "health":
      case "self_understanding":
      case "general":
        return "low";
      default:
        return "low";
    }
  })();

  return {
    lifeStage: lifeStageRelevance,
    gender: genderRelevance,
    area: areaRelevance,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Section Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * BaselineContext + relevance から、Alter プロンプトに注入するセクションを生成する。
 * relevance が low/none の要素は注入しない。
 *
 * ガードレール:
 * - 性別ステレオタイプ表現の禁止指示を常に付加
 * - 年齢による「〜すべき」表現の禁止
 * - 地域差別表現の禁止
 * - 未成年の場合は teen safeguard を追加
 */
export function buildBaselinePromptSection(
  context: BaselineContext,
  relevance: BaselineRelevance,
  domain?: QueryDomainForBaseline,
): string[] {
  const lines: string[] = [];
  const hasAny =
    relevance.lifeStage === "high" || relevance.lifeStage === "medium" ||
    relevance.gender === "high" || relevance.gender === "medium" ||
    relevance.area === "high" || relevance.area === "medium";

  if (!hasAny) return [];

  lines.push("");
  lines.push("# この人の生活文脈（ベースライン）");

  // Life stage
  if (relevance.lifeStage === "high" || relevance.lifeStage === "medium") {
    const desc = describeLifeStage(context.lifeStage, context.age);
    if (desc) {
      lines.push(`- ライフステージ: ${desc}`);
    }
  }

  // Gender
  if (relevance.gender === "high" || relevance.gender === "medium") {
    const desc = describeGenderMode(context.genderMode);
    if (desc) {
      lines.push(`- 性別的文脈: ${desc}`);
    }
  }

  // Area (with mobility & environment)
  if (relevance.area === "high" || relevance.area === "medium") {
    const desc = describeAreaType(context.areaType, context.prefecture);
    if (desc) {
      lines.push(`- 生活圏: ${desc}`);
    }
    const mobilityDesc = describeMobilityContext(context.mobilityContext);
    if (mobilityDesc) {
      lines.push(`- 移動手段: ${mobilityDesc}`);
    }
    if (context.environmentTags.length > 0) {
      const tagDescs = context.environmentTags.map(describeEnvironmentTag).filter(Boolean);
      if (tagDescs.length > 0) {
        lines.push(`- 環境特性: ${tagDescs.join("、")}`);
      }
    }
  }

  // ━━━━ Guard Rails ━━━━
  lines.push("");
  lines.push("## ベースライン使用制約（厳守）");
  lines.push("- 上記の文脈は「判断の背景情報」としてのみ使用する");
  lines.push("- 性別に基づくステレオタイプ的な提案は禁止（「男だから〜」「女性なら〜」は絶対不可）");
  lines.push("- 年齢に基づく「〜すべき」「〜が普通」という表現は禁止");
  lines.push("- 地域に基づく価値判断は禁止（「都会だから」「田舎だから」で結論を出さない）");
  lines.push("- 居住地から思想・政治性・保守/進歩を推定しない");
  lines.push("- ベースラインデータを直接言及しない（「あなたは30代なので」とは言わない）");
  lines.push("- 判断は常に性格データ（Stargazer観測結果）を主軸にし、ベースラインは補助的に使う");

  // ━━━━ Teen Safeguard ━━━━
  const teenLines = buildTeenSafeguardLines(context, domain ?? "general");
  lines.push(...teenLines);

  return lines;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal: Derivation Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function computeAge(dateOfBirth?: string | Date | null): number | null {
  if (!dateOfBirth) return null;
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  if (isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

/**
 * 詳細ライフステージ導出
 * 優先順位: 明示的自己申告 > 年齢からの推定
 */
export function deriveLifeStageDetailed(
  age: number | null,
  schoolOrWorkStatus?: "junior_high" | "high_school" | "vocational" | "university" | "working" | null,
): LifeStage | null {
  // 明示的自己申告がある場合はそちらを優先
  if (schoolOrWorkStatus) {
    switch (schoolOrWorkStatus) {
      case "junior_high": return "junior_high";
      case "high_school": return "high_school";
      case "vocational":
      case "university": return "university";
      case "working": return "working_adult";
    }
  }

  // 年齢からの推定
  if (age === null) return null;
  if (age <= 15) return "junior_high";
  if (age <= 18) return "high_school";
  if (age <= 22) return "university";
  if (age <= 25) return "new_grad";
  if (age <= 34) return "working_adult";
  if (age <= 44) return "established";
  if (age <= 54) return "mature";
  return "senior";
}

export function deriveSocialPhase(stage: LifeStage): SocialPhase {
  switch (stage) {
    case "junior_high":
    case "high_school":
      return "school_centered";
    case "university":
    case "new_grad":
      return "transition_phase";
    case "working_adult":
    case "established":
    case "mature":
    case "senior":
      return "work_centered";
  }
}

export function deriveLegalStage(age: number): LegalStage {
  return age < 18 ? "minor" : "adult";
}

export function deriveGenderMode(gender?: Gender | null): GenderMode {
  if (!gender || gender === "prefer_not_to_say") return "undisclosed";
  switch (gender) {
    case "male": return "masculine_typical";
    case "female": return "feminine_typical";
    case "non_binary": return "non_binary_fluid";
    default: return "undisclosed";
  }
}

export function deriveAreaType(prefecture?: string | null): AreaType {
  if (!prefecture) return "unknown";
  if (METRO_PREFECTURES.has(prefecture)) return "metro";
  if (URBAN_PREFECTURES.has(prefecture)) return "urban";
  if (SUBURBAN_PREFECTURES.has(prefecture)) return "suburban";
  // 残りは regional（地方都市）として扱う。
  // 町村レベルの判定は prefecture 単位では不可能なため regional にフォールバック
  return "regional";
}

export function deriveMobilityContext(areaType: AreaType): MobilityContext {
  switch (areaType) {
    case "metro":
      return "walk_train";
    case "urban":
      return "walk_train";
    case "suburban":
      return "mixed";
    case "regional":
      return "car_dependent";
    case "rural":
      return "car_dependent";
    case "unknown":
      return "unknown";
  }
}

export function deriveEnvironmentTags(areaType: AreaType, prefecture?: string | null): EnvironmentTag[] {
  const tags: EnvironmentTag[] = [];

  switch (areaType) {
    case "metro":
      tags.push("choice_abundance");
      tags.push("commute_heavy");
      break;
    case "urban":
      tags.push("choice_abundance");
      break;
    case "suburban":
      tags.push("commute_heavy");
      break;
    case "regional":
      tags.push("local_visibility_high");
      tags.push("late_night_constraint");
      tags.push("community_density_high");
      break;
    case "rural":
      tags.push("local_visibility_high");
      tags.push("late_night_constraint");
      tags.push("community_density_high");
      break;
  }

  if (prefecture && WEATHER_CONSTRAINT_PREFECTURES.has(prefecture)) {
    tags.push("weather_constraint");
  }

  return tags;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal: Description Generators
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function describeLifeStage(stage: LifeStage | null, age: number | null): string | null {
  if (!stage) return null;
  const ageStr = age !== null ? `${age}歳` : "";

  switch (stage) {
    case "junior_high":
      return `${ageStr}・中学生期（学校・部活・友人関係が生活の中心）`;
    case "high_school":
      return `${ageStr}・高校生期（進路選択・自己形成の途上、行動範囲が広がる時期）`;
    case "university":
      return `${ageStr}・大学/専門学校期（自由度が高まり、試行錯誤できる時期）`;
    case "new_grad":
      return `${ageStr}・社会参入期（キャリア初期・人間関係の再構築・自立の始まり）`;
    case "working_adult":
      return `${ageStr}・キャリア形成期（仕事と生活のバランスが課題になる時期）`;
    case "established":
      return `${ageStr}・成熟期（責任と選択の重みが増す時期）`;
    case "mature":
      return `${ageStr}・再評価期（人生の折り返しで価値観が変わりうる時期）`;
    case "senior":
      return `${ageStr}・統合期（経験を統合し次世代に伝える時期）`;
    default:
      return null;
  }
}

function describeGenderMode(mode: GenderMode): string | null {
  switch (mode) {
    case "masculine_typical":
      return "男性（性別的文脈を背景情報としてのみ参照）";
    case "feminine_typical":
      return "女性（性別的文脈を背景情報としてのみ参照）";
    case "non_binary_fluid":
      return "ノンバイナリー（性別による分類を前提としない）";
    case "undisclosed":
      return null; // 非開示 → 注入しない
    default:
      return null;
  }
}

function describeAreaType(areaType: AreaType, prefecture?: string | null): string | null {
  const prefStr = prefecture ? `${prefecture}` : "";
  switch (areaType) {
    case "metro":
      return `${prefStr}（大都市圏・選択肢と刺激が多い環境）`;
    case "urban":
      return `${prefStr}（都市部・一定の選択肢がある環境）`;
    case "suburban":
      return `${prefStr}（郊外・都市へのアクセスがある生活圏）`;
    case "regional":
      return `${prefStr}（地方・地域コミュニティとの接点が多い環境）`;
    case "rural":
      return `${prefStr}（地方・物理的距離が選択に影響しうる環境）`;
    case "unknown":
      return null;
    default:
      return null;
  }
}

function describeMobilityContext(mobility: MobilityContext): string | null {
  switch (mobility) {
    case "walk_train":
      return "徒歩+電車中心（公共交通で行動範囲が広い）";
    case "car_dependent":
      return "車中心（移動に車が前提、行動範囲が車に依存）";
    case "mixed":
      return "混合（公共交通と車の両方を使い分け）";
    case "unknown":
      return null;
  }
}

function describeEnvironmentTag(tag: EnvironmentTag): string | null {
  switch (tag) {
    case "commute_heavy":
      return "通勤・通学に時間がかかりやすい";
    case "local_visibility_high":
      return "地域の人間関係の可視性が高い";
    case "late_night_constraint":
      return "夜間の行動選択肢が限られる";
    case "community_density_high":
      return "コミュニティ内の関係密度が高い";
    case "weather_constraint":
      return "天候が生活に影響しやすい";
    case "choice_abundance":
      return "活動の選択肢が豊富";
    default:
      return null;
  }
}
