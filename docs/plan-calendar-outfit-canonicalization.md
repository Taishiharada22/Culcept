# Plan / Calendar Outfit — Canonicalization & shared WornHistory Roadmap

**Status:** 現在地の固定（docs-only）。最終更新 2026-05-30。
**Scope:** これは「`/plan` Calendar タブのコーデ推薦体験」と「旧スタンドアロン `/calendar` ルートの縮退」、および両者をつなぐ **shared WornHistory** の現在地と将来計画を固定する文書です。
**※ 命名注意:** `docs/alter-plan-*` は別ドメイン（Alter morning planner）です。本書は **服装/コーデ推薦と着用履歴（WornHistory）** に限定します。

このドキュメントの目的は、後続セッション / Claude が文脈を失い、`saveWornRecord` や shared store write へ**早く進みすぎる**ことを防ぐことです。**write 系・engine read 接続・`/calendar` 削除は、いずれも別の設計ゲートを必須**とします（§9）。

---

## 0. TL;DR（現在地）
- `/plan` の Calendar タブ（`app/(culcept)/plan/tabs/_calendar-outfit/`）を、コーデ体験の **今後の正本 UI** とする。
- 旧 `/calendar` ルートは将来の**縮退/削除候補**。ただし **engine IP・learning source・server-sync はまだ `/calendar` 側に生きている**（§3）。
- shared WornHistory は **ドメイン土台（3-A）** + **read-view（3-B-B）** + **canonical write（4-1 /plan, `5c961f7e`）** + **read-view union merge（4-2, `af53e7b4`）** + **calendar mirror（4-3, `0db62f91`）** + **style 型基盤/read（4-4a `fba415e1`・4-4b `2b65b4dc`）** + **wearEvents mirror（4-4c, `bd1597e9`）** を実装済み。**＝主要3系統（/plan・/calendar・My-Style/Home）が canonical に shadow mirror 済み**。**engine runtime 接続・learned 昇格はしていない**（§7-8）。
- **learned 昇格は HOLD（初解禁は Phase 5）**（§7）。

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
- **Phase 4-1（canonical shadow mirror）でも昇格しない**。canonical entry は `learningEligible` を保存するが、engine はこの canonical を読まない。**learned 初解禁は Phase 5**。

## 8. まだ未接続（触れていない）
- `saveWornRecord`（calendar 学習 write）／`culcept_calendar_worn_v1` への write
- shared store **write**：`/plan`→canonical（Phase 4-1）+ `/calendar saveWornRecord`→canonical（Phase 4-3）の **shadow mirror は実装済**。**My-Style / Home morning の `wearEvents`→canonical mirror は未**（§12 の必須課題）。`/api/calendar/day` server-sync 一本化も未
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

