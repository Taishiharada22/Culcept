# Plan / Calendar Outfit — Canonicalization & shared WornHistory Roadmap

**Status:** 現在地の固定（docs-only）。最終更新 2026-05-29。
**Scope:** これは「`/plan` Calendar タブのコーデ推薦体験」と「旧スタンドアロン `/calendar` ルートの縮退」、および両者をつなぐ **shared WornHistory** の現在地と将来計画を固定する文書です。
**※ 命名注意:** `docs/alter-plan-*` は別ドメイン（Alter morning planner）です。本書は **服装/コーデ推薦と着用履歴（WornHistory）** に限定します。

このドキュメントの目的は、後続セッション / Claude が文脈を失い、`saveWornRecord` や shared store write へ**早く進みすぎる**ことを防ぐことです。**write 系・engine read 接続・`/calendar` 削除は、いずれも別の設計ゲートを必須**とします（§9）。

---

## 0. TL;DR（現在地）
- `/plan` の Calendar タブ（`app/(culcept)/plan/tabs/_calendar-outfit/`）を、コーデ体験の **今後の正本 UI** とする。
- 旧 `/calendar` ルートは将来の**縮退/削除候補**。ただし **engine IP・learning source・server-sync はまだ `/calendar` 側に生きている**（§3）。
- shared WornHistory は **ドメイン土台（Phase 3-A）** と **read-view（Phase 3-B-B）** までを実装済み。**まだ書き込みも runtime 接続もしていない**（§8）。
- **learned 昇格は HOLD**（§7）。

---

## 1. `/plan` を今後の正本 UI にする
- コーデ推薦・理由・ワードローブ分析・当日文脈・選択・着用・評価・取り消し・日付ドットは、すべて `/plan` Calendar タブ（`_calendar-outfit/`）に集約済み。
- UI 表層はすでに `/plan` が canonical。新規 UI は最小限に保つ（情報過多・上品さ毀損を避ける CEO 方針）。

## 2. `/calendar` は将来的に縮退/削除候補
- 旧 `/calendar`（`app/(culcept)/calendar/`：1560 行 client + 22 components + 26 `_lib` + 9 API routes）は、UI としては `/plan` に置き換わる前提。
- 月グリッド UI（`CalendarPageClient`/`DayCell`/`DayDetailSheet`/`WeekAtmosphereBar`）は原則**移植しない**（`/plan` の day-strip + Flow リストで代替）。

## 3. ただし `/calendar` の以下はまだ「生きている」
削除・改変してはならない現行資産（Phase 5〜7 まで残す）:
- **推薦エンジン IP**：`app/(culcept)/calendar/_lib/outfitEngine.ts`（`generateDayProposal`）/ `proposalAxisChips` / `itemSubstitution` / `personaBoost` / `riskAnalysis` / `regretPredictor` / `vc*`。`/plan` は **facade `@/lib/shared/outfitEngine` 経由**で利用中（`/calendar/_lib` 直 import は禁止）。
- **学習正本（learning source）**：`culcept_calendar_worn_v1`（+ `_session` fallback）。`rotationTracker.ts` の `saveWornRecord` / `loadWornHistory`、`satisfactionLearner`、`comboGraph` が消費。
- **server-sync**：`PUT /api/calendar/day` → Supabase `calendar_outfits`。
- これらは `/plan` が canonical learning を持つまで（Phase 5）は **`/calendar` 側が正本**。

