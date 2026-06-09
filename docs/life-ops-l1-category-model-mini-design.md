# Life Ops L-1 — 生活行動カテゴリ模型（身体・外見メンテ）mini-design【実装 GO・pure・stop gate でない】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`・main `05b172e4` 上）
> 参照（**これだけ**）: `docs/life-ops-boundary-and-handoff.md` §2 L-1 / §4 統合契約 / §5 CEO ゲート / Appendix A（原案）。
> 横エンジン計画（`reality-secretary-os-unbuilt-roadmap.md`）は**参照しない・触らない**（本流の担当）。
> **方針（CEO 2026-06-09）**: L-1/L-2 は pure ゆえ stop gate でない → 計画→精査→実装→次を自律。**L-3 Candidate Engine 実装の手前で停止**（体験直結・横エンジン接続の設計監査ゲート）。

---

## 0. 一行
L-1 は「生活行動カテゴリの**正本語彙**」を pure 型＋定数で定義する。**身体・外見メンテ群**から、MVP は**美容院・眉**（Appendix A.9）。
due 判定・周期・候補生成・予約・UI は**作らない**（後続 L-2〜L-9・§4 で横エンジンへ接続）。

## 1. audit 結果（新規であることの確証）
- `LifeOpsCandidate` / `LifeOpsCategory` / 生活行動カテゴリ模型 = **コードベース 0 件**（grep 済）。`lib/lifeops` = **無し**（新規 home）。
- **流用禁止**（別物・新規）: `lib/plan/categoryInferenceMap.ts`=`LocationCategory`（home/office/cafe… 8 値の**場所**分類）/ `lib/plan/reality/candidate-*`=プラン提案 accept/dismiss/later（§3）。

## 2. スコープ（最小・厳守）
**作る**: 身体・外見メンテ群のカテゴリ語彙（id/label/group/周期性 bool/既定実行レベル**ヒント**/典型リスク/店舗検索語ヒント/MVP フラグ）+ pure helper。
**作らない（後続スライス・§4 で横を consume）**:
| 非スコープ | 担当 |
|---|---|
| 周期 cadence・「前回◯日経過」・**美容院の menu 別 sub-cadence（カット/カラー/トリートメント）** | **L-2** |
| 「何が due か」生成 → `LifeOpsCandidate[]` | **L-3（設計監査ゲート）** |
| 予定前準備検出 | **L-4** |
| 店舗探索（Places）/予約導線/入力補助 | **L-6（CEO ゲート・外部 API）** |
| カテゴリ別 Permission 表（正本 Level は横 R5） | **L-7** |
| Life Ops UI / 結果→周期更新 | **L-8 / L-9** |
| 記憶・配置・trigger の machinery | **横エンジン R1/R2/R4**（再実装禁止・import もしない） |

## 3. 型骨格（実装 `lib/lifeops/category-model.ts`）
```ts
/** 生活行動の大分類（A.6 の 6 群。L-1 は body_appearance のみ spec 定義・他群は将来 union 追加）。 */
export type LifeOpsCategoryGroup =
  | "body_appearance" | "daily_upkeep" | "pre_event_prep"
  | "money_admin" | "relationship" | "growth";

/** 身体・外見メンテ群（A.6 群 1）。beauty_salon は menu 別 sub-cadence を持たず L-2 が担う。 */
export type BodyAppearanceCategoryId =
  | "beauty_salon" | "eyebrow" | "nail" | "eyelash" | "hair_removal"
  | "bodywork" | "dental" | "health_check" | "eye_care" | "medication";

export type LifeOpsCategoryId = BodyAppearanceCategoryId; // 将来 union 追加

/**
 * 既定実行レベル上限の **ヒント**（A.5 L0–L5 の段階）。**正本ではない**:
 *   汎用 Level 正本＝横 R5・カテゴリ別 Permission 表＝L-7。本値は L-7 の出発点となる中立ヒント。
 *   L0 記録のみ / L1 時期通知 / L2 候補提案 / L3 予約導線まで誘導 / L4 入力補助(確定は本人) / L5 許可範囲内 自動予約。
 */
export type LifeOpsDefaultMaxLevelHint = "L0"|"L1"|"L2"|"L3"|"L4"|"L5";

/** 自動予約を抑止すべきリスク（A.4 ＋ health_sensitive）。立つカテゴリは Phase3-4 で確認画面必須＝stop gate の種。 */
export type LifeOpsRiskFlag =
  | "first_visit" | "high_cost" | "cancellation_fee" | "personal_info"
  | "card_required" | "nomination" | "long_session" | "far_location"
  | "appearance_change"
  | "health_sensitive"; // 医療/健康系: 医学的助言/健康効果断定/処方薬自動 を後続で抑止する種

/** カテゴリ 1 件（**中立な語彙**・「やるべき/due」は持たない＝L-3 の責務）。 */
export interface LifeOpsCategorySpec {
  readonly id: LifeOpsCategoryId;
  readonly group: LifeOpsCategoryGroup;
  readonly label: string;                              // 日本語 UI ラベル
  readonly cyclic: boolean;                            // 周期管理し得るか（cadence は L-2）
  readonly defaultMaxLevelHint: LifeOpsDefaultMaxLevelHint; // 非正本・L-7 への出発点
  readonly typicalRiskFlags: readonly LifeOpsRiskFlag[];
  readonly placeQueryHint: string | null;              // §4 placeQuery? の素・文字列のみ・API 叩かない
  readonly mvp: boolean;                               // A.9: 美容院・眉から
}
```
helper（pure）: `getCategorySpec(id)` / `listCategories()` / `listMvpCategories()` / `listByGroup(group)` / `isHealthSensitive(id)`。