## 11. Future roadmap（Phase 5 以降・すべて HOLD）
| Phase | 内容 | 主なゲート |
|---|---|---|
| **4-1** | **canonical shadow mirror（実装済 commit `5c961f7e`）**：新 key `culcept_worn_history_v1` を新設し、`/plan` の着用 diary を mirror。旧 key 温存・read-view は旧 key のまま＝UX 不変・**learned 解禁しない**。 | write 設計ゲート（通過） |
| **4-2** | **read-view canonical union merge（実装済 commit `af53e7b4`）**：read-view が `canonical ∪ old plan ∪ old calendar` を union merge。同 (date, origin) は canonical 優先・**canonical-only ではない**・**backfill しない**・`includeCanonical` kill switch あり・**learned は Phase 5 まで HOLD**。 | read flip ゲート（通過）|
| **4-3** | **calendar save path canonical shadow mirror（実装済 commit `0db62f91`）**：`/calendar` の `rotationTracker.saveWornRecord` を canonical へ mirror（origin=calendar / source=calendar_form / note 非持越）。old calendar key 維持・server-sync 不変・learned HOLD・**backfill なし**・**My-Style/Home `wearEvents` は対象外（§12）**。 | calendar write ゲート（通過）|
| **4-4a** | **style wear 型基盤（実装済 commit `fba415e1`）**：`origin="style"` / `source="my_style"` + `wearEventToEntry` + writeStore validation。`my_style` は satisfaction があっても `learningEligible=false`。配線・readView 統合なし。 | 型ゲート（通過）|
| **4-4b** | **style wear read-view 統合（実装済 commit `2b65b4dc`）**：readView が `origin=style` を `slot.style` に受け、 **最下位 fallback**（style 単独日だけ代表・corpus 非対象）。conflictPolicy 本体不変・`includeCanonical` で無視可。**`wearEvents.ts` mirror 配線は未（4-4c）**。 | read ゲート（通過）|
| **4-4c** | **wearEvents canonical shadow mirror（実装済 commit `bd1597e9`）**：`saveWearEvent`/`updateWearSatisfaction` を canonical へ best-effort mirror（origin=style / source=my_style / `learningEligible` 常に false）。**同日複数 wearEvent は (date, origin=style) で 1 件に集約（最後が代表）**。old key 維持・backfill なし・server-sync 不変・learned HOLD。calendar-source の event は style として誤ラベルしないため除外。 | wearEvents write ゲート（通過）|
| **5** | **engine reads shared WornHistory + learned 解禁**：engine の `loadWornHistory` を `getLearningCorpus` に差し替え。`/calendar` 直読み廃止。server-sync を shared に一本化。**learned 昇格はここで初解禁**（`②plan key in-place 変形は禁止`＝rollback 喪失のため）。 | engine read / learned ゲート |
| **6** | `/calendar` redirect or hide（consumer 付け替え完了後）。 | `/calendar` 撤退ゲート |
| **7** | `/calendar` physical removal（engine/学習を `lib/shared` へ移送済が前提）。 | 削除ゲート |

**Phase 3-B 方針確定（参考）**：store モデルは **③ dual-read merge**（新 key を作らず読み時に canonical へ束ねる）で確定。物理 write key（①新規）は Phase 4。②（plan key 昇格）却下。④（docs 化）= 本書。

---

## 12. canonical-only flip 前の必須課題（記録 — Phase 4-3 で発見）
**`culcept_calendar_worn_v1` は `/calendar` 専用ではない。** My-Style + Home morning も `lib/shared/wearEvents.ts` の `saveWearEvent` / `updateWearSatisfaction`（`source:"my-style"`）で同 key に書く（呼出元: `my-style/_components/TodaysMirror` / `WeatherOutfitPanel` / `components/home/morning/MorningOutfitCard`）。
- Phase 4-3 は **`/calendar` の `saveWornRecord` のみ** canonical mirror した。**My-Style/Home の `wearEvents` 経由 wear は canonical に入らない**（意図的にスコープ外）。
- **進捗（4-4 完了）**：4-4a 型基盤（`fba415e1`）+ 4-4b readView 統合（`2b65b4dc`）+ 4-4c wearEvents mirror（`bd1597e9`）**完了**。My-Style/Home wear は **これ以降 canonical（origin=style）に蓄積される**（4-4c 以前の legacy 分は old key にのみ存在 → 下記 backfill 課題）。
- **残る backfill 課題**：4-1/4-3/4-4c **以前**に old key へ書かれた wear（plan/calendar/my-style いずれも）は canonical に未蓄積。canonical-only flip（Phase 5+ で old key read 廃止）の前に、legacy 一括 backfill を別ゲートで決める（§7 の provenance 復元不能性に留意。 origin 判別不能な legacy をどう扱うか要設計）。
- **読みは現状安全**：read-view の calendar source は `loadWornHistory()`（同 key 全体）なので、My-Style/Home wear も `calendar_form` として 4-2 union read で既に読めている。
- **⚠️ canonical-only flip（Phase 5+ で old calendar key の read を廃止）する前に、My-Style/Home `wearEvents` を canonical へどう移すか（別 origin 新設 / mirror / backfill）を別ゲートで必ず解く。** 解かずに old key read を切ると、canonical に無い My-Style/Home wear が消失する。
- 補足: My-Style wear は通常 satisfaction なし → 学習対象化しないが、satisfaction 付き経路（`WeatherOutfitPanel`）が稀に corpus candidate に混じり得る。Phase 5 の corpus hygiene で origin 識別が要る（記録のみ）。