## 4. Local Diary Phase 1（完了）
`/plan` に**隔離 store のみ**で実装（学習・server・shared には未接続）。
| 機能 | 実装 | commit |
|---|---|---|
| 選択 store | `outfitSelectionStore.ts`（key `culcept_plan_outfit_selection_v1`） | `85a7495b` |
| 選択の日次永続化/復元 | carousel/section/dashboard 配線 | `c5beac70` |
| 着用 store（隔離） | `wornStore.ts`（key `culcept_plan_worn_v1`） | `6efc55bb` |
| 「今日これを着た」確認 UI | OutfitCard/Carousel | `7e04e662` |
| 評価（よかった/微妙） | `rateWornForDate`（隔離・学習なし） | `39a22e3d` |
| diary 状態 UI 仕上げ | OutfitCard | `969739d1` |
| 着用取り消し（undo） | `clearWornForDate` | `ca7bff80` |
| diary 日付ドット | `DaySelectorStrip`（read-only 集約 `diaryDayStatus.ts`） | `61d83c0a` |
| 非 active 選択マーカー | OutfitCard | `3e150794` |

## 5. Phase 3-A — shared WornHistory ドメイン土台（完了, commit `37782c59`）
`lib/shared/wornHistory/`（**pure・storage/runtime 非接続**）:
- **canonical type** `WornHistoryEntry`：`{ date, wornAt, ratedAt?, itemIds[], satisfaction?:1-5, source:"engine"|"mock"|"hydrated_mock"|"calendar_form", origin:"plan"|"calendar", learningEligible }`（`types.ts`）。
- **eligibility** `computeLearningEligibility` / `recomputeLearningEligibility` / `isSatisfactionLevel`（`eligibility.ts`）。
- **converters** `planWornRecordToEntry` / `calendarWornRecordToEntry`（構造的 mirror 入力型・`/calendar/_lib` 非 import）（`converters.ts`）。
- **conflict policy** `resolveWornHistoryConflict` → `use_existing_calendar` / `use_plan_diary` / `needs_confirmation` / `skip_learning`（`conflictPolicy.ts`）。

## 6. Phase 3-B-B — shared WornHistory read-view（完了, commit `8de7e4d4`）
`lib/shared/wornHistory/readView.ts`（**read-only・新 key なし・write ゼロ**）:
- **pure** `buildWornHistoryView({planRecords, calendarRecords, knownWardrobeIds})` → `WornHistoryView { entries(1/date,date-desc), learningCorpus(eligible,1-source/date), conflicts }`。
- **IO シェル**（async）`loadWornHistoryView` / `getWornHistoryEntryForDate` / `getLearningCorpus`。
- **dual-read**：plan は `culcept_plan_worn_v1` を read-only、calendar は **facade `loadWornHistory()` を dynamic import**（engine を static graph に持ち込まない）。非ブラウザ/facade 失敗は **fail-open**（plan-only/空）。
- **learning corpus 正式ルール（CEO 確定）**：
  ```
  corpus に入れてよい：
    - origin==="calendar" && source==="calendar_form" && satisfaction あり        ← 現行 learning source
    - origin==="plan"     && source==="engine"        && satisfaction あり && 実 itemIds
  corpus に入れてはいけない：
    - source==="mock"
    - source==="hydrated_mock"
  ```
  `calendar_form` を corpus 対象に**含める**のが正（`culcept_calendar_worn_v1` は現行の学習正本であり、除外すると現行学習資産を無効化してしまうため）。「engine のみ」制約は主に `/plan` 側の `mock`/`hydrated_mock` 排除の趣旨。

## 7. learned 昇格は HOLD
- `/plan` の隔離 record を「学習対象」に昇格する（= engine が `/plan` 由来 record を学習する）ことは **HOLD**。
- read-view の `learningCorpus` は**読み取り表現**であり、engine への接続はしていない（§8）。

## 8. まだ未接続（触れていない）
- `saveWornRecord`（calendar 学習 write）／`culcept_calendar_worn_v1` への write
- shared store **write**（新 key `culcept_worn_history_v1` は**未作成**）
- server-sync（`/api/calendar/day`）／Supabase／DB／migration
- engine runtime からの `getLearningCorpus` 読み取り（Phase 5）
- API route 新設／server action 新設／UI 接続（read-view を消費する UI はまだ無い）