## 4. データ（身体・外見メンテ群・level は cosmetic=L3 / medical=L1–2 で原則分離）
| id | label | cyclic | defaultMaxLevelHint | typicalRiskFlags | placeQueryHint | mvp |
|---|---|---|---|---|---|---|
| beauty_salon | 美容院 | ✓ | L3 | appearance_change, nomination, personal_info | 美容室 | ✓ |
| eyebrow | 眉 | ✓ | L3 | personal_info | 眉サロン | ✓ |
| nail | ネイル | ✓ | L3 | personal_info, long_session | ネイルサロン | — |
| eyelash | まつ毛 | ✓ | L3 | personal_info | まつ毛サロン | — |
| hair_removal | 脱毛 | ✓ | L3 | high_cost, cancellation_fee, personal_info, card_required | 脱毛サロン | — |
| bodywork | 整体・マッサージ | ✓ | L3 | personal_info | 整体 | — |
| dental | 歯医者 | ✓ | L2 | personal_info, **health_sensitive** | 歯科 | — |
| health_check | 健康診断 | ✓ | L1 | personal_info, **health_sensitive** | 健診 | — |
| eye_care | 眼科・コンタクト | ✓ | L2 | personal_info, **health_sensitive** | 眼科 | — |
| medication | 薬・サプリ補充 | ✓ | L1 | **health_sensitive** | （null） | — |

設計判断: 美容/wellness=L3（予約導線可・riskFlag が auto を阻止）、医療=L1–2（通知/候補のみ・人間制御を厚く）。

## 5. §4 統合契約との接続
L-1 は `LifeOpsCandidate.category` の**語彙正本**を供給するだけ。candidate 生成（dueReason/suggestedWindow/placeQuery/permissionLevel/riskFlags）は **L-3** が本模型を読んで組み、**横 R2/R4** に渡す。`placeQueryHint`=L-6 検索語の素（文字列のみ）、`defaultMaxLevelHint`/`typicalRiskFlags`=L-7 と §5 安全設計の素。

## 6. 厳守事項
- **pure・no-DB・新規データ収集なし・外部 API なし**（placeQueryHint は固定文字列）。
- 横エンジン（`lib/plan/reality/*`）を **import しない**。**UI なし**。barrel 非 export。
- **「やるべき/due」を断定しない**（中立語彙）。本流 R1-5 の CEO 補正（accept≠成功・断定しない）を Life Ops でも継承。
- **health_sensitive**: 医療系で医学的助言/健康効果断定/処方薬の自動提案を後続が抑止する種（philosophy「断定しない」と整合）。
- CEO ゲート（§5）: L-1 は該当なし（pure 語彙）。Phase 3–4 は stop gate。

## 7. テスト（`tests/unit/lifeops/lifeOpsCategoryModel.test.ts`）
- 全 spec が `group="body_appearance"`・id 一致・label 日本語非空。
- `listMvpCategories()` = `beauty_salon`/`eyebrow` の **2 件のみ**。
- `defaultMaxLevelHint` は L0–L5。`placeQueryHint` は文字列 or null。
- health_sensitive が **医療 4 つ**に立ち、**美容系には立たない**。`isHealthSensitive()` 整合。
- 美容院に `appearance_change`、脱毛に `cancellation_fee`/`high_cost`。
- `getCategorySpec(未知 id)` = undefined（runtime 防御）。

## 8. 次スライス
L-1 着地 → **L-2 美容系 cadence 模型**（pure・cyclic カテゴリの既定間隔型 + **beauty_salon の menu 別 sub-cadence**・lastCompletedAt から softDue/hardDue を計算する pure helper・**due を断定しない status**・MVP=美容院/眉のみ）→ L-3 mini-design 提出で**停止**（設計監査）。Appendix A.9 優先（①美容→②買い物→③予定前準備）。