---

## 13. Phase 5 — engine read / learned 解禁（設計・段階）
shared WornHistory を engine 学習入力へ接続する段階。**いきなり切替えず段階化**（5-A 設計済）:
| Phase | 内容 | 状態 |
|---|---|---|
| 5-A | engine read / learned 解禁 設計ゲート | 完了（設計） |
| **5-B** | **learning / recency adapter + shadow comparator（pure・runtime 非接続）** | **完了 commit `0f8b0809`** |
| 5-C（設計） | gated engine read switch 設計ゲート（2 読取点 × 用途 2 系統・activation 遅延）| 完了（設計） |
| **5-C1** | **flag + engine input bundle builder + recentlyWorn helper（pure・engine 非接続）** | **完了 commit `2165ba41`** |
| **5-C2** | **facade（A）gated injection（実装済 commit `81859b31`）**：`TodayProposalParams.wornHistoryInput?` 追加。flag on 時のみ `outfitEngineAdapter` が bundle 構築→facade 注入（satisfaction/combo ← learningRecords / recentlyWorn ← recencyRecords・per-field fallback）。**flag default off ＝挙動不変**。B 側 getScoringCache は未接続。 | 未・**flag off 維持**（activation 禁止）|
| **5-C3** | **getScoringCache（B）rotation 注入（実装済 commit `86f09384`）**：`OutfitExtendedOptions.rotationRecords?` 追加。facade が `learningRecords`（**recencyRecords ではない**）を渡し、generateDayProposal 冒頭で scoring cache を per-run prime（getScoringCache 本体・scoreCandidate・rotationTracker は無改変）。**B側に learningRecords を使う理由：`computeRotationProfiles` / `seasonalPersonalBoost`（computeSeasonalStyleProfiles）が `satisfaction` を消費するため**。早期 return でも `clearScoringCache` で漏れ防止。flag default off・**activation は 5-D canary まで禁止**。 | 未・**flag off 維持**（activation 禁止）|
| 5-D | flag を canary で初 on（A+B 配線後）→ 提案変化検証 | 未 |
| 5-E | server-sync 一本化設計 | 未 |

**5-C1 成果物（runtime 非接続）**：
- flag `WORN_HISTORY_FLAGS.engineReadsCorpus(override?)`（既定 false・`NEXT_PUBLIC_WORN_HISTORY_ENGINE_READS_CORPUS` 直接 member access で client 可視・override 最優先）。
- `WornHistoryEngineInput { learningRecords, recencyRecords }` + `buildWornHistoryEngineInput(async)`（knownWardrobeIds 空 / read 失敗 / 両空 → null fallback）。
- `getRecentlyWornItemIdsFromRecencyRecords()`（recency の shared 版・現行 `getRecentlyWornItemIds(7)` 相当）。
- **engine（generateTodayProposal / generateDayProposal / getScoringCache）には未接続**。flag は ON 運用しない。

**activation 安全規則（5-A/5-C 設計）**：A だけ on にすると A/B recency 不一致が本番化するため、**flag は 5-C2/5-C3 では off 維持し、A+B 両配線後（5-D）で初 on**。

**用途分離（5-A 確定・5-B 実装）**：
- 満足度 / コンボ学習 ← `learningCorpus`（source ∈ {engine, calendar_form}・satisfaction 必須）→ `learningCorpusToWornRecords()`
- recency / rotation（着た事実）← `entries`（engine / calendar_form / my_style。 mock / hydrated_mock 除外）→ `wornHistoryEntriesToRecencyWornRecords()`
- shadow 比較 ← `compareWornHistoryLearningInputs()`（counts / boolean summary のみ・log / analytics 非接続）

**engine の worn history 読取は 2 箇所**（5-C で両方を flag 配下に配線）:
1. facade `generateTodayProposal`（satisfaction / combo / recency を引数注入）
2. `outfitEngine.getScoringCache`（rotation profiles を自己 load）