## 9. 次に進む時のゲート（重要）
- **write 系（shared store write / dual-write / `saveWornRecord` / server-sync / Supabase）→ 必ず設計ゲートで停止**。
- **engine read 接続（engine が shared WornHistory を読む, Phase 5）→ 別ゲート**。
- **`/calendar` 削除（redirect/hide/physical removal）→ 別ゲート**。
- pure / read-only / no-runtime / no-write の小変更は、設計報告で止めず実装+commit まで進めてよい（CEO 速度方針）。上記 3 種に触れる場合のみ設計ゲート必須。

## 10. Deferred smoke（実機確認の積み残し）
現環境は CEO ブラウザが `/baseline` に回されるため、実 wardrobe/calendar データの体験確認が保留中:
- **B-1 実画像**：`/plan` コーデカードが実ワードローブ画像で表示されるか。
- **B-2 実天気**：保存済み居住地で Open-Meteo 実天気が反映されるか。
- **local diary UI 実機**：選択→着用→評価→取り消し→日付ドット→非 active マーカーの一連。
- **read-view facade 実読み**：`loadWornHistoryView({includeCalendar:true})` が client 実環境で calendar 履歴を facade 経由で正しく読むか（unit は facade mock で固定済み、実読みは未確認）。

## 11. Future roadmap（Phase 4 以降・すべて HOLD）
| Phase | 内容 | 主なゲート |
|---|---|---|
| **4** | shared store **write / dual-write**：新 key `culcept_worn_history_v1` を新設。`/plan` が canonical へ書く。旧 key（plan/calendar）は rollback 用に温存。**初の learned 解禁はここ**。`②plan key in-place 変形は禁止`（rollback 喪失のため）。 | write 設計ゲート |
| **5** | **engine reads shared WornHistory**：engine の `loadWornHistory` を `getLearningCorpus` に差し替え。`/calendar` 直読み廃止。server-sync を shared に一本化。 | engine read ゲート |
| **6** | `/calendar` redirect or hide（consumer 付け替え完了後）。 | `/calendar` 撤退ゲート |
| **7** | `/calendar` physical removal（engine/学習を `lib/shared` へ移送済が前提）。 | 削除ゲート |

**Phase 3-B 方針確定（参考）**：store モデルは **③ dual-read merge**（新 key を作らず読み時に canonical へ束ねる）で確定。物理 write key（①新規）は Phase 4。②（plan key 昇格）却下。④（docs 化）= 本書。

---

## Appendix A — store inventory（現状）
| key | 役割 | shape | 学習接続 | 区分 |
|---|---|---|---|---|
| `culcept_plan_outfit_selection_v1` | `/plan` 選択（意図） | `CalendarOutfitSelection` | なし | WornHistory 対象外 |
| `culcept_plan_worn_v1` | `/plan` 着用 diary（結果） | `PlanWornRecord` | なし（隔離） | dual-read の plan ソース |
| `culcept_calendar_worn_v1`(+`_session`) | `/calendar` 着用＝現行学習正本 | `WornRecord{date,itemIds,satisfaction(必須),note?}` | **あり**（learner/combo/rotation/server-sync） | dual-read の calendar ソース（facade 経由） |
| `culcept_worn_history_v1` | （未作成）shared canonical write home | `WornHistoryEntry[]` 予定 | — | **Phase 4 で新設予定** |
| (`culcept_wear_records_v1`) | My-Style cost-per-wear | 別ドメイン | — | 対象外 |

## Appendix B — 不変条件（read-view 実装で守られていること）
- 新規 localStorage key 0 / localStorage write 0 / IndexedDB 0。
- `saveWornRecord` 呼び出し 0 / `culcept_calendar_worn_v1` write 0。
- `/calendar/_lib` 直 import 0（calendar は facade `loadWornHistory()` のみ）。
- engine runtime 接続 0 / server-sync 0 / Supabase 0 / API route 0。
- `mock` / `hydrated_mock` は learning corpus に入らない（test 固定）。
