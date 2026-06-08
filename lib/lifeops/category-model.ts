/**
 * Life Ops L-1 — 生活行動カテゴリ模型（身体・外見メンテ）（**pure・no-DB・no-external-API・no-UI**・barrel 非 export）
 *
 * 設計: docs/life-ops-l1-category-model-mini-design.md / docs/life-ops-boundary-and-handoff.md §2 L-1・§4・§5・Appendix A
 *
 * 役割: 生活行動カテゴリの **正本語彙（辞書）** を pure 型＋定数で定義する。Life Ops 縦トラックの最初の slice。
 *   ここは「カテゴリが何か」だけ。due 判定 / 周期 cadence(L-2) / 候補生成(L-3) / 予約(L-6) / Permission 表(L-7) / UI(L-8) は持たない。
 *   横エンジン（lib/plan/reality/* の R1/R2/R4/R5）を **import しない**（統合は L-3 が §4 LifeOpsCandidate 経由で行う）。
 *
 * 厳守:
 *   - pure・deterministic・no-DB・no-external-API・no-UI・**新規データ収集なし**。barrel 非 export。
 *   - **「やるべき/due」を断定しない**（中立な語彙）。実行レベルは **非正本ヒント**（正本 Level は横 R5・実表は L-7）。
 *   - **health_sensitive**（medication/dental/health_check/eye_care）= 後続が医学的助言/健康効果断定/処方薬の自動提案を抑止する種。
 *   - beauty_salon は menu 別 sub-cadence（カット/カラー/トリートメント）を **持たない**（L-2 が担う）。
 */

/** 生活行動の大分類（Appendix A.6 の 6 群。L-1 は body_appearance のみ spec 定義・他群は将来 union 追加）。 */
export type LifeOpsCategoryGroup =
  | "body_appearance"
  | "daily_upkeep"
  | "pre_event_prep"
  | "money_admin"
  | "relationship"
  | "growth";

/** 身体・外見メンテ群の生活行動カテゴリ（A.6 群 1）。 */
export type BodyAppearanceCategoryId =
  | "beauty_salon" // 美容院（カット/カラー/トリートメント。menu 別 sub-cadence は L-2）
  | "eyebrow"
  | "nail"
  | "eyelash"
  | "hair_removal"
  | "bodywork"
  | "dental"
  | "health_check"
  | "eye_care"
  | "medication";

/** 予定前準備群（A.6 群 3・L-4(b)）。周期のない one-shot 準備。 */
export type PreEventPrepCategoryId =
  | "outfit_prep" // 服の準備
  | "document_prep" // 資料の準備
  | "packing" // 荷造り
  | "ticket_hotel_check" // チケット・宿の確認
  | "belongings_check"; // 持ち物の確認

/** 生活維持群（A.6 群 2・補充系）。消費ペースの補充周期を持つ（cyclic=true）。家事/ゴミ出し/不定期は後続。 */
export type DailyUpkeepCategoryId =
  | "groceries" // 食料品の買い物
  | "daily_necessities"; // 日用品の補充

/** お金・契約・事務群（A.6 群 4・期限もの）。期日からの逆算（deadline model）。recurring(家賃/クレカ/サブスク)は後続。 */
export type MoneyAdminCategoryId =
  | "license_renewal" // 免許の更新
  | "passport_renewal" // パスポートの更新
  | "tax_filing"; // 確定申告

/** L-1 で扱う全カテゴリ id（将来は他群の id を union 追加）。 */
export type LifeOpsCategoryId =
  | BodyAppearanceCategoryId
  | PreEventPrepCategoryId
  | DailyUpkeepCategoryId
  | MoneyAdminCategoryId;

/**
 * 既定実行レベル上限の **ヒント**（A.5 L0–L5 の段階）。**正本ではない**:
 *   汎用 Level の正本は横 R5・カテゴリ別 Permission 表は L-7。本値は L-7 が出発点に使う中立ヒント。
 *   L0 記録のみ / L1 時期通知 / L2 候補提案 / L3 予約導線まで誘導 / L4 入力補助(確定は本人) / L5 許可範囲内 自動予約。
 */
export type LifeOpsDefaultMaxLevelHint = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