5-B は **pure 基盤のみ**。engine runtime / `loadWornHistory` 差替 / learned / server-sync / backfill には未接続。

---

## 14. Phase 5-D — engine read canary plan（5-D1 docs・flag は未 ON）
shared WornHistory 由来の学習入力を engine が読む（`engineReadsCorpus`）を**初めて ON にする前**の canary 計画。 **5-D1 は docs のみ。 flag ON / env 変更 / runtime override 実装はしない。**

### 14.1 Phase 5-C 完了状態
- 5-C1: flag + engine input builder（`buildWornHistoryEngineInput` / `WornHistoryEngineInput`）。
- 5-C2: A側 facade injection（learningRecords→satisfaction/combo、recencyRecords→recentlyWornIds）。
- 5-C3: B側 rotation/scoring cache injection（learningRecords を per-run prime）。
- **`flag default off` / `activation not started`**。配線は全て **/plan の `outfitEngineAdapter`（flag reader 1 箇所）**経由。`/calendar` は flag/bundle を経由せず**無影響**。

### 14.2 canary 対象の順番（固定）
```
5-D2: local dev smoke
5-D3: preview smoke
5-D4: production canary
```
- **production global flip は禁止**。
- **production allowlist には runtime override / remote flag / user-scoped gate が必要**（現状の global build-time flag 単体では不可）。

### 14.3 flag 運用の現実
`NEXT_PUBLIC_WORN_HISTORY_ENGINE_READS_CORPUS` は **client build に baked される**ため：
- env 変更には **rebuild / redeploy が必要**。
- **即時 rollback ではない**（redeploy 待ち）。
- **production per-user allowlist はこのままでは不可**（全 client が同じ baked 値）。

### 14.4 production canary 前の追加ゲート（5-D4 前の必須判断）
production canary（5-D4）の前に、以下のどちらかを選ぶ：
- **A. runtime override / user-scoped flag を先に作る（推奨）** — blast radius が小さい・即時 kill 可・user-scoped canary 可。既存 `engineReadsCorpus(override?)` の override 口を client runtime toggle（localStorage / URL / remote）に配線する別スライス。
- **B. production global flip を明示承認する** — blast radius 大・rollback に redeploy・engine 提案結果に影響。
- **5-D1 では A を実装しない**（本判断は「5-D4 前の必須判断」として記録のみ）。

### 14.5 観測指標（privacy-safe summary のみ）
**入力層**（5-B `compareWornHistoryLearningInputs` で取得可）：
```
legacyCount / sharedLearningCount / sharedRecencyCount /
learningDelta / recencyDelta /
sharedAddsPlanFeedback / sharedAddsStyleRecency /
excludedMockCount / excludedMyStyleFromLearningCount
```
**出力層**：
```
proposal count / item overlap ratio / SYNC score delta /
confidence delta / fallback count / runtime error presence / empty proposal occurrence
```
- **raw item IDs / note / moodTag / personal text は出さない**（counts / boolean / rounded delta のみ）。

### 14.6 shadow compare 方針
```
local/dev only: runtime compare may be allowed（console summary・手動観測）
production: no compare logging by default
analytics / log persistence: separate gate
```
5-D1 は設計のみ・実装しない。

### 14.7 fallback / rollback
fallback（5-C 実装済）：
```
shared read fail   → old path
bundle null        → old path
learningRecords empty → old learning path
recencyRecords empty  → old recency path
rotation prime fail   → old B path
flag off           → full old path
```
rollback：
```
flag を false に戻す → env を戻す → redeploy する
canonical / localStorage data は消さない（canary は read-only・write 無し）
```
※ runtime override が無い限り **即時 kill ではない**（redeploy 必要）。

### 14.8 GO / NO-GO 基準
**GO**：compile error なし / runtime error なし / fallback 機能 / proposal が空にならない / mock・hydrated_mock・my_style が learning に入らない / my_style は recency にのみ入る / SYNC・confidence が極端に崩れない / flag off で旧 path に戻る。
**NO-GO（即 flag false + redeploy）**：proposal が空 / 同じ服ばかり / mock が learning 混入 / my_style が learning 混入 / runtime error / flag off でも戻らない / fallback 不発。

