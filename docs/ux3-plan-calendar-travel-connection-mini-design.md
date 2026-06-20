# UX-3 — /plan CalendarTab × Travel Day Detail 接続 mini-design

- **日付**: 2026-06-21
- **担当**: Build Unit（設計）／ **承認待ち**: CEO
- **種別**: **docs-only 設計書**（本書では実装・DB migration・Supabase 書込・production flag ON・push/deploy を行わない）
- **正本**: CEO 承認済み `docs/final-aneurasync-travel-location-notes-connection-plan.md`（2026-06-20）。本書はその **§4「Calendar 接続」の /plan CalendarTab 版（fixture・UI 配線のみ）**。
- **CEO 今セッション指示**: 「日にち選択 → travel 画面」「week/月 切替スイッチの両モードで動作」「本丸の前の最初の画面（特定の日程文言）と接続」「**最新状態を失わない**（退化ゼロ）」。**ロジック接続（実データ/engine）は今セッション予定なし＝fixture のまま**。

---

## 1. スコープ

- **IN**: faraday の travel UI（fixture 駆動）を `/plan` CalendarTab の選択日から開く配線。week/month 両対応。flag OFF 既定。**退化ゼロ**。
- **OUT（今セッション非対象）**: 実データ / DB / migration / Supabase 書込 / production / main push / 実 engine 接続（Connection Plan の Phase C 以降・別ゲート G-DB）。`lib/coalter/travel` の objective engine も**接続しない**（CoAlter 監査で確認済の dead 温存方針を継続）。

## 2. 取込方式（別起点・whole-merge 厳禁）

faraday は merge-base `b1393b970`（ffbb9996a の祖先）= ffbb9996a の shift 成果を持たない。**whole-branch merge は退化＝厳禁**。UX-1/UX-2 と同じ **path 単位・additive 取込**。

### 2.1 取込対象（faraday `543b7e49` 由来・約35ファイル・全て新規 A）
- `app/(culcept)/calendar/_components/travel/*`: `TravelDayDetail`（full-screen shell）/ `ConciergeDashboard` / 6画面（Schedule/Reservations/Meal/Budget/Move）/ `TravelMapModal` / `RouteMapPreview` / `PhotoSlot` / `concierge/{icons,primitives}` / `state/ItineraryContext` / `screenProps`
- `app/(culcept)/calendar/_components/travel/locationNotes/*`: `LocationNotesScreen` / 8 View / `cards` / `TopTabBar` / `LocationDetailSheet` / `viewTypes`
- `app/(culcept)/calendar/_lib/travel/*`: `types` / `sampleTrip`（fixture 旅行日 **2026-06-24〜26 京都**）/ `locationNotesData` / `itineraryConvert` / `flags`
- global: `app/layout.tsx`（serif フォント2種 `Noto_Serif_JP` + `Cormorant_Garamond`・additive）/ `tailwind.config.ts`（`serif` / `serif-latin` fontFamily・additive）

### 2.2 配置方針（論点1）
**`/calendar` 配下のまま取込**を推奨。理由: faraday の travel は内部相対 import（`../../_lib/travel/types` 等）で密結合。`/plan` へ移動すると全 import の書換が必要＝大量改修・退化リスク。`/calendar` route 自体は hidden/redirect 方針（decision-log:15542）でも、**コンポーネントは `/plan` CalendarTab から import 可能**。`getSampleTripDay` 等の純データも同様。

## 3. CalendarTab 接続設計（退化ゼロ）

### 3.1 既存資産（/plan CalendarTab・base ffbb9996a）
- `selectedDate` state（L190）— **week strip / month grid 両モード共通**
- `viewMode`（L191・week ⇄ month toggle = CEO の言う「切替スイッチ」）
- 選択日エリア（L885〜: `selectedDayAnchors` 表示 + FAB）