/** 自動予約を抑止すべきリスク要因（A.4 ＋ 医療センシティブ）。立つカテゴリは Phase3-4 で確認画面必須＝stop gate の種。 */
export type LifeOpsRiskFlag =
  | "first_visit" // 初回店舗
  | "high_cost" // 高額メニュー
  | "cancellation_fee" // キャンセル料
  | "personal_info" // 個人情報入力
  | "card_required" // クレカ登録
  | "nomination" // 指名
  | "long_session" // 施術長時間
  | "far_location" // 遠方
  | "appearance_change" // 外見の大きな変更
  | "health_sensitive"; // 医療/健康系: 医学的助言/健康効果断定/処方薬自動 を後続で抑止する種

/** カテゴリ 1 件（中立な語彙。due/「やるべき」は持たない＝L-3 の責務）。 */
export interface LifeOpsCategorySpec {
  readonly id: LifeOpsCategoryId;
  readonly group: LifeOpsCategoryGroup;
  readonly label: string;
  readonly cyclic: boolean;
  readonly defaultMaxLevelHint: LifeOpsDefaultMaxLevelHint;
  readonly typicalRiskFlags: readonly LifeOpsRiskFlag[];
  readonly placeQueryHint: string | null;
  readonly mvp: boolean;
}

/**
 * 身体・外見メンテ群（A.6 群 1）。level は cosmetic=L3 / medical=L1–2 で原則分離:
 *   美容・wellness は予約導線(L3)まで可（riskFlag が auto を阻止）。医療は通知/候補(L1–2)のみ＝人間制御を厚く。
 */
const BODY_APPEARANCE: readonly LifeOpsCategorySpec[] = [
  { id: "beauty_salon", group: "body_appearance", label: "美容院", cyclic: true, defaultMaxLevelHint: "L3", typicalRiskFlags: ["appearance_change", "nomination", "personal_info"], placeQueryHint: "美容室", mvp: true },
  { id: "eyebrow", group: "body_appearance", label: "眉", cyclic: true, defaultMaxLevelHint: "L3", typicalRiskFlags: ["personal_info"], placeQueryHint: "眉サロン", mvp: true },
  { id: "nail", group: "body_appearance", label: "ネイル", cyclic: true, defaultMaxLevelHint: "L3", typicalRiskFlags: ["personal_info", "long_session"], placeQueryHint: "ネイルサロン", mvp: false },
  { id: "eyelash", group: "body_appearance", label: "まつ毛", cyclic: true, defaultMaxLevelHint: "L3", typicalRiskFlags: ["personal_info"], placeQueryHint: "まつ毛サロン", mvp: false },
  { id: "hair_removal", group: "body_appearance", label: "脱毛", cyclic: true, defaultMaxLevelHint: "L3", typicalRiskFlags: ["high_cost", "cancellation_fee", "personal_info", "card_required"], placeQueryHint: "脱毛サロン", mvp: false },
  { id: "bodywork", group: "body_appearance", label: "整体・マッサージ", cyclic: true, defaultMaxLevelHint: "L3", typicalRiskFlags: ["personal_info"], placeQueryHint: "整体", mvp: false },
  { id: "dental", group: "body_appearance", label: "歯医者", cyclic: true, defaultMaxLevelHint: "L2", typicalRiskFlags: ["personal_info", "health_sensitive"], placeQueryHint: "歯科", mvp: false },
  { id: "health_check", group: "body_appearance", label: "健康診断", cyclic: true, defaultMaxLevelHint: "L1", typicalRiskFlags: ["personal_info", "health_sensitive"], placeQueryHint: "健診", mvp: false },
  { id: "eye_care", group: "body_appearance", label: "眼科・コンタクト", cyclic: true, defaultMaxLevelHint: "L2", typicalRiskFlags: ["personal_info", "health_sensitive"], placeQueryHint: "眼科", mvp: false },
  { id: "medication", group: "body_appearance", label: "薬・サプリ補充", cyclic: true, defaultMaxLevelHint: "L1", typicalRiskFlags: ["health_sensitive"], placeQueryHint: null, mvp: false },
];

/**
 * 予定前準備群（A.6 群 3・L-4(b)）。**one-shot 準備**（周期なし・cyclic=false）。
 *   全て L1（リマインド中心）・購入/店舗検索なし（placeQueryHint=null）。「買う」導線は L-6（CEO ゲート）。
 */