### 14.9 分割
```
5-D1: canary 設計 docs（本節）← docs-only
5-D2: local/dev smoke checklist（env も触らず手動 + dev-only console compare 可）
5-D3: preview deploy 全体 ON smoke（CEO 検証）
5-D4: production canary（14.4 の A/B 判断後）
```

### 14.10 local dev smoke checklist（5-D2・docs のみ・未実行）
**前提**：
- local dev 限定。 production / preview ではまだ ON にしない。 Vercel env は触らない。
- `.env.local` 変更は**次の実行ゲートまでしない**。 flag ON は 5-D2 docs 完了後、 **CEO 承認を受けて別ステップ**で実施。

**手順案（書くだけ・5-D2 では実行しない）**：
```
1.  working tree clean を確認
2.  baseline（flag off）で /plan を開く
3.  baseline の summary（提案数・コーデ構成の件数・SYNC・confidence）を控える
4.  .env.local に NEXT_PUBLIC_WORN_HISTORY_ENGINE_READS_CORPUS=true を一時追加
5.  dev server を再起動（NEXT_PUBLIC_ は build-time baked のため必須）
6.  /plan を開く
7.  提案が空にならないか確認
8.  fallback / runtime error の有無を確認
9.  flag を false / unset に戻す
10. dev server を再起動
11. baseline 挙動に戻るか確認
```

**観測項目**：
- /plan が compile error なく開く
- 提案が空にならない
- おすすめコーデが表示される
- SYNC score が極端に崩れない
- confidence が極端に崩れない
- fallback / runtime error が出ない
- flag OFF に戻したら旧 path に戻る
- mock / hydrated_mock / my_style が learning に入らない（5-B `compareWornHistoryLearningInputs` summary で確認）
- my_style は recency にのみ効く

**before / after 比較方針（ON/OFF）**：提案数 / コーデのアイテム構成 / SYNC score / confidence / fallback 有無 / runtime error 有無 を比較。**raw item IDs は出さない**（「差分あり/なし」「重なり率」「件数」のみ）。

**failure 時の rollback**：
- `.env.local` から flag を消す → dev server 再起動。
- **canonical / localStorage data は消さない**（rollback でデータ削除は不要・read-only canary）。

**5-D2 の境界**：本節は checklist を docs 固定するのみ。 **flag ON / `.env.local` 変更 / dev smoke 実行は別ゲート（CEO 承認後）**。

---

## Appendix A — store inventory（現状）
| key | 役割 | shape | 学習接続 | 区分 |
|---|---|---|---|---|
| `culcept_plan_outfit_selection_v1` | `/plan` 選択（意図） | `CalendarOutfitSelection` | なし | WornHistory 対象外 |
| `culcept_plan_worn_v1` | `/plan` 着用 diary（結果） | `PlanWornRecord` | なし（隔離） | dual-read の plan ソース |
| `culcept_calendar_worn_v1`(+`_session`) | `/calendar` 着用＝現行学習正本 | `WornRecord{date,itemIds,satisfaction(必須),note?}` | **あり**（learner/combo/rotation/server-sync） | dual-read の calendar ソース（facade 経由） |
| `culcept_worn_history_v1` | shared canonical write home（**Phase 4-1 新設**・shadow mirror） | `WornHistoryEntry[]` | なし（engine 未読・Phase 5 解禁） | dual-write の canonical |
| (`culcept_wear_records_v1`) | My-Style cost-per-wear | 別ドメイン | — | 対象外 |

## Appendix B — 不変条件（read-view 実装で守られていること）
- 新規 localStorage key 0 / localStorage write 0 / IndexedDB 0。
- `saveWornRecord` 呼び出し 0 / `culcept_calendar_worn_v1` write 0。
- `/calendar/_lib` 直 import 0（calendar は facade `loadWornHistory()` のみ）。
- engine runtime 接続 0 / server-sync 0 / Supabase 0 / API route 0。
- `mock` / `hydrated_mock` は learning corpus に入らない（test 固定）。