### 3.2 配線（faraday §4 を /plan で fixture 実装）
1. CalendarTab の `selectedDate` → `getSampleTripDay(selectedDate)`（fixture・旅行日 6/24-26 のみ非 null・dev/flag ON 限定）
2. 旅行日 ∧ flag ON → 選択日エリアに **「旅の詳細を見る」ボタン**（= faraday DayDetailSheet L130 の入口・日程文言は CalendarTab 選択日の日付表示が担う）
3. ボタン → `TravelDayDetail`（full-screen overlay・fixture trip/day・`onClose`）
4. **flag OFF or 非旅行日 → ボタン非表示 = 現 CalendarTab 完全不変**（退化ゼロ）
5. **week/month 両対応**: `selectedDate` は両モード共通 → 配線は1箇所で両モード自動対応

### 3.3 DayDetailSheet の扱い（論点2）
faraday の `DayDetailSheet.tsx`（/calendar 固有・433行）は「選択日の詳細シート」（日程文言 L107 + travel ボタン L130 + 他詳細）。/plan CalendarTab の選択日エリアが**既に日付選択 + 予定表示**を担うため、**DayDetailSheet 全体は取り込まず、CalendarTab 選択日エリアに travel ボタンのみ直付け**を推奨（最小・退化ゼロ）。CEO の「最初の画面の日程文言と接続」は CalendarTab 選択日の日付表示が満たす。

## 4. flag（論点3）

- faraday 現方式: `isTravelDayDetailEnabled()` = `process.env.NODE_ENV !== "production"`（**dev 常時 ON / production hard block**・Candidate Lens 方式）
- **提案**: Battery/CoAlter と揃え **env flag（OFF 既定・明示 ON）** に変更（例 `NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED`）。理由: CEO 方針「全 flag OFF 既定・本番表示は別 GO」と整合。dev でも明示 ON にしないと出ない（誤表示防止）。production hard block は維持。

## 5. global serif フォント（論点4）

`layout.tsx` + `tailwind.config.ts` への serif 追加は **additive**（既存 sans/mono 不変・serif を使う travel 画面だけ変わる・他画面は無影響）。**そのまま取込**を推奨。

## 6. 実装段階（CEO 承認後）

- **UX-3a**: travel path 取込（§2.1）+ global serif + flag 整備 + tsc（CalendarTab 未配線＝travel は dead・現状完全不変）
- **UX-3b**: CalendarTab 選択日 → TravelDayDetail 配線（§3）+ tsc/test/smoke（week/month 両モードで旅行日に travel ボタン）

各段: flag OFF 既定・production/Supabase 不触・staged 機械検証 commit・backup push。

## 7. 論点（CEO 確認事項）

| # | 論点 | 推奨 |
|---|---|---|
| 1 | travel UI 配置 | `/calendar` 配下温存（内部 import 不変・最小） |
| 2 | DayDetailSheet | 取り込まず CalendarTab 選択日エリアに travel ボタン直付け（最小・退化ゼロ） |
| 3 | flag 方式 | env flag OFF 既定に変更（CEO 方針整合・誤表示防止） |
| 4 | global serif | additive 取込（他画面無影響） |
| 5 | fixture 旅行日 | 6/24-26 京都（faraday 固定）でデモ。それ以外の日は通常表示 |

## 8. 退化ゼロの担保

- CalendarTab 現状（選択日エリア・week/month toggle・予定表示・FAB）は**不変**。travel ボタンは flag ON ∧ 旅行日のみ**追加表示**
- travel UI は `/calendar` 配下温存＝内部 import 不変・既存 `/calendar` route（hidden 方針）に追加影響なし
- global serif は additive（既存フォント不変）
- 別起点 path 単位取込＝ffbb9996a の shift/candidate lens 成果に不触

---

## 付録 — 参照
- 正本: `docs/final-aneurasync-travel-location-notes-connection-plan.md`（CEO 承認・Phase A→G）
- faraday: `claude/compassionate-faraday-d7918a` @`543b7e49`（origin backup `backup/compassionate-faraday-d7918a-20260620`）
- 関連メモリ: `project_travel-concierge-preview` / `project_plan-tab-integration-worktree` / `project_travel-mode-direction`