const PRE_EVENT_PREP: readonly LifeOpsCategorySpec[] = [
  { id: "outfit_prep", group: "pre_event_prep", label: "服の準備", cyclic: false, defaultMaxLevelHint: "L1", typicalRiskFlags: [], placeQueryHint: null, mvp: false },
  { id: "document_prep", group: "pre_event_prep", label: "資料の準備", cyclic: false, defaultMaxLevelHint: "L1", typicalRiskFlags: [], placeQueryHint: null, mvp: false },
  { id: "packing", group: "pre_event_prep", label: "荷造り", cyclic: false, defaultMaxLevelHint: "L1", typicalRiskFlags: [], placeQueryHint: null, mvp: false },
  { id: "ticket_hotel_check", group: "pre_event_prep", label: "チケット・宿の確認", cyclic: false, defaultMaxLevelHint: "L1", typicalRiskFlags: [], placeQueryHint: null, mvp: false },
  { id: "belongings_check", group: "pre_event_prep", label: "持ち物の確認", cyclic: false, defaultMaxLevelHint: "L1", typicalRiskFlags: [], placeQueryHint: null, mvp: false },
];

/**
 * 生活維持群（A.6 群 2・A.8）。**補充系**（消費ペースの補充周期＝cyclic=true）。
 *   L2（買い物候補/補充リマインド・A.8）。購入導線は L-6（CEO ゲート）。家事/ゴミ出し/不定期は後続。
 */
const DAILY_UPKEEP: readonly LifeOpsCategorySpec[] = [
  { id: "groceries", group: "daily_upkeep", label: "食料品の買い物", cyclic: true, defaultMaxLevelHint: "L2", typicalRiskFlags: [], placeQueryHint: "スーパー", mvp: false },
  { id: "daily_necessities", group: "daily_upkeep", label: "日用品の補充", cyclic: true, defaultMaxLevelHint: "L2", typicalRiskFlags: [], placeQueryHint: "ドラッグストア", mvp: false },
];

/**
 * お金・契約・事務群（A.6 群 4・A.8）。**期限もの**（期日からの逆算＝deadline model・cyclic=false）。
 *   L1（通知中心・A.8「家賃/税金=通知確認のみ」）。recurring（家賃/クレカ/サブスク）は後続。
 */
const MONEY_ADMIN: readonly LifeOpsCategorySpec[] = [
  { id: "license_renewal", group: "money_admin", label: "免許の更新", cyclic: false, defaultMaxLevelHint: "L1", typicalRiskFlags: [], placeQueryHint: null, mvp: false },
  { id: "passport_renewal", group: "money_admin", label: "パスポートの更新", cyclic: false, defaultMaxLevelHint: "L1", typicalRiskFlags: [], placeQueryHint: null, mvp: false },
  { id: "tax_filing", group: "money_admin", label: "確定申告", cyclic: false, defaultMaxLevelHint: "L1", typicalRiskFlags: [], placeQueryHint: null, mvp: false },
];

/** 全カテゴリ（群横断・定義順）。 */
const ALL_CATEGORIES: readonly LifeOpsCategorySpec[] = [...BODY_APPEARANCE, ...PRE_EVENT_PREP, ...DAILY_UPKEEP, ...MONEY_ADMIN];

/** カテゴリ id → spec（正本辞書）。 */
export const LIFE_OPS_CATEGORY_MODEL: Record<LifeOpsCategoryId, LifeOpsCategorySpec> = Object.fromEntries(
  ALL_CATEGORIES.map((s) => [s.id, s])
) as Record<LifeOpsCategoryId, LifeOpsCategorySpec>;

/** id → spec（runtime 防御: 未知 id は undefined）。 */
export function getCategorySpec(id: string): LifeOpsCategorySpec | undefined {
  return ALL_CATEGORIES.find((s) => s.id === id);
}

/** 全カテゴリ（定義順）。 */
export function listCategories(): readonly LifeOpsCategorySpec[] {
  return ALL_CATEGORIES;
}

/** MVP 対象のみ（A.9: 美容院・眉）。 */
export function listMvpCategories(): readonly LifeOpsCategorySpec[] {
  return ALL_CATEGORIES.filter((s) => s.mvp);
}

/** group で絞り込む（群拡張に備えた汎用 helper）。 */
export function listByGroup(group: LifeOpsCategoryGroup): readonly LifeOpsCategorySpec[] {
  return ALL_CATEGORIES.filter((s) => s.group === group);
}

/** 医療/健康センシティブか（後続の医学的助言/自動提案抑止の判定用）。未知 id は false。 */
export function isHealthSensitive(id: string): boolean {
  return getCategorySpec(id)?.typicalRiskFlags.includes("health_sensitive") ?? false;
}
